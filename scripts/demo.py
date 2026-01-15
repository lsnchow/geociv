#!/usr/bin/env python3
"""
Demo script showing CivicSim in action.

Usage:
    python scripts/demo.py

This script demonstrates the three main demo scenarios from the PRD:
1. Citywide policy (grocery rebate)
2. Spatial build (park near university)
3. Compromise (upzone with affordable housing)
"""

import asyncio
import sys
from pathlib import Path
from uuid import UUID

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import async_session_maker, init_db
from app.models.scenario import Scenario, Cluster
from app.engine.simulator import CivicSimulator, ScenarioData, ClusterData
from app.engine.exposure import Location
from app.schemas.proposal import SpatialProposal, CitywideProposal, SpatialProposalType, CitywideProposalType
from app.seed_data import DEMO_PROPOSALS


def print_header(title: str):
    """Print a formatted header."""
    print("\n" + "=" * 60)
    print(f"  {title}")
    print("=" * 60)


def print_results(result):
    """Print simulation results in a readable format."""
    print(f"\n📊 Overall Approval: {result.overall_approval:.1f} ({result.overall_sentiment})")
    
    print("\n👥 Approval by Archetype:")
    for arch in result.approval_by_archetype[:5]:
        emoji = "✅" if arch.score > 20 else "❌" if arch.score < -20 else "➖"
        print(f"   {emoji} {arch.archetype_name}: {arch.score:.1f} ({arch.sentiment})")
    
    print("\n📍 Approval by Region:")
    for region in result.approval_by_region[:3]:
        emoji = "✅" if region.score > 20 else "❌" if region.score < -20 else "➖"
        print(f"   {emoji} {region.cluster_name}: {region.score:.1f} (exposure: {region.exposure:.2f})")
    
    print("\n🎯 Top Drivers:")
    for driver in result.top_drivers:
        arrow = "↑" if driver.direction == "positive" else "↓" if driver.direction == "negative" else "→"
        print(f"   {arrow} {driver.metric_name}: {driver.explanation}")


async def load_scenario(db, scenario_name: str = "Kingston, Ontario") -> ScenarioData:
    """Load scenario from database."""
    result = await db.execute(
        select(Scenario)
        .where(Scenario.name == scenario_name)
        .options(
            selectinload(Scenario.clusters)
            .selectinload(Cluster.archetype_distributions)
        )
    )
    scenario = result.scalar_one_or_none()
    
    if not scenario:
        raise Exception(f"Scenario '{scenario_name}' not found. Run seed_kingston.py first.")
    
    clusters = []
    for cluster in scenario.clusters:
        archetype_dist = {
            d.archetype_key: d.percentage
            for d in cluster.archetype_distributions
        }
        clusters.append(ClusterData(
            id=cluster.id,
            name=cluster.name,
            location=Location(cluster.latitude, cluster.longitude),
            population=cluster.population,
            archetype_distribution=archetype_dist,
            baseline_metrics=cluster.baseline_metrics or scenario.baseline_metrics,
        ))
    
    return ScenarioData(
        id=scenario.id,
        name=scenario.name,
        seed=scenario.seed,
        lambda_decay=scenario.lambda_decay,
        baseline_metrics=scenario.baseline_metrics,
        clusters=clusters,
    )


async def run_demos():
    """Run all demo scenarios."""
    print("\n🏛️  CivicSim Demo - Kingston Civic Reaction Simulator")
    print("=" * 60)
    
    await init_db()
    
    async with async_session_maker() as db:
        try:
            scenario = await load_scenario(db)
        except Exception as e:
            print(f"\n❌ Error: {e}")
            print("Please run: python scripts/seed_kingston.py")
            return
        
        print(f"\n📍 Loaded scenario: {scenario.name}")
        print(f"   Population: {scenario.total_population:,}")
        print(f"   Clusters: {len(scenario.clusters)}")
        
        simulator = CivicSimulator(scenario)
        
        # Demo 1: Citywide Policy
        print_header("Demo 1: Citywide Policy - Grocery Rebate")
        print("\nProposal: $50/month grocery rebate for low-income residents")
        print("          funded by a small property tax increase")
        
        proposal1 = CitywideProposal(
            title="$50/Month Grocery Rebate",
            description="Monthly grocery rebate for low-income residents funded by property tax increase",
            citywide_type=CitywideProposalType.SUBSIDY,
            amount=50,
            income_targeted=True,
            target_income_level="low",
        )
        
        result1 = simulator.simulate(proposal1)
        print_results(result1)
        
        # Demo 2: Spatial Build
        print_header("Demo 2: Spatial Build - Park Near University")
        print("\nProposal: Build a new 2-hectare park with walking trails")
        print("          near Queen's University")
        
        proposal2 = SpatialProposal(
            title="New Park Near Queen's University",
            description="Build a 2-hectare park with walking trails and green space",
            spatial_type=SpatialProposalType.PARK,
            latitude=44.2280,
            longitude=-76.4920,
            scale=1.0,
            includes_green_space=True,
        )
        
        result2 = simulator.simulate(proposal2)
        print_results(result2)
        
        # Demo 3: Compromise - Compare upzone with and without affordable housing
        print_header("Demo 3: Compromise - Upzone With Mitigations")
        print("\nComparing: Downtown upzoning with and without affordable housing requirement")
        
        # Without mitigation
        print("\n--- Without Affordable Housing Requirement ---")
        proposal3a = SpatialProposal(
            title="Downtown Density Increase (Basic)",
            description="Upzone downtown area to allow 6-story mixed-use buildings",
            spatial_type=SpatialProposalType.UPZONE,
            latitude=44.2312,
            longitude=-76.4800,
            scale=1.2,
            includes_affordable_housing=False,
        )
        
        result3a = simulator.simulate(proposal3a)
        print(f"   Overall Approval: {result3a.overall_approval:.1f}")
        
        # With mitigation
        print("\n--- With Affordable Housing + Green Space Requirements ---")
        proposal3b = SpatialProposal(
            title="Downtown Density Increase (With Mitigations)",
            description="Upzone downtown with affordable housing and green space requirements",
            spatial_type=SpatialProposalType.UPZONE,
            latitude=44.2312,
            longitude=-76.4800,
            scale=1.2,
            includes_affordable_housing=True,
            includes_green_space=True,
        )
        
        result3b = simulator.simulate(proposal3b)
        print(f"   Overall Approval: {result3b.overall_approval:.1f}")
        
        improvement = result3b.overall_approval - result3a.overall_approval
        print(f"\n   💡 Adding mitigations improved approval by {improvement:.1f} points!")
        
        print_header("Demo Complete!")
        print("\nKey Takeaways:")
        print("• Subsidies targeted at low-income residents gain support from affected groups")
        print("• Local developments (parks) have concentrated support in nearby areas")
        print("• Mitigations like affordable housing can significantly shift public opinion")
        print("\nTry the API endpoints to explore more scenarios!")


if __name__ == "__main__":
    asyncio.run(run_demos())

