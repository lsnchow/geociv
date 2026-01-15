"""AI-Max endpoints for variant generation, objective seeking, town hall, and history intelligence."""

import time
import hashlib
import json
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.scenario import Scenario, Cluster
from app.engine.simulator import CivicSimulator, ScenarioData, ClusterData
from app.engine.exposure import Location
from app.services.variant_generator import VariantGenerator
from app.schemas.ai import (
    # Variant generation
    GenerateVariantsRequest,
    GenerateVariantsResponse,
    # Objective seeking
    SeekObjectiveRequest,
    SeekObjectiveResponse,
    # Town hall
    GenerateTownHallRequest,
    GenerateTownHallResponse,
    CrossExamineRequest,
    CrossExamineResponse,
    FlipSpeakerRequest,
    FlipSpeakerResponse,
    # History
    AnalyzeHistoryRequest,
    AnalyzeHistoryResponse,
    FindBestRunRequest,
    FindBestRunResponse,
    # Zone
    DescribeZoneRequest,
    DescribeZoneResponse,
    # Compile
    CompileRequest,
    CompileResponse,
    # Receipt
    AIReceipt,
    # Chat
    AIChatRequest,
    AIChatResponse,
    SimulationSummary,
)

router = APIRouter(prefix="/ai", tags=["AI Agent"])


async def _load_scenario_data(
    scenario_id: UUID,
    db: AsyncSession,
) -> Optional[ScenarioData]:
    """Load scenario data from database."""
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
        return None
    
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


def _generate_run_hash(data: dict) -> str:
    """Generate a short hash for reproducibility."""
    json_str = json.dumps(data, sort_keys=True, default=str)
    return hashlib.sha256(json_str.encode()).hexdigest()[:12]


# =============================================================================
# Variant Generation
# =============================================================================

@router.post("/variants", response_model=GenerateVariantsResponse)
async def generate_variants(
    request: GenerateVariantsRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Generate proposal variants and rank them.
    
    Creates 7 variants:
    - 3 alternates (different approaches to same goal)
    - 3 compromises (balance competing interests)
    - 1 spicy (bold/extreme version)
    
    Returns ranked list by support, equity, environment, and political feasibility.
    """
    start_time = time.time()
    
    scenario_data = await _load_scenario_data(request.scenario_id, db)
    if not scenario_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scenario {request.scenario_id} not found"
        )
    
    try:
        generator = VariantGenerator()
        bundle = await generator.generate_variants(
            base_proposal=request.proposal,
            scenario_data=scenario_data,
            ranking_priorities=request.ranking_priorities,
            include_spicy=request.include_spicy,
        )
        
        elapsed_ms = int((time.time() - start_time) * 1000)
        
        return GenerateVariantsResponse(
            success=True,
            bundle=bundle,
            generation_time_ms=elapsed_ms,
        )
        
    except Exception as e:
        return GenerateVariantsResponse(
            success=False,
            error=str(e),
            generation_time_ms=int((time.time() - start_time) * 1000),
        )


# =============================================================================
# Objective Seeking
# =============================================================================

@router.post("/seek", response_model=SeekObjectiveResponse)
async def seek_objective(
    request: SeekObjectiveRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Search for a proposal that meets objective constraints.
    
    Iteratively tweaks proposal parameters to find one that satisfies
    constraints like "approval > 20 AND affordability > 0".
    """
    scenario_data = await _load_scenario_data(request.scenario_id, db)
    if not scenario_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scenario {request.scenario_id} not found"
        )
    
    try:
        from app.services.objective_seeker import ObjectiveSeeker
        seeker = ObjectiveSeeker()
        result = await seeker.seek_objective(
            goal=request.goal,
            starting_proposal=request.starting_proposal,
            scenario_data=scenario_data,
            max_iterations=request.max_iterations,
        )
        
        return SeekObjectiveResponse(
            success=True,
            result=result,
        )
        
    except Exception as e:
        return SeekObjectiveResponse(
            success=False,
            error=str(e),
        )


# =============================================================================
# Town Hall
# =============================================================================

