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
        default=1.0, ge=0.1, le=5.0, description="Scale/intensity multiplier"
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

