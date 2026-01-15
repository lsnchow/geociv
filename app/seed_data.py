"""Seed data for Kingston scenario."""

from app.schemas.scenario import ScenarioCreate, ClusterConfig, ArchetypeDistributionConfig


def get_kingston_scenario() -> ScenarioCreate:
    """
    Create the default Kingston scenario.
    
    Based on real Kingston, Ontario geography with synthetic but
    realistic population distributions.
    """
    return ScenarioCreate(
        name="Kingston, Ontario",
        description="Synthetic model of Kingston with university, downtown, suburban, and industrial clusters",
        seed=42,
        lambda_decay=1.0,
        baseline_metrics={
            "affordability": 0.45,  # Housing is expensive
            "housing": 0.40,  # Limited supply
            "mobility": 0.55,  # Decent transit
            "environment": 0.65,  # Good green space
            "economy": 0.60,  # Stable economy
            "equity": 0.50,  # Average
        },
        clusters=[
            # University cluster (Queen's area)
            ClusterConfig(
                name="University District",
                description="Queen's University and surrounding student housing area",
                latitude=44.2253,
                longitude=-76.4951,
                population=15000,
                baseline_metrics={
                    "affordability": 0.35,  # Expensive student housing
                    "mobility": 0.70,  # Walkable
                    "environment": 0.70,  # Campus green space
                },
                archetype_distributions=[
                    ArchetypeDistributionConfig(archetype_key="university_student", percentage=0.55),
                    ArchetypeDistributionConfig(archetype_key="low_income_renter", percentage=0.15),
                    ArchetypeDistributionConfig(archetype_key="young_family", percentage=0.05),
                    ArchetypeDistributionConfig(archetype_key="high_income_professional", percentage=0.10),
                    ArchetypeDistributionConfig(archetype_key="small_business_owner", percentage=0.08),
                    ArchetypeDistributionConfig(archetype_key="environmental_advocate", percentage=0.07),
                ],
            ),
            # Downtown cluster
            ClusterConfig(
                name="Downtown",
                description="City center with shops, restaurants, and mixed housing",
                latitude=44.2312,
                longitude=-76.4800,
                population=12000,
                baseline_metrics={
                    "affordability": 0.40,
                    "economy": 0.75,  # Business hub
                    "mobility": 0.65,
                },
                archetype_distributions=[
                    ArchetypeDistributionConfig(archetype_key="small_business_owner", percentage=0.20),
                    ArchetypeDistributionConfig(archetype_key="high_income_professional", percentage=0.18),
                    ArchetypeDistributionConfig(archetype_key="low_income_renter", percentage=0.15),
                    ArchetypeDistributionConfig(archetype_key="senior_fixed_income", percentage=0.12),
                    ArchetypeDistributionConfig(archetype_key="university_student", percentage=0.15),
                    ArchetypeDistributionConfig(archetype_key="middle_income_homeowner", percentage=0.10),
                    ArchetypeDistributionConfig(archetype_key="environmental_advocate", percentage=0.10),
                ],
            ),
            # West Suburbs
            ClusterConfig(
                name="West Suburbs",
                description="Family-oriented suburban neighborhoods",
                latitude=44.2350,
                longitude=-76.5200,
                population=18000,
                baseline_metrics={
                    "affordability": 0.50,
                    "housing": 0.55,
                    "mobility": 0.40,  # Car-dependent
                    "environment": 0.60,
                },
                archetype_distributions=[
                    ArchetypeDistributionConfig(archetype_key="middle_income_homeowner", percentage=0.35),
                    ArchetypeDistributionConfig(archetype_key="young_family", percentage=0.25),
                    ArchetypeDistributionConfig(archetype_key="senior_fixed_income", percentage=0.15),
                    ArchetypeDistributionConfig(archetype_key="high_income_professional", percentage=0.12),
                    ArchetypeDistributionConfig(archetype_key="industrial_worker", percentage=0.08),
                    ArchetypeDistributionConfig(archetype_key="developer_builder", percentage=0.05),
                ],
            ),
            # North Suburbs
            ClusterConfig(
                name="North Suburbs",
                description="Growing suburban area with newer developments",
                latitude=44.2600,
                longitude=-76.4900,
                population=14000,
                baseline_metrics={
                    "affordability": 0.55,
                    "housing": 0.60,  # More availability
                    "mobility": 0.35,  # Limited transit
                },
                archetype_distributions=[
                    ArchetypeDistributionConfig(archetype_key="young_family", percentage=0.30),
                    ArchetypeDistributionConfig(archetype_key="middle_income_homeowner", percentage=0.30),
                    ArchetypeDistributionConfig(archetype_key="developer_builder", percentage=0.10),
                    ArchetypeDistributionConfig(archetype_key="industrial_worker", percentage=0.12),
                    ArchetypeDistributionConfig(archetype_key="high_income_professional", percentage=0.10),
                    ArchetypeDistributionConfig(archetype_key="low_income_renter", percentage=0.08),
                ],
            ),
            # Industrial/East
            ClusterConfig(
                name="Industrial East",
                description="Industrial area and working-class neighborhoods",
                latitude=44.2300,
                longitude=-76.4500,
                population=10000,
                baseline_metrics={
                    "affordability": 0.60,  # More affordable
                    "environment": 0.40,  # Industrial impacts
                    "economy": 0.70,  # Jobs
                },
                archetype_distributions=[
                    ArchetypeDistributionConfig(archetype_key="industrial_worker", percentage=0.35),
                    ArchetypeDistributionConfig(archetype_key="low_income_renter", percentage=0.25),
                    ArchetypeDistributionConfig(archetype_key="middle_income_homeowner", percentage=0.15),
                    ArchetypeDistributionConfig(archetype_key="small_business_owner", percentage=0.10),
                    ArchetypeDistributionConfig(archetype_key="senior_fixed_income", percentage=0.10),
                    ArchetypeDistributionConfig(archetype_key="developer_builder", percentage=0.05),
                ],
            ),
        ],
    )


