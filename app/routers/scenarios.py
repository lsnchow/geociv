"""Scenario management endpoints."""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.scenario import Scenario, Cluster, ClusterArchetypeDistribution
from app.schemas.scenario import (
    ScenarioCreate,
    ScenarioResponse,
    ScenarioSummary,
    ClusterResponse,
    ArchetypeDistributionConfig,
)

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
    
    # Check if already exists
    result = await db.execute(
        select(Scenario).where(Scenario.name == "Kingston, Ontario")
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Kingston scenario already exists. Delete it first to re-seed.",
        )
    
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

