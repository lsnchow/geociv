"""Pydantic schemas for proposals."""

from enum import Enum
from typing import Optional, Union, Literal

from pydantic import BaseModel, Field


class ProposalType(str, Enum):
    """Types of proposals."""

    SPATIAL = "spatial"
    CITYWIDE = "citywide"


class SpatialProposalType(str, Enum):
    """Types of spatial proposals."""

    PARK = "park"
    UPZONE = "upzone"
    TRANSIT_LINE = "transit_line"
    FACTORY = "factory"
    HOUSING_DEVELOPMENT = "housing_development"
    COMMERCIAL_DEVELOPMENT = "commercial_development"
    BIKE_LANE = "bike_lane"
    COMMUNITY_CENTER = "community_center"


class CitywideProposalType(str, Enum):
    """Types of citywide proposals."""

    TAX_INCREASE = "tax_increase"
    TAX_DECREASE = "tax_decrease"
    SUBSIDY = "subsidy"
    REGULATION = "regulation"
    TRANSIT_FUNDING = "transit_funding"
    HOUSING_POLICY = "housing_policy"
    ENVIRONMENTAL_POLICY = "environmental_policy"


class DistanceBucket(str, Enum):
    """Distance buckets for vicinity impact."""
    
    NEAR = "near"
    MEDIUM = "medium"
    FAR = "far"


class RegionImpact(BaseModel):
    """Vicinity impact for a region relative to a build placement."""
    
    zone_id: str = Field(..., description="ID of the affected zone/region")
    zone_name: str = Field(..., description="Name of the affected zone/region")
    distance_meters: int = Field(..., ge=0, description="Distance from build to zone centroid")
    distance_bucket: DistanceBucket = Field(..., description="near/medium/far classification")
    proximity_weight: float = Field(..., ge=0, le=1, description="Impact weight (1=closest, 0=farthest)")


class ContainingZone(BaseModel):
    """Zone where a build is placed."""
    
    id: str
    name: str


class ProposalBase(BaseModel):
    """Base proposal schema."""

    title: str = Field(..., max_length=255, description="Title of the proposal")
    description: Optional[str] = Field(None, max_length=1000)


class SpatialProposal(ProposalBase):
    """A proposal with geographic location."""

    type: Literal["spatial"] = "spatial"
    spatial_type: SpatialProposalType = Field(..., description="Type of spatial proposal")
    latitude: float = Field(..., ge=-90, le=90, description="Latitude of proposal")
    longitude: float = Field(..., ge=-180, le=180, description="Longitude of proposal")
    radius_km: float = Field(
        default=0.5, gt=0, description="Radius of impact in kilometers"
    )
    scale: float = Field(
        default=1.0, ge=0.1, le=5.0, description="Scale/intensity multiplier (1-3 for MVP)"
    )
    
    # Optional modifiers
    includes_affordable_housing: bool = Field(
        default=False, description="Whether the proposal includes affordable housing"
    )
    includes_green_space: bool = Field(
        default=False, description="Whether the proposal includes green space requirements"
    )
    includes_transit_access: bool = Field(
        default=False, description="Whether the proposal includes transit improvements"
    )
    
    # Build mode additions (populated by frontend for drag-drop placements)
    affected_regions: Optional[list[RegionImpact]] = Field(
        default=None, description="Regions ranked by proximity to placement"
    )
    containing_zone: Optional[ContainingZone] = Field(
        default=None, description="Zone where the build is placed"
    )


class CitywideProposal(ProposalBase):
    """A citywide policy proposal."""

    type: Literal["citywide"] = "citywide"
    citywide_type: CitywideProposalType = Field(..., description="Type of citywide proposal")
    
    # Financial parameters
    amount: Optional[float] = Field(
        None, description="Dollar amount (for taxes/subsidies)"
    )
    percentage: Optional[float] = Field(
        None, ge=0, le=100, description="Percentage change"
    )
    
    # Targeting
    income_targeted: bool = Field(
        default=False, description="Whether it targets specific income levels"
    )
    target_income_level: Optional[str] = Field(
        None, description="Target income level: low, middle, high, or all"
    )
    
    # Sector targeting
    affects_renters: bool = Field(default=True)
    affects_homeowners: bool = Field(default=True)
    affects_businesses: bool = Field(default=True)


