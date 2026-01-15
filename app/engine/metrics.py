"""Metric definitions for CivicSim."""

from dataclasses import dataclass
from typing import Optional


@dataclass
class MetricDefinition:
    """Definition of a simulation metric."""

    key: str
    name: str
    description: str
    min_value: float = 0.0
    max_value: float = 1.0
    default_value: float = 0.5
    higher_is_better: bool = True


# Core metrics for the simulation
METRICS: dict[str, MetricDefinition] = {
    "affordability": MetricDefinition(
        key="affordability",
        name="Affordability",
        description="Cost of living and housing affordability in the area",
        higher_is_better=True,
    ),
    "housing": MetricDefinition(
        key="housing",
        name="Housing Supply",
        description="Availability and supply of housing units",
        higher_is_better=True,
    ),
    "mobility": MetricDefinition(
        key="mobility",
        name="Mobility",
        description="Ease of transportation and commute burden",
        higher_is_better=True,
    ),
    "environment": MetricDefinition(
        key="environment",
        name="Environmental Quality",
        description="Green space, air quality, and environmental health",
        higher_is_better=True,
    ),
    "economy": MetricDefinition(
        key="economy",
        name="Economic Vitality",
        description="Jobs, business activity, and economic opportunity",
        higher_is_better=True,
    ),
    "equity": MetricDefinition(
        key="equity",
        name="Equity",
        description="Fair distribution of benefits and burdens across groups",
        higher_is_better=True,
    ),
}


# Proposal type to metric impact mapping
# Values represent default deltas (-1 to 1 scale)
PROPOSAL_METRIC_IMPACTS: dict[str, dict[str, float]] = {
    # Spatial proposals
    "park": {
        "environment": 0.3,
        "economy": -0.1,
        "housing": -0.05,
        "equity": 0.15,
        "mobility": 0.05,
        "affordability": 0.0,
    },
    "upzone": {
        "housing": 0.4,
        "affordability": 0.2,
        "environment": -0.15,
        "economy": 0.2,
        "equity": -0.1,
        "mobility": -0.1,
    },
    "transit_line": {
        "mobility": 0.5,
        "economy": 0.2,
        "environment": 0.15,
        "affordability": 0.1,
        "equity": 0.2,
        "housing": 0.1,
    },
    "factory": {
        "economy": 0.4,
        "environment": -0.3,
        "equity": -0.15,
        "mobility": -0.1,
        "housing": -0.05,
        "affordability": 0.1,
    },
    "housing_development": {
        "housing": 0.35,
        "affordability": 0.15,
        "environment": -0.1,
        "economy": 0.15,
        "mobility": -0.1,
        "equity": 0.0,
    },
    "commercial_development": {
        "economy": 0.35,
        "housing": -0.1,
        "environment": -0.1,
        "mobility": -0.15,
        "affordability": -0.05,
        "equity": 0.0,
    },
    "bike_lane": {
        "mobility": 0.2,
        "environment": 0.15,
        "economy": 0.05,
        "equity": 0.1,
        "affordability": 0.05,
        "housing": 0.0,
    },
    "community_center": {
        "equity": 0.25,
        "environment": 0.1,
        "economy": 0.1,
        "mobility": 0.0,
        "housing": -0.05,
        "affordability": 0.0,
    },
    # Citywide proposals
    "tax_increase": {
        "affordability": -0.25,
        "equity": 0.1,  # Can fund services
        "economy": -0.1,
        "environment": 0.0,
        "housing": 0.0,
        "mobility": 0.0,
    },
    "tax_decrease": {
        "affordability": 0.15,
        "equity": -0.15,  # Reduces services
        "economy": 0.1,
        "environment": 0.0,
        "housing": 0.0,
        "mobility": 0.0,
    },
    "subsidy": {
        "affordability": 0.3,
        "equity": 0.25,
        "economy": 0.05,
        "environment": 0.0,
        "housing": 0.0,
        "mobility": 0.0,
    },
    "regulation": {
        "environment": 0.2,
        "equity": 0.1,
        "economy": -0.15,
        "affordability": -0.1,
        "housing": -0.1,
        "mobility": 0.0,
    },
    "transit_funding": {
        "mobility": 0.35,
        "equity": 0.2,
        "environment": 0.15,
        "economy": 0.1,
        "affordability": -0.05,
        "housing": 0.0,
    },
    "housing_policy": {
        "housing": 0.3,
        "affordability": 0.2,
        "equity": 0.15,
        "economy": 0.05,
        "environment": 0.0,
        "mobility": 0.0,
    },
    "environmental_policy": {
        "environment": 0.35,
        "equity": 0.1,
        "economy": -0.1,
        "affordability": -0.05,
        "housing": 0.0,
        "mobility": 0.0,
    },
}


def get_metric_impacts(
    proposal_type: str,
    scale: float = 1.0,
    modifiers: Optional[dict[str, bool]] = None,
) -> dict[str, float]:
    """
    Get metric impacts for a proposal type with optional modifiers.
    
    Args:
        proposal_type: Type of proposal (e.g., 'park', 'upzone')
        scale: Scale multiplier for impacts
        modifiers: Optional modifiers like affordable housing, green space
        
    Returns:
        Dictionary of metric key to delta value
    """
    base_impacts = PROPOSAL_METRIC_IMPACTS.get(proposal_type, {})
    impacts = {k: v * scale for k, v in base_impacts.items()}
    
    # Apply modifiers
    if modifiers:
        if modifiers.get("includes_affordable_housing"):
            impacts["affordability"] = impacts.get("affordability", 0) + 0.15
            impacts["equity"] = impacts.get("equity", 0) + 0.1
            impacts["housing"] = impacts.get("housing", 0) + 0.1
        
        if modifiers.get("includes_green_space"):
            impacts["environment"] = impacts.get("environment", 0) + 0.1
            impacts["equity"] = impacts.get("equity", 0) + 0.05
        
        if modifiers.get("includes_transit_access"):
            impacts["mobility"] = impacts.get("mobility", 0) + 0.1
            impacts["equity"] = impacts.get("equity", 0) + 0.05
    
    return impacts

