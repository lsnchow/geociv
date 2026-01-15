"""Simulation and roleplay endpoints."""

from typing import Optional, Union
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.config import get_settings
from app.models.scenario import Scenario, Cluster
from app.models.simulation import SimulationResult
from app.engine.simulator import CivicSimulator, ScenarioData, ClusterData
from app.engine.exposure import Location
from app.engine.personas import PERSONAS, get_persona, hash_proposal, compute_voice_seed
from app.schemas.proposal import SpatialProposal, CitywideProposal
from app.schemas.simulation import (
    SimulateRequest,
    SimulateResponse,
    CompareRequest,
    CompareResponse,
    ComparisonResult,
)
from app.schemas.llm import (
    PersonaResponse,
    DeterministicBreakdown,
    RoleplayReaction,
    ShowMyWork,
    Assumption,
    GroundedNarrative,
)

router = APIRouter()


# Enhanced simulate request with show_my_work
class EnhancedSimulateRequest(BaseModel):
    """Enhanced simulation request with debug options."""
    
    scenario_id: UUID = Field(..., description="ID of the scenario")
    proposal: Union[SpatialProposal, CitywideProposal] = Field(..., description="The proposal")
    lambda_override: Optional[float] = Field(None, gt=0)
    include_narrative: bool = Field(default=False)
    persona: Optional[str] = Field(None, description="Persona key for roleplay reaction")
    show_my_work: bool = Field(default=False, description="Include full debug transparency")


class RoleplayRequest(BaseModel):
    """Request for persona-based roleplay reaction."""
    
    scenario_id: UUID = Field(..., description="Scenario ID for context")
    proposal: Union[SpatialProposal, CitywideProposal] = Field(..., description="The proposal")
    persona: str = Field(..., description="Persona key (e.g., 'conservative_homeowner')")
    lambda_override: Optional[float] = Field(None, gt=0)


class RoleplayResponse(BaseModel):
    """Response with persona roleplay and deterministic breakdown."""
    
    roleplay: RoleplayReaction
    breakdown: DeterministicBreakdown
    grounded_narrative: Optional[GroundedNarrative] = None


class EnhancedSimulateResponse(BaseModel):
    """Enhanced simulation response with optional persona and debug."""
    
    # Core simulation results
    overall_approval: float
    overall_sentiment: str
    approval_by_archetype: list
    approval_by_region: list
    top_drivers: list
    metric_deltas: dict
    
    # Enhanced features
    persona_response: Optional[PersonaResponse] = None
    show_my_work: Optional[ShowMyWork] = None
    
    class Config:
        from_attributes = True


async def _load_scenario_data(
    scenario_id: UUID,
    db: AsyncSession,
) -> ScenarioData:
    """Load scenario data from database into simulator format."""
    result = await db.execute(
        select(Scenario)
        .where(Scenario.id == scenario_id)
        .options(
            selectinload(Scenario.clusters)
            .selectinload(Cluster.archetype_distributions)
        )
    )
    scenario = result.scalar_one_or_none()
    
    if not scenario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scenario {scenario_id} not found",
        )
    
    clusters = []
    for cluster in scenario.clusters:
        archetype_dist = {
            d.archetype_key: d.percentage
            for d in cluster.archetype_distributions
        }
        
        clusters.append(ClusterData(
            id=cluster.id,
            name=cluster.name,
            location=Location(cluster.latitude, cluster.longitude),
            population=cluster.population,
            archetype_distribution=archetype_dist,
            baseline_metrics=cluster.baseline_metrics or scenario.baseline_metrics,
        ))
    
    return ScenarioData(
        id=scenario.id,
        name=scenario.name,
        seed=scenario.seed,
        lambda_decay=scenario.lambda_decay,
        baseline_metrics=scenario.baseline_metrics,
        clusters=clusters,
    )