# Union type for any proposal
Proposal = Union[SpatialProposal, CitywideProposal]


class ProposalTemplate(BaseModel):
    """Template describing a proposal type."""

    key: str
    name: str
    description: str
    proposal_type: ProposalType
    default_metric_impacts: dict[str, float] = Field(
        ..., description="Default metric delta values"
    )
    required_fields: list[str]
    optional_fields: list[str]


class ParseProposalRequest(BaseModel):
    """Request to parse natural language into a structured proposal."""

    text: str = Field(..., max_length=2000, description="Natural language proposal")
    scenario_id: Optional[str] = Field(
        None, description="Optional scenario ID for context"
    )


class ParseProposalResponse(BaseModel):
    """Response from proposal parsing."""

    success: bool
    proposal: Optional[Proposal] = None
    confidence: float = Field(ge=0, le=1, description="Confidence in parsing")
    clarification_needed: Optional[str] = Field(
        None, description="Follow-up question if ambiguous"
    )
    raw_interpretation: Optional[str] = Field(
        None, description="How the system interpreted the input"
    )


# =============================================================================
# World State Summary - Canonical state for agent context
# =============================================================================

class PlacedItemSummary(BaseModel):
    """Summary of a placed build item for world state."""
    
    id: str
    type: str  # e.g., "park", "housing_development"
    title: str
    region_id: Optional[str] = None  # containing_zone.id
    region_name: Optional[str] = None  # containing_zone.name
    radius_km: float = 0.5
    emoji: str = "📍"


class AdoptedPolicySummary(BaseModel):
    """Summary of an adopted/forced policy for world state."""
    
    id: str
    title: str
    summary: str
    outcome: str  # "adopted" or "forced"
    vote_pct: int  # agreement percentage
    timestamp: str


class RelationshipShift(BaseModel):
    """Top relationship change for world state."""
    
    from_agent: str
    to_agent: str
    score: float  # -1 to +1
    reason: str


class WorldStateSummary(BaseModel):
    """Canonical world state passed to every simulation.
    
    Contains all placed items, adopted policies, and key relationship shifts.
    Injected into agent prompts for context-aware reactions.
    """
    
    version: int = Field(default=1, description="Incremented on each state change")
    placed_items: list[PlacedItemSummary] = Field(default_factory=list)
    adopted_policies: list[AdoptedPolicySummary] = Field(default_factory=list)
    top_relationship_shifts: list[RelationshipShift] = Field(
        default_factory=list,
        description="Top 3 relationship changes (by absolute magnitude)"
    )
    
    def to_prompt_context(self) -> str:
        """Format world state as prompt context for agents."""
        if not self.placed_items and not self.adopted_policies:
            return ""
        
        lines = ["\n=== CURRENT WORLD STATE ==="]
        
        if self.placed_items:
            lines.append(f"\nPLACED BUILDINGS ({len(self.placed_items)}):")
            for item in self.placed_items:
                region = f" in {item.region_name}" if item.region_name else ""
                lines.append(f"  {item.emoji} {item.title} ({item.type}){region}")
        
        if self.adopted_policies:
            lines.append(f"\nADOPTED POLICIES ({len(self.adopted_policies)}):")
            for policy in self.adopted_policies:
                outcome_mark = "✓" if policy.outcome == "adopted" else "⚡"
                lines.append(f"  {outcome_mark} {policy.title} ({policy.vote_pct}% support)")
        
        if self.top_relationship_shifts:
            lines.append("\nKEY RELATIONSHIP SHIFTS:")
            for shift in self.top_relationship_shifts:
                direction = "↑" if shift.score > 0 else "↓"
                lines.append(f"  {shift.from_agent} → {shift.to_agent}: {direction} ({shift.reason})")
        
        lines.append("=== END WORLD STATE ===\n")
        return "\n".join(lines)

