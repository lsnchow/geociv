"""Pydantic schemas for scenario management."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class ArchetypeDistributionConfig(BaseModel):
    """Configuration for archetype distribution within a cluster."""

    archetype_key: str = Field(..., description="Key of the archetype")
    percentage: float = Field(..., ge=0.0, le=1.0, description="Percentage of population (0-1)")


class ClusterConfig(BaseModel):
    """Configuration for creating a cluster."""

    name: str = Field(..., max_length=255, description="Name of the cluster")
    description: Optional[str] = Field(None, max_length=500)
    latitude: float = Field(..., ge=-90, le=90, description="Latitude coordinate")
    longitude: float = Field(..., ge=-180, le=180, description="Longitude coordinate")
    population: int = Field(default=1000, ge=0, description="Total population")
    baseline_metrics: Optional[dict[str, float]] = Field(
        None, description="Cluster-specific baseline metric values"
    )
    archetype_distributions: list[ArchetypeDistributionConfig] = Field(
        default_factory=list, description="Distribution of archetypes"
    )


class ScenarioCreate(BaseModel):
    """Request schema for creating a scenario."""

    name: str = Field(..., max_length=255, description="Name of the scenario")
    description: Optional[str] = Field(None, max_length=1000)
    seed: int = Field(default=42, description="Random seed for reproducibility")
    lambda_decay: float = Field(
        default=1.0, gt=0, description="Distance decay parameter (km)"
    )
    baseline_metrics: dict[str, float] = Field(
        default_factory=lambda: {
            "affordability": 0.5,
            "housing": 0.5,
            "mobility": 0.5,
            "environment": 0.5,
            "economy": 0.5,
            "equity": 0.5,
        },
        description="Baseline metric values (0-1 scale)",
    )
    clusters: list[ClusterConfig] = Field(
        default_factory=list, description="Population clusters"
    )


class ClusterResponse(BaseModel):
    """Response schema for a cluster."""

    id: UUID
    name: str
    description: Optional[str]
    latitude: float
    longitude: float
    population: int
    baseline_metrics: Optional[dict[str, float]]
    archetype_distributions: list[ArchetypeDistributionConfig]

    class Config:
        from_attributes = True


class ScenarioResponse(BaseModel):
    """Response schema for a scenario."""

    id: UUID
    name: str
    description: Optional[str]
    seed: int
    lambda_decay: float
    baseline_metrics: dict[str, float]
    clusters: list[ClusterResponse]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ScenarioSummary(BaseModel):
    """Brief summary of a scenario."""

    id: UUID
    name: str
    description: Optional[str]
    cluster_count: int
    total_population: int
    created_at: datetime

    class Config:
        from_attributes = True

