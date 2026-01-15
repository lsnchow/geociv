"""Archetype definitions for CivicSim."""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ArchetypeDefinition:
    """Definition of a community archetype."""

    key: str
    name: str
    description: str
    
    # Preference weights for each metric (higher = cares more)
    # Weights should roughly sum to 1.0 but can vary for intensity
    weights: dict[str, float] = field(default_factory=dict)
    
    # Socioeconomic attributes
    income_level: str = "middle"  # low, middle, high
    housing_status: str = "mixed"  # renter, homeowner, mixed
    mobility_dependent: bool = False  # relies heavily on transit
    business_owner: bool = False
    
    # Behavioral modifiers
    change_aversion: float = 0.0  # -1 to 1, higher = more resistant to change
    local_focus: float = 0.5  # 0 to 1, higher = more affected by local changes
    
    # Optional constraints (thresholds that trigger strong opposition)
    constraints: Optional[dict[str, float]] = None


# Define the 10 core archetypes
ARCHETYPES: dict[str, ArchetypeDefinition] = {
    "low_income_renter": ArchetypeDefinition(
        key="low_income_renter",
        name="Low-Income Renter",
        description="Renter with limited income, highly sensitive to cost of living and transit access",
        weights={
            "affordability": 0.35,
            "mobility": 0.25,
            "equity": 0.20,
            "housing": 0.10,
            "environment": 0.05,
            "economy": 0.05,
        },
        income_level="low",
        housing_status="renter",
        mobility_dependent=True,
        change_aversion=0.1,
        local_focus=0.7,
    ),
    "middle_income_homeowner": ArchetypeDefinition(
        key="middle_income_homeowner",
        name="Middle-Income Homeowner",
        description="Homeowner with moderate income, balanced priorities with focus on property values",
        weights={
            "housing": 0.20,
            "affordability": 0.20,
            "economy": 0.20,
            "environment": 0.15,
            "mobility": 0.15,
            "equity": 0.10,
        },
        income_level="middle",
        housing_status="homeowner",
        change_aversion=0.2,
        local_focus=0.6,
    ),
    "high_income_professional": ArchetypeDefinition(
        key="high_income_professional",
        name="High-Income Professional",
        description="Well-paid professional, focused on economy and environment, less price-sensitive",
        weights={
            "economy": 0.30,
            "environment": 0.25,
            "housing": 0.15,
            "mobility": 0.15,
            "equity": 0.10,
            "affordability": 0.05,
        },
        income_level="high",
        housing_status="homeowner",
        change_aversion=0.1,
        local_focus=0.4,
    ),
    "university_student": ArchetypeDefinition(
        key="university_student",
        name="University Student",
        description="Student with limited income but high mobility needs and social awareness",
        weights={
            "affordability": 0.30,
            "mobility": 0.30,
            "environment": 0.15,
            "equity": 0.15,
            "housing": 0.05,
            "economy": 0.05,
        },
        income_level="low",
        housing_status="renter",
        mobility_dependent=True,
        change_aversion=-0.2,  # More open to change
        local_focus=0.8,
    ),
    "senior_fixed_income": ArchetypeDefinition(
        key="senior_fixed_income",
        name="Senior on Fixed Income",
        description="Retired senior with fixed income, values stability and accessibility",
        weights={
            "affordability": 0.30,
            "mobility": 0.20,
            "housing": 0.20,
            "equity": 0.15,
            "environment": 0.10,
            "economy": 0.05,
        },
        income_level="low",
        housing_status="mixed",
        mobility_dependent=True,
        change_aversion=0.4,  # Resistant to change
        local_focus=0.7,
    ),
    "small_business_owner": ArchetypeDefinition(
        key="small_business_owner",
        name="Small Business Owner",
        description="Local business owner, focused on foot traffic, economy, and regulations",
        weights={
            "economy": 0.40,
            "mobility": 0.20,
            "affordability": 0.15,
            "housing": 0.10,
            "environment": 0.10,
            "equity": 0.05,
        },
        income_level="middle",
        housing_status="mixed",
        business_owner=True,
        change_aversion=0.1,
        local_focus=0.9,  # Very locally focused
    ),
    "industrial_worker": ArchetypeDefinition(
        key="industrial_worker",
        name="Industrial Worker",
        description="Blue-collar worker, focused on jobs and commute, often commutes from suburbs",
        weights={
            "economy": 0.30,
            "mobility": 0.25,
            "affordability": 0.25,
            "housing": 0.10,
            "equity": 0.05,
            "environment": 0.05,
        },
        income_level="middle",
        housing_status="mixed",
        mobility_dependent=True,
        change_aversion=0.2,
        local_focus=0.4,  # Commutes, so less local
    ),
    "developer_builder": ArchetypeDefinition(
        key="developer_builder",
        name="Developer/Builder",
        description="Real estate developer, strongly pro-development and anti-regulation",
        weights={
            "housing": 0.35,
            "economy": 0.35,
            "affordability": 0.10,
            "mobility": 0.10,
            "environment": 0.05,
            "equity": 0.05,
        },
        income_level="high",
        housing_status="homeowner",
        business_owner=True,
        change_aversion=-0.3,  # Wants change
        local_focus=0.3,  # City-wide perspective
        constraints={"regulation_increase": -0.3},  # Opposes new regulations
    ),
    "environmental_advocate": ArchetypeDefinition(
        key="environmental_advocate",
        name="Environmental Advocate",
        description="Environmentally focused resident, prioritizes green space and sustainability",
        weights={
            "environment": 0.45,
            "equity": 0.20,
            "mobility": 0.15,
            "affordability": 0.10,
            "housing": 0.05,
            "economy": 0.05,
        },
        income_level="middle",
        housing_status="mixed",
        change_aversion=-0.1,
        local_focus=0.5,
    ),
    "young_family": ArchetypeDefinition(
        key="young_family",
        name="Young Family",
        description="Family with young children, focused on housing, schools, and safety",
        weights={
            "housing": 0.25,
            "equity": 0.20,  # Proxy for schools and services
            "environment": 0.20,
            "affordability": 0.15,
            "mobility": 0.15,
            "economy": 0.05,
        },
        income_level="middle",
        housing_status="mixed",
        change_aversion=0.15,
        local_focus=0.75,
    ),
}


def get_archetype(key: str) -> ArchetypeDefinition:
    """Get archetype definition by key."""
    if key not in ARCHETYPES:
        raise ValueError(f"Unknown archetype: {key}")
    return ARCHETYPES[key]


def get_all_archetypes() -> list[ArchetypeDefinition]:
    """Get all archetype definitions."""
    return list(ARCHETYPES.values())