# Demo proposals for testing
DEMO_PROPOSALS = {
    "park_university": {
        "type": "spatial",
        "spatial_type": "park",
        "title": "New Park Near Queen's University",
        "description": "Build a 2-hectare park with walking trails and green space near the university district",
        "latitude": 44.2280,
        "longitude": -76.4920,
        "scale": 1.0,
        "includes_green_space": True,
    },
    "upzone_downtown": {
        "type": "spatial",
        "spatial_type": "upzone",
        "title": "Downtown Density Increase",
        "description": "Upzone downtown area to allow 6-story mixed-use buildings",
        "latitude": 44.2312,
        "longitude": -76.4800,
        "scale": 1.2,
        "includes_affordable_housing": True,
    },
    "transit_expansion": {
        "type": "spatial",
        "spatial_type": "transit_line",
        "title": "Bus Rapid Transit to North Suburbs",
        "description": "New BRT line connecting downtown to northern suburbs",
        "latitude": 44.2450,
        "longitude": -76.4850,
        "scale": 1.5,
    },
    "factory_east": {
        "type": "spatial",
        "spatial_type": "factory",
        "title": "New Manufacturing Facility",
        "description": "Light manufacturing plant bringing 200 jobs to east Kingston",
        "latitude": 44.2280,
        "longitude": -76.4480,
        "scale": 0.8,
    },
    "grocery_rebate": {
        "type": "citywide",
        "citywide_type": "subsidy",
        "title": "$50/Month Grocery Rebate",
        "description": "Monthly grocery rebate for low-income residents funded by property tax increase",
        "amount": 50,
        "income_targeted": True,
        "target_income_level": "low",
    },
    "property_tax_increase": {
        "type": "citywide",
        "citywide_type": "tax_increase",
        "title": "Property Tax Increase for Services",
        "description": "2% property tax increase to fund improved city services",
        "percentage": 2.0,
    },
    "transit_funding": {
        "type": "citywide",
        "citywide_type": "transit_funding",
        "title": "Transit Funding Boost",
        "description": "15% increase in public transit funding for better service",
        "percentage": 15.0,
    },
    "environmental_regulation": {
        "type": "citywide",
        "citywide_type": "environmental_policy",
        "title": "Green Building Requirements",
        "description": "New requirements for energy efficiency in all new construction",
        "affects_businesses": True,
    },
}