@router.post("/simulate", response_model=SimulateResponse)
async def simulate(
    request: SimulateRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Run a simulation for a proposal.
    
    Returns:
    - Overall approval score (-100 to 100)
    - Approval broken down by archetype
    - Approval broken down by region/cluster
    - Top metric drivers
    - Optional narrative (if include_narrative=true)
    """
    scenario_data = await _load_scenario_data(request.scenario_id, db)
    simulator = CivicSimulator(scenario_data)
    
    result = simulator.simulate(
        proposal=request.proposal,
        lambda_override=request.lambda_override,
        include_debug=True,
    )
    
    if request.include_narrative:
        from app.services.narrator import Narrator
        
        settings = get_settings()
        if settings.backboard_api_key:
            narrator = Narrator(settings.backboard_api_key)
            narrative = await narrator.generate_narrative(
                proposal=request.proposal,
                result=result,
            )
            result.narrative = narrative
    
    # Store result
    stored_result = SimulationResult(
        scenario_id=request.scenario_id,
        proposal=request.proposal.model_dump(),
        proposal_type=request.proposal.type,
        overall_approval=result.overall_approval,
        approval_by_archetype=[a.model_dump() for a in result.approval_by_archetype],
        approval_by_region=[r.model_dump() for r in result.approval_by_region],
        top_drivers=[d.model_dump() for d in result.top_drivers],
        metric_deltas=result.metric_deltas,
        seed_used=scenario_data.seed,
        lambda_used=request.lambda_override or scenario_data.lambda_decay,
        narrative=result.narrative.summary if result.narrative else None,
        archetype_quotes=result.narrative.archetype_quotes if result.narrative else None,
        compromise_suggestion=result.narrative.compromise_suggestion if result.narrative else None,
    )
    db.add(stored_result)
    await db.commit()
    
    return result


@router.post("/simulate/enhanced")
async def simulate_enhanced(
    request: EnhancedSimulateRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Enhanced simulation with persona roleplay and show-my-work debug mode.
    
    Features:
    - All standard simulation results
    - Optional persona-based roleplay reaction
    - Optional full transparency debug info
    """
    scenario_data = await _load_scenario_data(request.scenario_id, db)
    simulator = CivicSimulator(scenario_data)
    
    result = simulator.simulate(
        proposal=request.proposal,
        lambda_override=request.lambda_override,
        include_debug=True,
    )
    
    settings = get_settings()
    persona_response = None
    
    # Generate persona response if requested
    if request.persona or request.include_narrative:
        from app.services.narrator import Narrator
        
        if settings.backboard_api_key:
            narrator = Narrator(settings.backboard_api_key)
            persona_response = await narrator.generate_full_response(
                proposal=request.proposal,
                result=result,
                persona_key=request.persona,
                scenario_seed=scenario_data.seed,
            )
    
    # Build show_my_work if requested
    show_my_work = None
    if request.show_my_work and result.debug:
        show_my_work = ShowMyWork(
            structured_proposal=request.proposal.model_dump(),
            raw_metric_contributions={},
            exposure_values=result.debug.exposure_values,
            utility_scores=result.debug.raw_utility_scores,
            assumptions_applied=[],
        )
    
    return {
        "overall_approval": result.overall_approval,
        "overall_sentiment": result.overall_sentiment,
        "approval_by_archetype": [a.model_dump() for a in result.approval_by_archetype],
        "approval_by_region": [r.model_dump() for r in result.approval_by_region],
        "top_drivers": [d.model_dump() for d in result.top_drivers],
        "metric_deltas": result.metric_deltas,
        "persona_response": persona_response.model_dump() if persona_response else None,
        "show_my_work": show_my_work.model_dump() if show_my_work else None,
    }


@router.post("/roleplay", response_model=RoleplayResponse)
async def generate_roleplay(
    request: RoleplayRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a persona-based roleplay reaction to a proposal.
    
    Returns:
    - Roleplay reaction in the persona's voice
    - Deterministic breakdown of the actual simulation results
    - Optional grounded narrative
    
    The roleplay is grounded in actual simulation results - the persona
    reacts based on what the engine computed, not LLM invention.
    """
    # Validate persona
    if request.persona not in PERSONAS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown persona: {request.persona}. Available: {list(PERSONAS.keys())}",
        )
    
    # Load scenario and run simulation
    scenario_data = await _load_scenario_data(request.scenario_id, db)
    simulator = CivicSimulator(scenario_data)
    
    result = simulator.simulate(
        proposal=request.proposal,
        lambda_override=request.lambda_override,
        include_debug=True,
    )
    
    settings = get_settings()
    
    # Generate roleplay
    from app.services.narrator import Narrator
    
    if settings.backboard_api_key:
        narrator = Narrator(settings.backboard_api_key)
        roleplay = await narrator.generate_persona_roleplay(
            proposal=request.proposal,
            result=result,
            persona_key=request.persona,
            scenario_seed=scenario_data.seed,
        )
        grounded = await narrator.generate_grounded_narrative(
            proposal=request.proposal,
            result=result,
        )
    else:
        # Fallback without LLM
        persona = get_persona(request.persona)
        proposal_hash = hash_proposal(request.proposal.model_dump())
        voice_seed = compute_voice_seed(request.persona, proposal_hash, scenario_data.seed)
        
        roleplay = RoleplayReaction(
            persona_key=request.persona,
            persona_name=persona.name,
            voice_seed=voice_seed,
            reaction=f"As a {persona.name.lower()}, I have thoughts about this proposal based on how it affects {', '.join(persona.priority_metrics)}.",
            priority_metrics_cited=persona.priority_metrics,
            tone_applied=persona.tone,
        )
        grounded = None
    
    # Build deterministic breakdown
    breakdown = DeterministicBreakdown(
        overall_approval=result.overall_approval,
        overall_sentiment=result.overall_sentiment,
        top_drivers=[d.model_dump() for d in result.top_drivers],
        metric_deltas=result.metric_deltas,
        assumptions_used=[],
        confidence=1.0,
    )
    
    return RoleplayResponse(
        roleplay=roleplay,
        breakdown=breakdown,
        grounded_narrative=grounded,
    )


@router.post("/compare", response_model=CompareResponse)
async def compare_proposals(
    request: CompareRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Compare multiple proposals side-by-side.
    
    Useful for exploring alternatives and finding the best option.
    """
    scenario_data = await _load_scenario_data(request.scenario_id, db)
    simulator = CivicSimulator(scenario_data)
    
    results: list[ComparisonResult] = []
    best_approval = -100
    best_idx = 0
    
    for idx, proposal in enumerate(request.proposals):
        sim_result = simulator.simulate(
            proposal=proposal,
            include_debug=False,
        )
        
        sorted_archetypes = sorted(
            sim_result.approval_by_archetype,
            key=lambda x: x.score,
            reverse=True,
        )
        
        winners = [a.archetype_name for a in sorted_archetypes[:3] if a.score > 20]
        losers = [a.archetype_name for a in sorted_archetypes[-3:] if a.score < -20]
        
        results.append(ComparisonResult(
            proposal_index=idx,
            proposal_title=proposal.title,
            overall_approval=sim_result.overall_approval,
            winners=winners,
            losers=losers,
        ))
        
        if sim_result.overall_approval > best_approval:
            best_approval = sim_result.overall_approval
            best_idx = idx
    
    recommendation = None
    if len(results) > 1:
        best = results[best_idx]
        if best.overall_approval > 20:
            recommendation = f"'{best.proposal_title}' has the highest approval ({best.overall_approval:.1f})"
        elif best.overall_approval > 0:
            recommendation = f"'{best.proposal_title}' is the least controversial option"
        else:
            recommendation = "All proposals face significant opposition - consider modifications"
    
    return CompareResponse(
        results=results,
        recommendation=recommendation,
    )


@router.post("/compare/with-compromises")
async def compare_with_compromises(
    request: CompareRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Compare proposals and suggest compromises for low-approval options.
    
    For each proposal with approval < 50%, suggests modifications
    based on the negative drivers.
    """
    scenario_data = await _load_scenario_data(request.scenario_id, db)
    simulator = CivicSimulator(scenario_data)
    settings = get_settings()
    
    results = []
    
    for idx, proposal in enumerate(request.proposals):
        sim_result = simulator.simulate(proposal=proposal, include_debug=False)
        
        # Find winners/losers
        sorted_archetypes = sorted(
            sim_result.approval_by_archetype,
            key=lambda x: x.score,
            reverse=True,
        )
        winners = [a.archetype_name for a in sorted_archetypes[:3] if a.score > 20]
        losers = [a.archetype_name for a in sorted_archetypes[-3:] if a.score < -20]
        
        # Generate compromise if needed
        compromise = None
        if sim_result.overall_approval < 50:
            negative_drivers = [d for d in sim_result.top_drivers if d.direction == "negative"]
            if negative_drivers:
                compromise = _suggest_compromise(proposal, negative_drivers[0].metric_key)
        
        results.append({
            "proposal_index": idx,
            "proposal_title": proposal.title,
            "overall_approval": sim_result.overall_approval,
            "sentiment": sim_result.overall_sentiment,
            "winners": winners,
            "losers": losers,
            "compromise_suggestion": compromise,
        })
    
    # Find best
    best_idx = max(range(len(results)), key=lambda i: results[i]["overall_approval"])
    recommendation = f"'{results[best_idx]['proposal_title']}' has the best approval at {results[best_idx]['overall_approval']:.1f}"
    
    return {
        "results": results,
        "recommendation": recommendation,
    }


def _suggest_compromise(
    proposal: Union[SpatialProposal, CitywideProposal],
    problem_metric: str,
) -> str:
    """Generate a compromise suggestion based on problem metric."""
    suggestions = {
        "affordability": "Consider adding affordable housing requirements or income-targeted benefits",
        "housing": "Consider increasing density allowances or streamlining approvals",
        "mobility": "Consider adding transit access improvements or bike infrastructure",
        "environment": "Consider adding green space requirements or environmental mitigation",
        "economy": "Consider adding local hiring requirements or business support",
        "equity": "Consider adding community benefit agreements or targeted programs",
    }
    return suggestions.get(problem_metric, "Consider stakeholder engagement to identify concerns")


@router.get("/simulations/{scenario_id}")
async def list_simulations(
    scenario_id: UUID,
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
):
    """List recent simulation results for a scenario."""
    result = await db.execute(
        select(SimulationResult)
        .where(SimulationResult.scenario_id == scenario_id)
        .order_by(SimulationResult.created_at.desc())
        .limit(limit)
    )
    simulations = result.scalars().all()
    
    return {
        "simulations": [
            {
                "id": str(s.id),
                "proposal_type": s.proposal_type,
                "overall_approval": s.overall_approval,
                "created_at": s.created_at.isoformat(),
            }
            for s in simulations
        ]
    }
