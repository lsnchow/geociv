#!/usr/bin/env python3
"""
Script to seed the Kingston scenario into the database.

Usage:
    python scripts/seed_kingston.py

Requires the database to be running and DATABASE_URL to be set.
"""

import asyncio
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select
from app.database import async_session_maker, init_db
from app.models.scenario import Scenario, Cluster, ClusterArchetypeDistribution
from app.seed_data import get_kingston_scenario


async def seed_kingston():
    """Seed the Kingston scenario."""
    print("Initializing database...")
    await init_db()
    
    async with async_session_maker() as db:
        # Check if Kingston scenario already exists
        result = await db.execute(
            select(Scenario).where(Scenario.name == "Kingston, Ontario")
        )
        existing = result.scalar_one_or_none()
        
        if existing:
            print(f"Kingston scenario already exists with ID: {existing.id}")
            print("Delete it first if you want to re-seed.")
            return existing.id
        
        # Create scenario
        scenario_data = get_kingston_scenario()
        
        scenario = Scenario(
            name=scenario_data.name,
            description=scenario_data.description,
            seed=scenario_data.seed,
            lambda_decay=scenario_data.lambda_decay,
            baseline_metrics=scenario_data.baseline_metrics,
        )
        db.add(scenario)
        await db.flush()
        
        print(f"Created scenario: {scenario.name} (ID: {scenario.id})")
        
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
            await db.flush()
            
            print(f"  Created cluster: {cluster.name} (pop: {cluster.population})")
            
            # Create archetype distributions
            for dist in cluster_config.archetype_distributions:
                distribution = ClusterArchetypeDistribution(
                    cluster_id=cluster.id,
                    archetype_key=dist.archetype_key,
                    percentage=dist.percentage,
                )
                db.add(distribution)
            
        await db.commit()
        
        print(f"\n✅ Kingston scenario seeded successfully!")
        print(f"   Scenario ID: {scenario.id}")
        print(f"   Total clusters: {len(scenario_data.clusters)}")
        print(f"   Total population: {sum(c.population for c in scenario_data.clusters)}")
        
        return scenario.id


if __name__ == "__main__":
    scenario_id = asyncio.run(seed_kingston())
    print(f"\nUse this scenario_id in API calls: {scenario_id}")

