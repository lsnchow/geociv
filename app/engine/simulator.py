"""Core simulation engine for CivicSim."""

import math
from dataclasses import dataclass
from typing import Optional, Union
from uuid import UUID

import numpy as np

from app.engine.archetypes import ARCHETYPES, ArchetypeDefinition
from app.engine.exposure import ExposureCalculator, Location, get_lambda_for_proposal
from app.engine.metrics import METRICS, get_metric_impacts
from app.schemas.proposal import SpatialProposal, CitywideProposal
from app.schemas.simulation import (
    ArchetypeApproval,
    RegionApproval,
    MetricDriver,
    DebugInfo,
    SimulateResponse,
)


@dataclass
class ClusterData:
    """Data for a population cluster."""

    id: UUID
    name: str
    location: Location
    population: int
    archetype_distribution: dict[str, float]  # archetype_key -> percentage
    baseline_metrics: dict[str, float]


@dataclass
class ScenarioData:
    """Data for a simulation scenario."""

    id: UUID
    name: str
    seed: int
    lambda_decay: float
    baseline_metrics: dict[str, float]
    clusters: list[ClusterData]

    @property
    def total_population(self) -> int:
        return sum(c.population for c in self.clusters)


class CivicSimulator:
    """
    Main simulation engine.
    
    Computes how different archetypes in different regions react to proposals.
    """

    def __init__(self, scenario: ScenarioData):
        """Initialize simulator with scenario data."""
        self.scenario = scenario
        self.rng = np.random.default_rng(scenario.seed)

    def simulate(
        self,
        proposal: Union[SpatialProposal, CitywideProposal],
        lambda_override: Optional[float] = None,
        include_debug: bool = True,
    ) -> SimulateResponse:
        """
        Run a simulation for a proposal.
        
        Args:
            proposal: The proposal to simulate
            lambda_override: Optional lambda decay override
            include_debug: Whether to include debug info
            
        Returns:
            Full simulation response
        """
        # Determine proposal type and get metric impacts
        if proposal.type == "spatial":
            return self._simulate_spatial(proposal, lambda_override, include_debug)
        else:
            return self._simulate_citywide(proposal, include_debug)

    def _simulate_spatial(
        self,
        proposal: SpatialProposal,
        lambda_override: Optional[float],
        include_debug: bool,
    ) -> SimulateResponse:
        """Simulate a spatial proposal."""
        # Get lambda for this proposal type
        proposal_type = proposal.spatial_type.value
        lambda_decay = lambda_override or get_lambda_for_proposal(
            proposal_type, self.scenario.lambda_decay
        )
        
        # Create exposure calculator
        exposure_calc = ExposureCalculator(lambda_decay)
        proposal_location = Location(proposal.latitude, proposal.longitude)
        
        # Get metric impacts with modifiers
        modifiers = {
            "includes_affordable_housing": proposal.includes_affordable_housing,
            "includes_green_space": proposal.includes_green_space,
            "includes_transit_access": proposal.includes_transit_access,
        }
        metric_deltas = get_metric_impacts(proposal_type, proposal.scale, modifiers)
        
        # Calculate per-cluster exposures
        cluster_exposures = {}
        for cluster in self.scenario.clusters:
            exposure = exposure_calc.calculate_exposure(
                proposal_location, cluster.location
            )
            cluster_exposures[cluster.name] = exposure
        
        # Calculate approval by archetype and region
        return self._compute_approvals(
            metric_deltas,
            cluster_exposures,
            lambda_decay,
            include_debug,
        )

    def _simulate_citywide(
        self,
        proposal: CitywideProposal,
        include_debug: bool,
    ) -> SimulateResponse:
        """Simulate a citywide policy proposal."""
        proposal_type = proposal.citywide_type.value
        
        # Get base metric impacts
        scale = 1.0
        if proposal.percentage:
            scale = proposal.percentage / 100.0
        elif proposal.amount:
            # Normalize amount to a scale (assuming $100 = 1.0)
            scale = min(proposal.amount / 100.0, 3.0)
        
        metric_deltas = get_metric_impacts(proposal_type, scale)
        
        # For citywide, all clusters have base exposure of 1.0
        # but we'll adjust per-archetype based on their attributes
        cluster_exposures = {c.name: 1.0 for c in self.scenario.clusters}
        
        # Modify metric deltas based on targeting
        if proposal.income_targeted and proposal.target_income_level:
            # Will be handled per-archetype in compute_approvals
            pass
        
        return self._compute_approvals(
            metric_deltas,
            cluster_exposures,
            self.scenario.lambda_decay,
            include_debug,
            citywide_type=proposal_type,
            income_target=proposal.target_income_level if proposal.income_targeted else None,
        )

    def _compute_approvals(
        self,
        metric_deltas: dict[str, float],
        cluster_exposures: dict[str, float],
        lambda_used: float,
        include_debug: bool,
        citywide_type: Optional[str] = None,
        income_target: Optional[str] = None,
    ) -> SimulateResponse:
        """
        Compute approval scores across archetypes and regions.
        
        This is the core scoring algorithm.
        """
        archetype_approvals: list[ArchetypeApproval] = []
        region_approvals: list[RegionApproval] = []
        raw_utilities: dict[str, float] = {}
        
        # Track overall weighted approval
        total_weighted_approval = 0.0
        total_population = self.scenario.total_population
        
        # Calculate per-archetype utility and approval
        archetype_populations: dict[str, int] = {}
        archetype_utilities: dict[str, float] = {}
        
        for archetype_key, archetype in ARCHETYPES.items():
            # Calculate weighted utility across all clusters
            weighted_utility = 0.0
            archetype_pop = 0
            
            for cluster in self.scenario.clusters:
                if archetype_key not in cluster.archetype_distribution:
                    continue
                
                cluster_pop = int(cluster.population * cluster.archetype_distribution[archetype_key])
                if cluster_pop == 0:
                    continue
                
                archetype_pop += cluster_pop
                exposure = cluster_exposures.get(cluster.name, 1.0)
                
                # Adjust exposure for citywide proposals based on archetype
                if citywide_type:
                    exposure_calc = ExposureCalculator(1.0)
                    exposure *= exposure_calc.calculate_citywide_exposure(
                        archetype_key,
                        archetype.income_level,
                        archetype.housing_status == "renter",
                        archetype.business_owner,
                        citywide_type,
                    )
                    
                    # Apply income targeting
                    if income_target:
                        if income_target != "all" and archetype.income_level != income_target:
                            exposure *= 0.3  # Much less affected if not targeted
                
                # Calculate utility for this archetype in this cluster
                utility = self._compute_utility(archetype, metric_deltas, exposure)
                weighted_utility += utility * cluster_pop
            
            if archetype_pop > 0:
                avg_utility = weighted_utility / archetype_pop
                archetype_utilities[archetype_key] = avg_utility
                archetype_populations[archetype_key] = archetype_pop
                raw_utilities[archetype_key] = avg_utility
        
        # Convert utilities to approval scores and create response objects
        for archetype_key, utility in archetype_utilities.items():
            archetype = ARCHETYPES[archetype_key]
            score = self._utility_to_score(utility)
            pop = archetype_populations[archetype_key]
            pop_pct = (pop / total_population) * 100
            
            total_weighted_approval += score * pop
            
            # Find top driver for this archetype
            top_driver, driver_dir = self._get_top_driver(archetype, metric_deltas)
            
            archetype_approvals.append(ArchetypeApproval(
                archetype_key=archetype_key,
                archetype_name=archetype.name,
                score=round(score, 1),
                population_pct=round(pop_pct, 1),
                sentiment=self._score_to_sentiment(score),
                top_driver=top_driver,
                driver_direction=driver_dir,
            ))
        
        # Sort by score (descending)
        archetype_approvals.sort(key=lambda x: x.score, reverse=True)
        
        # Calculate per-region approval
        for cluster in self.scenario.clusters:
            exposure = cluster_exposures.get(cluster.name, 1.0)
            
            # Weighted average of archetype approvals in this cluster
            cluster_utility = 0.0
            cluster_pop = 0
            
            for archetype_key, pct in cluster.archetype_distribution.items():
                if archetype_key in archetype_utilities:
                    archetype_pop = int(cluster.population * pct)
                    cluster_utility += archetype_utilities[archetype_key] * archetype_pop
                    cluster_pop += archetype_pop
            
            if cluster_pop > 0:
                avg_utility = cluster_utility / cluster_pop
                score = self._utility_to_score(avg_utility * exposure)
                
                region_approvals.append(RegionApproval(
                    cluster_id=str(cluster.id),
                    cluster_name=cluster.name,
                    score=round(score, 1),
                    exposure=round(exposure, 2),
                    population=cluster.population,
                    sentiment=self._score_to_sentiment(score),
                ))
        
        # Sort by score (descending)
        region_approvals.sort(key=lambda x: x.score, reverse=True)
        
        # Calculate overall approval
        overall_approval = total_weighted_approval / total_population if total_population > 0 else 0
        
        # Get top drivers (aggregate across all archetypes)
        top_drivers = self._get_top_drivers(metric_deltas)
        
        # Build debug info
        debug = None
        if include_debug:
            debug = DebugInfo(
                seed=self.scenario.seed,
                lambda_decay=lambda_used,
                total_population=total_population,
                cluster_count=len(self.scenario.clusters),
                exposure_values=cluster_exposures,
                raw_utility_scores=raw_utilities,
            )
        
        return SimulateResponse(
            overall_approval=round(overall_approval, 1),
            overall_sentiment=self._score_to_sentiment(overall_approval),
            approval_by_archetype=archetype_approvals,
            approval_by_region=region_approvals,
            top_drivers=top_drivers,
            metric_deltas={k: round(v, 3) for k, v in metric_deltas.items()},
            debug=debug,
        )

    def _compute_utility(
        self,
        archetype: ArchetypeDefinition,
        metric_deltas: dict[str, float],
        exposure: float,
    ) -> float:
        """
        Compute utility for an archetype given metric changes.
        
        U = Σ (w_m * Δm * exposure) * (1 - change_aversion * |Δ_total|)
        """
        utility = 0.0
        
        for metric_key, delta in metric_deltas.items():
            weight = archetype.weights.get(metric_key, 0.0)
            contribution = weight * delta * exposure
            utility += contribution
        
        # Apply change aversion (dampens both positive and negative)
        total_change = sum(abs(d) for d in metric_deltas.values())
        aversion_factor = 1.0 - (archetype.change_aversion * min(total_change, 1.0) * 0.3)
        utility *= aversion_factor
        
        return utility

    def _utility_to_score(self, utility: float) -> float:
        """
        Convert raw utility to approval score (-100 to 100).
        
        Uses logistic function for smooth mapping.
        """
        # Scale utility (typical values are -0.5 to 0.5)
        scaled = utility * 5  # Amplify for more spread
        
        # Logistic transform: maps (-inf, inf) to (-100, 100)
        score = 100 * (2 / (1 + math.exp(-scaled)) - 1)
        
        return max(-100, min(100, score))

    def _score_to_sentiment(self, score: float) -> str:
        """Convert score to sentiment label."""
        if score >= 50:
            return "strong_support"
        elif score >= 20:
            return "support"
        elif score >= -20:
            return "neutral"
        elif score >= -50:
            return "oppose"
        else:
            return "strong_oppose"

    def _get_top_driver(
        self,
        archetype: ArchetypeDefinition,
        metric_deltas: dict[str, float],
    ) -> tuple[Optional[str], Optional[str]]:
        """Get the top metric driver for an archetype."""
        max_contribution = 0
        top_driver = None
        driver_direction = None
        
        for metric_key, delta in metric_deltas.items():
            weight = archetype.weights.get(metric_key, 0.0)
            contribution = abs(weight * delta)
            
            if contribution > max_contribution:
                max_contribution = contribution
                top_driver = metric_key
                driver_direction = "positive" if delta > 0 else "negative"
        
        return top_driver, driver_direction

    def _get_top_drivers(
        self,
        metric_deltas: dict[str, float],
        limit: int = 3,
    ) -> list[MetricDriver]:
        """Get the top metric drivers across all archetypes."""
        drivers = []
        
        # Calculate average weighted contribution across archetypes
        metric_contributions: dict[str, float] = {}
        
        for metric_key, delta in metric_deltas.items():
            total_weight = sum(
                a.weights.get(metric_key, 0.0) for a in ARCHETYPES.values()
            ) / len(ARCHETYPES)
            
            contribution = total_weight * delta
            metric_contributions[metric_key] = contribution
        
        # Sort by absolute contribution
        sorted_metrics = sorted(
            metric_contributions.items(),
            key=lambda x: abs(x[1]),
            reverse=True,
        )
        
        for metric_key, contribution in sorted_metrics[:limit]:
            delta = metric_deltas[metric_key]
            metric_def = METRICS.get(metric_key)
            
            if abs(delta) < 0.05:
                magnitude = "low"
            elif abs(delta) < 0.2:
                magnitude = "medium"
            else:
                magnitude = "high"
            
            direction = "positive" if delta > 0 else "negative" if delta < 0 else "neutral"
            
            # Generate explanation
            if direction == "positive":
                explanation = f"This proposal improves {metric_def.name.lower()}"
            elif direction == "negative":
                explanation = f"This proposal reduces {metric_def.name.lower()}"
            else:
                explanation = f"This proposal has minimal impact on {metric_def.name.lower()}"
            
            drivers.append(MetricDriver(
                metric_key=metric_key,
                metric_name=metric_def.name if metric_def else metric_key,
                delta=round(delta, 3),
                direction=direction,
                magnitude=magnitude,
                contribution=round(contribution, 3),
                explanation=explanation,
            ))
        
        return drivers