@router.post("/townhall", response_model=GenerateTownHallResponse)
async def generate_townhall(
    request: GenerateTownHallRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a town hall transcript with multiple speakers.
    
    Creates a realistic town hall meeting with 4-6 speakers from
    different archetypes, each making arguments grounded in their
    actual simulation scores.
    """
    scenario_data = await _load_scenario_data(request.scenario_id, db)
    if not scenario_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scenario {request.scenario_id} not found"
        )
    
    try:
        from app.services.townhall_generator import TownHallGenerator
        generator = TownHallGenerator()
        transcript = await generator.generate_townhall(
            proposal=request.proposal,
            scenario_data=scenario_data,
            num_speakers=request.num_speakers,
            include_dramatic_elements=request.include_dramatic_elements,
            focus_archetype=request.focus_archetype,
        )
        
        return GenerateTownHallResponse(
            success=True,
            transcript=transcript,
        )
        
    except Exception as e:
        return GenerateTownHallResponse(
            success=False,
            error=str(e),
        )


@router.post("/townhall/cross-examine", response_model=CrossExamineResponse)
async def cross_examine_speaker(
    request: CrossExamineRequest,
    db: AsyncSession = Depends(get_db),
):
    """Cross-examine a speaker from the town hall."""
    scenario_data = await _load_scenario_data(request.scenario_id, db)
    if not scenario_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scenario {request.scenario_id} not found"
        )
    
    try:
        from app.services.townhall_generator import TownHallGenerator
        generator = TownHallGenerator()
        response = await generator.cross_examine(
            proposal=request.proposal,
            scenario_data=scenario_data,
            speaker_archetype=request.speaker_archetype,
            question=request.question,
        )
        return response
        
    except Exception as e:
        return CrossExamineResponse(
            speaker_name="Unknown",
            response=f"Error: {e}",
        )


@router.post("/townhall/flip", response_model=FlipSpeakerResponse)
async def flip_speaker(
    request: FlipSpeakerRequest,
    db: AsyncSession = Depends(get_db),
):
    """Find what changes would flip a speaker's stance."""
    scenario_data = await _load_scenario_data(request.scenario_id, db)
    if not scenario_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scenario {request.scenario_id} not found"
        )
    
    try:
        from app.services.townhall_generator import TownHallGenerator
        generator = TownHallGenerator()
        response = await generator.find_flip_strategy(
            proposal=request.proposal,
            scenario_data=scenario_data,
            speaker_archetype=request.speaker_archetype,
        )
        return response
        
    except Exception as e:
        return FlipSpeakerResponse(
            speaker_name="Unknown",
            current_stance="unknown",
            current_score=0,
            suggestions=[f"Error: {e}"],
        )


# =============================================================================
# History Intelligence
# =============================================================================

@router.post("/history/analyze", response_model=AnalyzeHistoryResponse)
async def analyze_history(
    request: AnalyzeHistoryRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Analyze simulation history to find patterns and insights.
    
    Identifies:
    - Lever effects (what consistently helps/hurts)
    - Archetype trends
    - Best practices
    - Warnings
    """
    try:
        from app.services.history_intelligence import HistoryIntelligence
        intel = HistoryIntelligence()
        analysis = await intel.analyze_history(
            history=request.history,
            focus_metric=request.focus_metric,
        )
        
        return AnalyzeHistoryResponse(
            success=True,
            analysis=analysis,
        )
        
    except Exception as e:
        return AnalyzeHistoryResponse(
            success=False,
            error=str(e),
        )


@router.post("/history/best", response_model=FindBestRunResponse)
async def find_best_run(
    request: FindBestRunRequest,
    db: AsyncSession = Depends(get_db),
):
    """Find the best run matching specific criteria."""
    try:
        from app.services.history_intelligence import HistoryIntelligence
        intel = HistoryIntelligence()
        result = await intel.find_best_run(
            history=request.history,
            criteria=request.criteria,
        )
        
        return result
        
    except Exception as e:
        return FindBestRunResponse(
            success=False,
            explanation=str(e),
        )


# =============================================================================
# Zone Description
# =============================================================================

@router.post("/zones/describe", response_model=DescribeZoneResponse)
async def describe_zone(
    request: DescribeZoneRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Get AI description of a zone/cluster.
    
    Returns character, demographics, and proposal recommendations.
    """
    scenario_data = await _load_scenario_data(request.scenario_id, db)
    if not scenario_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scenario {request.scenario_id} not found"
        )
    
    # Find the cluster
    cluster = None
    for c in scenario_data.clusters:
        if str(c.id) == request.cluster_id or c.name == request.cluster_id:
            cluster = c
            break
    
    if not cluster:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Cluster {request.cluster_id} not found"
        )
    
    try:
        from app.services.zone_describer import ZoneDescriber
        describer = ZoneDescriber()
        description = await describer.describe_zone(
            cluster=cluster,
            scenario_data=scenario_data,
            current_proposal=request.current_proposal,
        )
        
        return DescribeZoneResponse(
            success=True,
            description=description,
        )
        
    except Exception as e:
        return DescribeZoneResponse(
            success=False,
            error=str(e),
        )


