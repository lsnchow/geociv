"""Proposal management endpoints."""

from fastapi import APIRouter

from app.engine.metrics import PROPOSAL_METRIC_IMPACTS
from app.schemas.proposal import (
    ProposalTemplate,
    ProposalType,
    SpatialProposalType,
    CitywideProposalType,
)

router = APIRouter()


# Pre-built templates for proposal types
PROPOSAL_TEMPLATES: list[ProposalTemplate] = [
    # Spatial proposals
    ProposalTemplate(
        key="park",
        name="Park / Green Space",
        description="Build a new park or expand green space in the area",
        proposal_type=ProposalType.SPATIAL,
        default_metric_impacts=PROPOSAL_METRIC_IMPACTS["park"],
        required_fields=["latitude", "longitude"],
        optional_fields=["radius_km", "scale", "includes_affordable_housing"],
    ),
    ProposalTemplate(
        key="upzone",
        name="Upzoning",
        description="Increase zoning density to allow more housing units",
        proposal_type=ProposalType.SPATIAL,
        default_metric_impacts=PROPOSAL_METRIC_IMPACTS["upzone"],
        required_fields=["latitude", "longitude"],
        optional_fields=["radius_km", "scale", "includes_affordable_housing", "includes_green_space"],
    ),
    ProposalTemplate(
        key="transit_line",
        name="Transit Line",
        description="Build or extend a transit line (bus route, light rail)",
        proposal_type=ProposalType.SPATIAL,
        default_metric_impacts=PROPOSAL_METRIC_IMPACTS["transit_line"],
        required_fields=["latitude", "longitude"],
        optional_fields=["radius_km", "scale"],
    ),
    ProposalTemplate(
        key="factory",
        name="Factory / Industrial",
        description="Build an industrial facility or factory",
        proposal_type=ProposalType.SPATIAL,
        default_metric_impacts=PROPOSAL_METRIC_IMPACTS["factory"],
        required_fields=["latitude", "longitude"],
        optional_fields=["radius_km", "scale"],
    ),
    ProposalTemplate(
        key="housing_development",
        name="Housing Development",
        description="Build new residential housing",
        proposal_type=ProposalType.SPATIAL,
        default_metric_impacts=PROPOSAL_METRIC_IMPACTS["housing_development"],
        required_fields=["latitude", "longitude"],
        optional_fields=["radius_km", "scale", "includes_affordable_housing", "includes_green_space"],
    ),
    ProposalTemplate(
        key="commercial_development",
        name="Commercial Development",
        description="Build commercial/retail space",
        proposal_type=ProposalType.SPATIAL,
        default_metric_impacts=PROPOSAL_METRIC_IMPACTS["commercial_development"],
        required_fields=["latitude", "longitude"],
        optional_fields=["radius_km", "scale"],
    ),
    ProposalTemplate(
        key="bike_lane",
        name="Bike Lane",
        description="Add protected bike lanes",
        proposal_type=ProposalType.SPATIAL,
        default_metric_impacts=PROPOSAL_METRIC_IMPACTS["bike_lane"],
        required_fields=["latitude", "longitude"],
        optional_fields=["radius_km", "scale"],
    ),
    ProposalTemplate(
        key="community_center",
        name="Community Center",
        description="Build a community center or recreation facility",
        proposal_type=ProposalType.SPATIAL,
        default_metric_impacts=PROPOSAL_METRIC_IMPACTS["community_center"],
        required_fields=["latitude", "longitude"],
        optional_fields=["radius_km", "scale"],
    ),
    # Citywide proposals
    ProposalTemplate(
        key="tax_increase",
        name="Tax Increase",
        description="Increase property or other local taxes",
        proposal_type=ProposalType.CITYWIDE,
        default_metric_impacts=PROPOSAL_METRIC_IMPACTS["tax_increase"],
        required_fields=["amount", "percentage"],
        optional_fields=["income_targeted", "target_income_level"],
    ),
    ProposalTemplate(
        key="tax_decrease",
        name="Tax Decrease",
        description="Decrease property or other local taxes",
        proposal_type=ProposalType.CITYWIDE,
        default_metric_impacts=PROPOSAL_METRIC_IMPACTS["tax_decrease"],
        required_fields=["amount", "percentage"],
        optional_fields=["income_targeted", "target_income_level"],
    ),
    ProposalTemplate(
        key="subsidy",
        name="Subsidy / Rebate",
        description="Provide a subsidy or rebate to residents",
        proposal_type=ProposalType.CITYWIDE,
        default_metric_impacts=PROPOSAL_METRIC_IMPACTS["subsidy"],
        required_fields=["amount"],
        optional_fields=["income_targeted", "target_income_level"],
    ),
    ProposalTemplate(
        key="regulation",
        name="New Regulation",
        description="Implement new regulations (environmental, business, etc.)",
        proposal_type=ProposalType.CITYWIDE,
        default_metric_impacts=PROPOSAL_METRIC_IMPACTS["regulation"],
        required_fields=[],
        optional_fields=["affects_businesses"],
    ),
    ProposalTemplate(
        key="transit_funding",
        name="Transit Funding Increase",
        description="Increase funding for public transit",
        proposal_type=ProposalType.CITYWIDE,
        default_metric_impacts=PROPOSAL_METRIC_IMPACTS["transit_funding"],
        required_fields=["percentage"],
        optional_fields=[],
    ),
    ProposalTemplate(
        key="housing_policy",
        name="Housing Policy",
        description="Implement housing policy (rent control, inclusionary zoning)",
        proposal_type=ProposalType.CITYWIDE,
        default_metric_impacts=PROPOSAL_METRIC_IMPACTS["housing_policy"],
        required_fields=[],
        optional_fields=["affects_renters", "affects_homeowners"],
    ),
    ProposalTemplate(
        key="environmental_policy",
        name="Environmental Policy",
        description="Implement environmental policy (emissions limits, green requirements)",
        proposal_type=ProposalType.CITYWIDE,
        default_metric_impacts=PROPOSAL_METRIC_IMPACTS["environmental_policy"],
        required_fields=[],
        optional_fields=["affects_businesses"],
    ),
]


@router.get("/proposals/templates", response_model=list[ProposalTemplate])
async def get_proposal_templates():
    """
    Get all available proposal templates.
    
    Each template includes:
    - Type (spatial or citywide)
    - Default metric impacts
    - Required and optional fields
    """
    return PROPOSAL_TEMPLATES


@router.get("/proposals/templates/{key}", response_model=ProposalTemplate)
async def get_proposal_template(key: str):
    """Get a specific proposal template by key."""
    for template in PROPOSAL_TEMPLATES:
        if template.key == key:
            return template
    
    from fastapi import HTTPException, status
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Template '{key}' not found",
    )


@router.get("/proposals/spatial-types")
async def get_spatial_types():
    """Get all spatial proposal types."""
    return {
        "types": [
            {"key": t.value, "name": t.value.replace("_", " ").title()}
            for t in SpatialProposalType
        ]
    }


@router.get("/proposals/citywide-types")
async def get_citywide_types():
    """Get all citywide proposal types."""
    return {
        "types": [
            {"key": t.value, "name": t.value.replace("_", " ").title()}
            for t in CitywideProposalType
        ]
    }

