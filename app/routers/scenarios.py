"""Scenario management endpoints."""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.scenario import Scenario, Cluster, ClusterArchetypeDistribution
from app.models.simulation import AgentOverride, PromotionCache
from app.schemas.scenario import (
    ScenarioCreate,
    ScenarioResponse,
    ScenarioSummary,
    ClusterResponse,
    ArchetypeDistributionConfig,
)
from app.config import ALLOWED_MODELS, DEFAULT_MODEL, validate_model
from app.agents.definitions import get_agent, AGENTS

router = APIRouter()


@router.post("/scenario/create", response_model=ScenarioResponse, status_code=status.HTTP_201_CREATED)
async def create_scenario(
    scenario_data: ScenarioCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new simulation scenario.
    
    A scenario includes:
    - Basic configuration (name, seed, lambda decay)
    - Baseline metric values
    - Population clusters with archetype distributions
    """
    # Create scenario
    scenario = Scenario(
        name=scenario_data.name,
        description=scenario_data.description,
        seed=scenario_data.seed,
        lambda_decay=scenario_data.lambda_decay,
        baseline_metrics=scenario_data.baseline_metrics,
    )
    db.add(scenario)
    await db.flush()  # Get the scenario ID
    
    # Create clusters
    for cluster_config in scenario_data.clusters:
        cluster = Cluster(
            scenario_id=scenario.id,
            name=cluster_config.name,
            description=cluster_config.description,
            latitude=cluster_config.latitude,
            longitude=cluster_config.longitude,
            population=cluster_config.population,
            baseline_metrics=cluster_config.baseline_metrics,
        )
        db.add(cluster)
        await db.flush()  # Get the cluster ID
        
        # Create archetype distributions
        for dist in cluster_config.archetype_distributions:
            distribution = ClusterArchetypeDistribution(
                cluster_id=cluster.id,
                archetype_key=dist.archetype_key,
                percentage=dist.percentage,
            )
            db.add(distribution)
    
    await db.commit()
    
    # Reload with relationships
    result = await db.execute(
        select(Scenario)
        .where(Scenario.id == scenario.id)
        .options(
            selectinload(Scenario.clusters)
            .selectinload(Cluster.archetype_distributions)
        )
    )
    scenario = result.scalar_one()
    
    return _scenario_to_response(scenario)


@router.get("/scenario/{scenario_id}", response_model=ScenarioResponse)
async def get_scenario(
    scenario_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get a scenario by ID."""
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
    
    return _scenario_to_response(scenario)


@router.get("/scenarios", response_model=list[ScenarioSummary])
async def list_scenarios(
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
):
    """List all scenarios."""
    result = await db.execute(
        select(Scenario)
        .options(selectinload(Scenario.clusters))
        .offset(skip)
        .limit(limit)
        .order_by(Scenario.created_at.desc())
    )
    scenarios = result.scalars().all()
    
    return [
        ScenarioSummary(
            id=s.id,
            name=s.name,
            description=s.description,
            cluster_count=len(s.clusters),
            total_population=sum(c.population for c in s.clusters),
            created_at=s.created_at,
        )
        for s in scenarios
    ]


@router.delete("/scenario/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scenario(
    scenario_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a scenario."""
    result = await db.execute(
        select(Scenario).where(Scenario.id == scenario_id)
    )
    scenario = result.scalar_one_or_none()
    
    if not scenario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scenario {scenario_id} not found",
        )
    
    await db.delete(scenario)
    await db.commit()


@router.post("/scenario/seed-kingston", response_model=ScenarioResponse, status_code=status.HTTP_201_CREATED)
async def seed_kingston_scenario(
    db: AsyncSession = Depends(get_db),
):
    """
    Seed the default Kingston scenario.
    
    Creates a pre-configured Kingston scenario with 5 population clusters
    and realistic archetype distributions. Useful for quick demos.
    """
    from app.seed_data import get_kingston_scenario
    
    # If multiple exist, reuse the newest to avoid 409/500s in prod
    result = await db.execute(
        select(Scenario)
        .where(Scenario.name == "Kingston, Ontario")
        .order_by(Scenario.created_at.desc())
        .limit(1)
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        return existing
    
    scenario_data = get_kingston_scenario()
    
    # Create using the existing create logic
    scenario = Scenario(
        name=scenario_data.name,
        description=scenario_data.description,
        seed=scenario_data.seed,
        lambda_decay=scenario_data.lambda_decay,
        baseline_metrics=scenario_data.baseline_metrics,
    )
    db.add(scenario)
    await db.flush()
    
    for cluster_config in scenario_data.clusters:
        cluster = Cluster(
            scenario_id=scenario.id,
            name=cluster_config.name,
            description=cluster_config.description,
            latitude=cluster_config.latitude,
            longitude=cluster_config.longitude,
            population=cluster_config.population,
            baseline_metrics=cluster_config.baseline_metrics,
        )
        db.add(cluster)
        await db.flush()
        
        for dist in cluster_config.archetype_distributions:
            distribution = ClusterArchetypeDistribution(
                cluster_id=cluster.id,
                archetype_key=dist.archetype_key,
                percentage=dist.percentage,
            )
            db.add(distribution)
    
    await db.commit()
    
    # Reload with relationships
    result = await db.execute(
        select(Scenario)
        .where(Scenario.id == scenario.id)
        .options(
            selectinload(Scenario.clusters)
            .selectinload(Cluster.archetype_distributions)
        )
    )
    scenario = result.scalar_one()
    
    return _scenario_to_response(scenario)


def _scenario_to_response(scenario: Scenario) -> ScenarioResponse:
    """Convert a Scenario model to response schema."""
    clusters = []
    for cluster in scenario.clusters:
        distributions = [
            ArchetypeDistributionConfig(
                archetype_key=d.archetype_key,
                percentage=d.percentage,
            )
            for d in cluster.archetype_distributions
        ]
        
        clusters.append(ClusterResponse(
            id=cluster.id,
            name=cluster.name,
            description=cluster.description,
            latitude=cluster.latitude,
            longitude=cluster.longitude,
            population=cluster.population,
            baseline_metrics=cluster.baseline_metrics,
            archetype_distributions=distributions,
        ))
    
    return ScenarioResponse(
        id=scenario.id,
        name=scenario.name,
        description=scenario.description,
        seed=scenario.seed,
        lambda_decay=scenario.lambda_decay,
        baseline_metrics=scenario.baseline_metrics,
        clusters=clusters,
        created_at=scenario.created_at,
        updated_at=scenario.updated_at,
    )


# =============================================================================
# Agent Override Schemas
# =============================================================================

class AgentOverrideUpdate(BaseModel):
    """Request to update an agent's model or archetype."""
    model: Optional[str] = Field(None, description="Model override (null = use default)")
    archetype_override: Optional[str] = Field(None, description="Custom persona text")


class AgentOverrideResponse(BaseModel):
    """Response for agent override."""
    agent_key: str
    model: Optional[str] = None
    archetype_override: Optional[str] = None
    default_model: str = DEFAULT_MODEL
    is_edited: bool = False


class AgentOverridesMapResponse(BaseModel):
    """Response containing all agent overrides for a scenario."""
    scenario_id: UUID
    overrides: dict[str, AgentOverrideResponse]
    available_models: list[str] = ALLOWED_MODELS


# =============================================================================
# Agent Override Endpoints
# =============================================================================

@router.get("/scenario/{scenario_id}/agent-overrides", response_model=AgentOverridesMapResponse)
async def get_agent_overrides(
    scenario_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Get all agent overrides for a scenario.
    
    Returns a map of agent_key -> override data, including defaults for agents
    without overrides.
    """
    # Verify scenario exists
    scenario_result = await db.execute(
        select(Scenario).where(Scenario.id == scenario_id)
    )
    if not scenario_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scenario {scenario_id} not found",
        )
    
    # Get all overrides for this scenario
    result = await db.execute(
        select(AgentOverride).where(AgentOverride.scenario_id == scenario_id)
    )
    db_overrides = {o.agent_key: o for o in result.scalars().all()}
    
    # Build response with all agents (from definitions)
    overrides: dict[str, AgentOverrideResponse] = {}
    for agent in AGENTS:
        agent_key = agent["key"]
        db_override = db_overrides.get(agent_key)
        
        if db_override:
            overrides[agent_key] = AgentOverrideResponse(
                agent_key=agent_key,
                model=db_override.model,
                archetype_override=db_override.archetype_override,
                default_model=DEFAULT_MODEL,
                is_edited=bool(db_override.model or db_override.archetype_override),
            )
        else:
            overrides[agent_key] = AgentOverrideResponse(
                agent_key=agent_key,
                model=None,
                archetype_override=None,
                default_model=DEFAULT_MODEL,
                is_edited=False,
            )
    
    return AgentOverridesMapResponse(
        scenario_id=scenario_id,
        overrides=overrides,
        available_models=ALLOWED_MODELS,
    )


@router.put("/scenario/{scenario_id}/agents/{agent_key}", response_model=AgentOverrideResponse)
async def update_agent_override(
    scenario_id: UUID,
    agent_key: str,
    update: AgentOverrideUpdate,
    db: AsyncSession = Depends(get_db),
):
    """
    Update a single agent's model or archetype override.
    
    Invalidates the promotion cache for this scenario.
    """
    # Verify scenario exists
    scenario_result = await db.execute(
        select(Scenario).where(Scenario.id == scenario_id)
    )
    if not scenario_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scenario {scenario_id} not found",
        )
    
    # Verify agent exists
    if not get_agent(agent_key):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid agent key: {agent_key}",
        )
    
    # Validate model if provided
    if update.model and not validate_model(update.model):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid model: {update.model}. Allowed: {ALLOWED_MODELS}",
        )
    
    # Get or create override
    result = await db.execute(
        select(AgentOverride).where(
            AgentOverride.scenario_id == scenario_id,
            AgentOverride.agent_key == agent_key,
        )
    )
    override = result.scalar_one_or_none()
    
    if override:
        # Update existing
        if update.model is not None:
            override.model = update.model if update.model else None
        if update.archetype_override is not None:
            override.archetype_override = update.archetype_override if update.archetype_override else None
    else:
        # Create new
        override = AgentOverride(
            scenario_id=scenario_id,
            agent_key=agent_key,
            model=update.model,
            archetype_override=update.archetype_override,
        )
        db.add(override)
    
    # Invalidate cache for this scenario
    await db.execute(
        delete(PromotionCache).where(PromotionCache.scenario_id == scenario_id)
    )
    
    await db.commit()
    await db.refresh(override)
    
    return AgentOverrideResponse(
        agent_key=agent_key,
        model=override.model,
        archetype_override=override.archetype_override,
        default_model=DEFAULT_MODEL,
        is_edited=bool(override.model or override.archetype_override),
    )


@router.post("/scenario/{scenario_id}/agents/{agent_key}/reset", response_model=AgentOverrideResponse)
async def reset_agent_override(
    scenario_id: UUID,
    agent_key: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Reset an agent to default model and archetype.
    
    Deletes the override record and invalidates the cache.
    """
    # Verify scenario exists
    scenario_result = await db.execute(
        select(Scenario).where(Scenario.id == scenario_id)
    )
    if not scenario_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scenario {scenario_id} not found",
        )
    
    # Verify agent exists
    if not get_agent(agent_key):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid agent key: {agent_key}",
        )
    
    # Delete override if exists
    await db.execute(
        delete(AgentOverride).where(
            AgentOverride.scenario_id == scenario_id,
            AgentOverride.agent_key == agent_key,
        )
    )
    
    # Invalidate cache
    await db.execute(
        delete(PromotionCache).where(PromotionCache.scenario_id == scenario_id)
    )
    
    await db.commit()
    
    return AgentOverrideResponse(
        agent_key=agent_key,
        model=None,
        archetype_override=None,
        default_model=DEFAULT_MODEL,
        is_edited=False,
    )


@router.post("/scenario/{scenario_id}/agents/reset-all")
async def reset_all_agent_overrides(
    scenario_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Reset all agents to defaults for a scenario.
    
    Deletes all override records and invalidates the cache.
    """
    # Verify scenario exists
    scenario_result = await db.execute(
        select(Scenario).where(Scenario.id == scenario_id)
    )
    if not scenario_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scenario {scenario_id} not found",
        )
    
    # Delete all overrides
    result = await db.execute(
        delete(AgentOverride).where(AgentOverride.scenario_id == scenario_id)
    )
    
    # Invalidate cache
    await db.execute(
        delete(PromotionCache).where(PromotionCache.scenario_id == scenario_id)
    )
    
    await db.commit()
    
    return {
        "success": True,
        "scenario_id": str(scenario_id),
        "message": "All agent overrides reset to defaults",
    }