# =============================================================================
# Compile (Messy Input -> Structured)
# =============================================================================

@router.post("/compile", response_model=CompileResponse)
async def compile_input(
    request: CompileRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Compile messy input into structured proposals.
    
    Accepts:
    - Natural language text
    - Map click coordinates
    - Lasso path
    
    Returns structured proposals with assumptions.
    """
    from app.services.backboard import BackboardClient
    from app.config import get_settings
    
    settings = get_settings()
    
    try:
        client = BackboardClient(settings.backboard_api_key)
        
        # Combine inputs for context
        full_input = request.input_text
        if request.map_click:
            full_input += f"\n[User clicked at {request.map_click.get('lat', 0):.4f}, {request.map_click.get('lng', 0):.4f}]"
        if request.lasso_path:
            full_input += f"\n[User drew a shape with {len(request.lasso_path)} points]"
        
        result = await client.parse_proposal_enhanced(full_input)
        
        if result.success and result.proposal:
            # Apply map click coordinates if spatial
            proposal = result.proposal
            if proposal.type == "spatial" and request.map_click:
                proposal_data = proposal.model_dump()
                proposal_data["latitude"] = request.map_click.get("lat", proposal_data.get("latitude"))
                proposal_data["longitude"] = request.map_click.get("lng", proposal_data.get("longitude"))
                from app.schemas.proposal import SpatialProposal
                proposal = SpatialProposal(**proposal_data)
            
            from app.schemas.ai import CompiledProposal
            compiled = CompiledProposal(
                proposal=proposal,
                confidence=result.confidence,
                assumptions=[a.model_dump() for a in result.assumptions] if result.assumptions else [],
                interpretation=result.raw_interpretation or proposal.title,
            )
            
            return CompileResponse(
                success=True,
                proposals=[compiled],
                message=f"Compiled: {proposal.title}",
            )
        else:
            return CompileResponse(
                success=False,
                message="Could not compile input",
                needs_clarification=bool(result.clarification_needed),
                clarification_question=result.clarification_needed[0].question if result.clarification_needed else None,
            )
        
    except Exception as e:
        return CompileResponse(
            success=False,
            message=str(e),
        )


# =============================================================================
# AI Chat (Full Agent Loop)
# =============================================================================

@router.post("/chat")
async def ai_chat(
    request: "AIChatRequest",
    db: AsyncSession = Depends(get_db),
):
    """
    Full AI chat endpoint with agent loop:
    1. LLM interprets user message
    2. Parses proposal if detected
    3. Runs deterministic simulation
    4. LLM generates grounded narrative
    5. Optional persona roleplay
    
    NO silent fallbacks - Backboard is REQUIRED.
    Returns 502 if Backboard fails, 400 if input invalid.
    """
    import datetime
    import logging
    from app.services.backboard import BackboardClient, BackboardError
    from app.services.narrator import Narrator
    from app.config import get_settings
    from app.schemas.ai import (
        AIChatRequest,
        AIChatResponse,
        AIReceipt,
        SimulationSummary,
    )
    from fastapi.responses import JSONResponse
    
    logger = logging.getLogger(__name__)
    settings = get_settings()
    start_time = time.time()
    active_features = []
    
    # VALIDATION: Reject empty messages with 400
    if not request.message or not request.message.strip():
        logger.warning(f"[AI_CHAT] Rejected empty message")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message cannot be empty"
        )
    
    # #region agent log
    import json as _json
    with open("/Users/lucas/Desktop/kinghacks/.cursor/debug.log", "a") as _f:
        _f.write(_json.dumps({"location":"ai.py:ai_chat","message":"entry","data":{"msg_len":len(request.message),"scenario_id":str(request.scenario_id),"thread_id":request.thread_id},"timestamp":__import__('time').time()*1000,"sessionId":"debug-session","hypothesisId":"D"}) + "\n")
    # #endregion
    
    logger.info(f"[AI_CHAT] Inbound message length: {len(request.message)} chars")
    logger.info(f"[AI_CHAT] Message preview: {repr(request.message[:100])}")
    
    # Session key for thread continuity
    session_key = request.thread_id or f"scenario_{request.scenario_id}"
    
    # Initialize receipt
    receipt = AIReceipt(
        run_hash="",
        active_features=[],
        assumptions_count=0,
        deterministic_metrics=True,
        timestamp=datetime.datetime.utcnow().isoformat(),
    )
    
    # Check Backboard API key
    if not settings.backboard_api_key:
        logger.error("[AI_CHAT] BACKBOARD_API_KEY not configured")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="BACKBOARD_API_KEY not configured. AI chat requires Backboard."
        )
    
    try:
        client = BackboardClient(settings.backboard_api_key, allow_fallback=False)
        
        # Load scenario for context
        scenario_data = await _load_scenario_data(request.scenario_id, db)
        if not scenario_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Scenario {request.scenario_id} not found"
            )
        
        receipt.scenario_seed = scenario_data.seed
        
        # Step 1: Send to Backboard for interpretation
        active_features.append("llm_interpret")
        chat_result = await client.chat(
            session_key=session_key,
            message=request.message,
            context={"scenario_name": scenario_data.name},
        )
        
        thread_id = chat_result["thread_id"]
        assistant_content = chat_result["content"]
        parsed_proposal_data = chat_result.get("parsed_proposal")
        
        # Initialize response
        response = AIChatResponse(
            thread_id=thread_id,
            assistant_message=assistant_content,
            receipt=receipt,
        )
        
        # Step 2: If proposal was parsed, build it
        proposal = None
        assumptions = []
        
        if parsed_proposal_data:
            active_features.append("parse")
            
            # Extract assumptions
            assumptions = parsed_proposal_data.get("assumptions", [])
            confidence = parsed_proposal_data.get("confidence", 0.8)
            
            # Build proposal object
            proposal = _build_proposal_from_data(parsed_proposal_data)
            
            if proposal:
                response.proposal_parsed = True
                response.proposal = proposal
                response.confidence = confidence
                response.assumptions = assumptions
                receipt.assumptions_count = len(assumptions)
                receipt.assumptions = assumptions
        
        # Step 3: Run simulation if proposal parsed and auto_simulate
        if proposal and request.auto_simulate:
            active_features.append("simulate")
            
            simulator = CivicSimulator(scenario_data)
            sim_result = simulator.simulate(proposal, include_debug=True)
            
            # Build summary
            top_supporters = [
                a.archetype_name for a in sim_result.approval_by_archetype[:3]
                if a.score > 15
            ]
            top_opponents = [
                a.archetype_name for a in sim_result.approval_by_archetype[-3:]
                if a.score < -15
            ]
            
            response.simulation_ran = True
            response.simulation_result = SimulationSummary(
                overall_approval=sim_result.overall_approval,
                overall_sentiment=sim_result.overall_sentiment,
                top_supporters=top_supporters,
                top_opponents=top_opponents,
                key_drivers=sim_result.key_drivers[:5] if sim_result.key_drivers else [],
                metric_deltas=sim_result.metric_deltas,
            )
            
            # Step 4: Generate grounded narrative via LLM
            active_features.append("narrate")
            
            narrator = Narrator(settings.backboard_api_key)
            narrative = await narrator.generate_narrative(proposal, sim_result)
            response.grounded_narrative = narrative.summary
            
            # Step 5: Persona roleplay if requested
            if request.persona:
                active_features.append("roleplay")
                
                persona_response = await narrator.generate_full_response(
                    proposal=proposal,
                    result=sim_result,
                    persona_key=request.persona,
                    scenario_seed=scenario_data.seed,
                )
                
                if persona_response.roleplay_reaction:
                    response.persona_reaction = persona_response.roleplay_reaction.reaction
                    response.persona_name = persona_response.roleplay_reaction.persona_name
            
            # Update assistant message with simulation summary
            sim_summary = f"\n\n📊 **Simulation Results:**\n"
            sim_summary += f"- Overall approval: {sim_result.overall_approval:.1f}% ({sim_result.overall_sentiment})\n"
            if top_supporters:
                sim_summary += f"- Top supporters: {', '.join(top_supporters)}\n"
            if top_opponents:
                sim_summary += f"- Top opponents: {', '.join(top_opponents)}\n"
            if narrative.compromise_suggestion:
                sim_summary += f"\n💡 {narrative.compromise_suggestion}"
            
            response.assistant_message += sim_summary
        
        # Finalize receipt
        receipt.active_features = active_features
        receipt.run_hash = _generate_run_hash({
            "message": request.message,
            "scenario_id": str(request.scenario_id),
            "proposal": proposal.model_dump() if proposal else None,
            "timestamp": receipt.timestamp,
        })
        response.receipt = receipt
        
        return response
        
    except BackboardError as e:
        logger.error(f"[AI_CHAT] BackboardError: {e}")
        # #region agent log
        with open("/Users/lucas/Desktop/kinghacks/.cursor/debug.log", "a") as _f:
            _f.write(_json.dumps({"location":"ai.py:ai_chat","message":"BackboardError","data":{"error":str(e)},"timestamp":__import__('time').time()*1000,"sessionId":"debug-session","hypothesisId":"E"}) + "\n")
        # #endregion
        # Return 502 Bad Gateway for Backboard failures
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Backboard error: {str(e)}"
        )
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"[AI_CHAT] Unexpected error: {e}")
        # Return 500 for unexpected errors
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI chat error: {str(e)}"
        )


def _build_proposal_from_data(data: dict):
    """Build a proposal object from parsed data."""
    from app.schemas.proposal import (
        SpatialProposal,
        CitywideProposal,
        SpatialProposalType,
        CitywideProposalType,
    )
    
    proposal_type = data.get("type", "").lower()
    
    if proposal_type == "spatial":
        spatial_type_str = data.get("spatial_type", "").lower()
        
        type_map = {
            "park": SpatialProposalType.PARK,
            "upzone": SpatialProposalType.UPZONE,
            "transit_line": SpatialProposalType.TRANSIT_LINE,
            "transit": SpatialProposalType.TRANSIT_LINE,
            "factory": SpatialProposalType.FACTORY,
            "housing_development": SpatialProposalType.HOUSING_DEVELOPMENT,
            "housing": SpatialProposalType.HOUSING_DEVELOPMENT,
            "commercial_development": SpatialProposalType.COMMERCIAL_DEVELOPMENT,
            "commercial": SpatialProposalType.COMMERCIAL_DEVELOPMENT,
            "bike_lane": SpatialProposalType.BIKE_LANE,
            "bike": SpatialProposalType.BIKE_LANE,
            "community_center": SpatialProposalType.COMMUNITY_CENTER,
            "community": SpatialProposalType.COMMUNITY_CENTER,
        }
        
        spatial_type = type_map.get(spatial_type_str)
        if not spatial_type:
            return None
        
        lat = data.get("latitude")
        lng = data.get("longitude")
        
        if not lat or not lng:
            return None
        
        return SpatialProposal(
            title=data.get("title", "Untitled Proposal"),
            description=data.get("description"),
            spatial_type=spatial_type,
            latitude=float(lat),
            longitude=float(lng),
            radius_km=float(data.get("radius_km", 0.5)),
            scale=float(data.get("scale", 1.0)),
            includes_affordable_housing=bool(data.get("includes_affordable_housing", False)),
            includes_green_space=bool(data.get("includes_green_space", False)),
            includes_transit_access=bool(data.get("includes_transit_access", False)),
        )
        
    elif proposal_type == "citywide":
        citywide_type_str = data.get("citywide_type", "").lower()
        
        type_map = {
            "tax_increase": CitywideProposalType.TAX_INCREASE,
            "tax": CitywideProposalType.TAX_INCREASE,
            "tax_decrease": CitywideProposalType.TAX_DECREASE,
            "subsidy": CitywideProposalType.SUBSIDY,
            "rebate": CitywideProposalType.SUBSIDY,
            "regulation": CitywideProposalType.REGULATION,
            "transit_funding": CitywideProposalType.TRANSIT_FUNDING,
            "transit": CitywideProposalType.TRANSIT_FUNDING,
            "housing_policy": CitywideProposalType.HOUSING_POLICY,
            "environmental_policy": CitywideProposalType.ENVIRONMENTAL_POLICY,
            "environmental": CitywideProposalType.ENVIRONMENTAL_POLICY,
        }
        
        citywide_type = type_map.get(citywide_type_str)
        if not citywide_type:
            return None
        
        return CitywideProposal(
            title=data.get("title", "Untitled Policy"),
            description=data.get("description"),
            citywide_type=citywide_type,
            amount=float(data["amount"]) if data.get("amount") else None,
            percentage=float(data["percentage"]) if data.get("percentage") else None,
            income_targeted=bool(data.get("income_targeted", False)),
            target_income_level=data.get("target_income_level"),
            affects_renters=bool(data.get("affects_renters", True)),
            affects_homeowners=bool(data.get("affects_homeowners", True)),
            affects_businesses=bool(data.get("affects_businesses", True)),
        )
    
    return None


# =============================================================================
# AI Receipt
# =============================================================================

@router.get("/receipt/{run_id}", response_model=AIReceipt)
async def get_ai_receipt(run_id: str):
    """Get AI receipt for a run (for transparency)."""
    # In production, this would look up stored receipts
    return AIReceipt(
        run_hash=run_id,
        active_features=["parse", "variants"],
        assumptions_count=0,
        deterministic_metrics=True,
        timestamp="",
        recipe={},
    )

