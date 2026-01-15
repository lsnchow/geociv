"""Pydantic schemas for simulation requests and responses."""

from typing import Optional, Union, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.proposal import SpatialProposal, CitywideProposal
from app.schemas.llm import GroundedNarrative


# =============================================================================
# Simulation Result Components
# =============================================================================

class MetricDriver(BaseModel):
    """A metric that is driving the approval score."""
    
    metric_key: str = Field(..., description="Key of the metric (e.g., 'affordability')")
    metric_name: str = Field(..., description="Human-readable name")
    contribution: float = Field(..., description="Contribution to overall score")
    direction: Literal["positive", "negative"] = Field(..., description="Whether this helps or hurts")


class ArchetypeApproval(BaseModel):
    """Approval score for a specific archetype."""
    
    archetype_key: str = Field(..., description="Key of the archetype")
    archetype_name: str = Field(..., description="Human-readable name")
    score: float = Field(..., description="Approval score (-100 to 100)")
    sentiment: Literal["support", "oppose", "neutral"] = Field(..., description="Overall sentiment")
    population_weight: float = Field(default=0, description="Fraction of total population")
    top_concerns: list[str] = Field(default_factory=list, description="Top concerns for this archetype")


class RegionApproval(BaseModel):
    """Approval score for a geographic region/cluster."""
    
    cluster_id: str = Field(..., description="ID of the cluster")
    cluster_name: str = Field(..., description="Name of the cluster")
    score: float = Field(..., description="Approval score (-100 to 100)")
    sentiment: Literal["support", "oppose", "neutral"] = Field(..., description="Overall sentiment")
    population: int = Field(default=0, description="Population in this cluster")


class DebugInfo(BaseModel):
    """Debug information for transparency mode."""
    
    metric_impacts: dict[str, float] = Field(default_factory=dict)
    exposure_weights: dict[str, float] = Field(default_factory=dict)
    archetype_weights: dict[str, dict[str, float]] = Field(default_factory=dict)
    raw_scores: dict[str, float] = Field(default_factory=dict)


class NarrativeResponse(BaseModel):
    """Narrative generation response."""
    
    summary: str = Field(..., description="Summary of community reaction")
    archetype_quotes: dict[str, str] = Field(default_factory=dict, description="Quotes by archetype")
    compromise_suggestion: Optional[str] = Field(None, description="Suggested compromise")


# =============================================================================
# Request/Response Schemas
# =============================================================================

class SimulateRequest(BaseModel):
    """Request to run a simulation."""
    
    scenario_id: UUID = Field(..., description="ID of the scenario to simulate in")
    proposal: Union[SpatialProposal, CitywideProposal] = Field(..., description="The proposal to simulate")
    lambda_override: Optional[float] = Field(None, gt=0, description="Override lambda decay value")
    include_narrative: bool = Field(default=False, description="Include AI-generated narrative")


class SimulateResponse(BaseModel):
    """Response from a simulation."""
    
    overall_approval: float = Field(..., description="Overall approval score (-100 to 100)")
    overall_sentiment: Literal["support", "oppose", "neutral"] = Field(..., description="Overall sentiment")
    approval_by_archetype: list[ArchetypeApproval] = Field(default_factory=list)
    approval_by_region: list[RegionApproval] = Field(default_factory=list)
    top_drivers: list[MetricDriver] = Field(default_factory=list)
    metric_deltas: dict[str, float] = Field(default_factory=dict, description="Change in each metric")
    narrative: Optional[NarrativeResponse] = Field(None, description="AI-generated narrative")
    debug: Optional[DebugInfo] = Field(None, description="Debug info for transparency")


class CompareRequest(BaseModel):
    """Request to compare two proposals."""
    
    scenario_id: UUID = Field(..., description="ID of the scenario")
    proposal_a: Union[SpatialProposal, CitywideProposal] = Field(..., description="First proposal")
    proposal_b: Union[SpatialProposal, CitywideProposal] = Field(..., description="Second proposal")


class ComparisonResult(BaseModel):
    """Comparison between two proposals."""
    
    metric: str
    proposal_a_delta: float
    proposal_b_delta: float
    winner: Literal["a", "b", "tie"]
    difference: float


class CompareResponse(BaseModel):
    """Response from comparing two proposals."""
    
    result_a: SimulateResponse
    result_b: SimulateResponse
    approval_winner: Literal["a", "b", "tie"]
    approval_difference: float
    metric_comparisons: list[ComparisonResult] = Field(default_factory=list)
    recommendation: str = Field(default="", description="AI recommendation")
