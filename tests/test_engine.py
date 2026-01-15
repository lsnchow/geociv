"""Tests for the simulation engine."""

import pytest
from uuid import uuid4

from app.engine.simulator import CivicSimulator, ScenarioData, ClusterData
from app.engine.exposure import Location, ExposureCalculator, haversine_distance
from app.engine.archetypes import ARCHETYPES, get_archetype
from app.engine.metrics import METRICS, get_metric_impacts
from app.schemas.proposal import SpatialProposal, CitywideProposal, SpatialProposalType, CitywideProposalType


class TestExposure:
    """Tests for exposure calculations."""

    def test_haversine_same_location(self):
        """Distance between same points should be 0."""
        loc = Location(44.2312, -76.4860)
        assert haversine_distance(loc, loc) == 0.0

    def test_haversine_known_distance(self):
        """Test with known distance between two points."""
        # Queen's to downtown Kingston ~1.5km
        queens = Location(44.2253, -76.4951)
        downtown = Location(44.2312, -76.4800)
        distance = haversine_distance(queens, downtown)
        assert 1.0 < distance < 2.0  # Approximately 1.5km

    def test_exposure_decay(self):
        """Test that exposure decreases with distance."""
        calc = ExposureCalculator(lambda_decay=1.0)
        proposal = Location(44.2312, -76.4860)
        
        near = Location(44.2320, -76.4870)  # Very close
        far = Location(44.2500, -76.5000)  # Further away
        
        exposure_near = calc.calculate_exposure(proposal, near)
        exposure_far = calc.calculate_exposure(proposal, far)
        
        assert exposure_near > exposure_far

    def test_exposure_lambda_effect(self):
        """Test that larger lambda = wider impact."""
        proposal = Location(44.2312, -76.4860)
        target = Location(44.2400, -76.4900)  # ~1km away
        
        calc_small = ExposureCalculator(lambda_decay=0.5)
        calc_large = ExposureCalculator(lambda_decay=2.0)
        
        exposure_small = calc_small.calculate_exposure(proposal, target)
        exposure_large = calc_large.calculate_exposure(proposal, target)
        
        assert exposure_large > exposure_small


class TestArchetypes:
    """Tests for archetype definitions."""

    def test_all_archetypes_defined(self):
        """Ensure all 10 archetypes are defined."""
        assert len(ARCHETYPES) == 10

    def test_weights_sum_approximately_one(self):
        """Archetype weights should sum close to 1."""
        for key, archetype in ARCHETYPES.items():
            total = sum(archetype.weights.values())
            assert 0.95 <= total <= 1.05, f"{key} weights sum to {total}"

    def test_get_archetype(self):
        """Test getting archetype by key."""
        student = get_archetype("university_student")
        assert student.name == "University Student"
        assert student.income_level == "low"


class TestMetrics:
    """Tests for metric definitions."""

    def test_all_metrics_defined(self):
        """Ensure all 6 metrics are defined."""
        assert len(METRICS) == 6
        expected = {"affordability", "housing", "mobility", "environment", "economy", "equity"}
        assert set(METRICS.keys()) == expected

    def test_metric_impacts_exist(self):
        """Test that all proposal types have metric impacts."""
        impacts = get_metric_impacts("park")
        assert "environment" in impacts
        assert impacts["environment"] > 0

    def test_modifiers_affect_impacts(self):
        """Test that modifiers change metric impacts."""
        base = get_metric_impacts("upzone")
        with_affordable = get_metric_impacts("upzone", modifiers={"includes_affordable_housing": True})
        
        assert with_affordable["affordability"] > base["affordability"]


class TestSimulator:
    """Tests for the main simulator."""

    @pytest.fixture
    def scenario(self):
        """Create a test scenario."""
        return ScenarioData(
            id=uuid4(),
            name="Test Scenario",
            seed=42,
            lambda_decay=1.0,
            baseline_metrics={k: 0.5 for k in METRICS.keys()},
            clusters=[
                ClusterData(
                    id=uuid4(),
                    name="Cluster A",
                    location=Location(44.23, -76.48),
                    population=5000,
                    archetype_distribution={
                        "university_student": 0.4,
                        "low_income_renter": 0.3,
                        "middle_income_homeowner": 0.3,
                    },
                    baseline_metrics={k: 0.5 for k in METRICS.keys()},
                ),
                ClusterData(
                    id=uuid4(),
                    name="Cluster B",
                    location=Location(44.25, -76.50),
                    population=3000,
                    archetype_distribution={
                        "high_income_professional": 0.5,
                        "developer_builder": 0.3,
                        "small_business_owner": 0.2,
                    },
                    baseline_metrics={k: 0.5 for k in METRICS.keys()},
                ),
            ],
        )

    def test_simulate_spatial_proposal(self, scenario):
        """Test simulating a spatial proposal."""
        simulator = CivicSimulator(scenario)
        
        proposal = SpatialProposal(
            title="Test Park",
            spatial_type=SpatialProposalType.PARK,
            latitude=44.23,
            longitude=-76.48,
        )
        
        result = simulator.simulate(proposal)
        
        assert -100 <= result.overall_approval <= 100
        assert len(result.approval_by_archetype) > 0
        assert len(result.approval_by_region) == 2
        assert len(result.top_drivers) > 0

    def test_simulate_citywide_proposal(self, scenario):
        """Test simulating a citywide proposal."""
        simulator = CivicSimulator(scenario)
        
        proposal = CitywideProposal(
            title="Test Subsidy",
            citywide_type=CitywideProposalType.SUBSIDY,
            amount=100,
            income_targeted=True,
            target_income_level="low",
        )
        
        result = simulator.simulate(proposal)
        
        assert -100 <= result.overall_approval <= 100
        assert len(result.approval_by_archetype) > 0

    def test_determinism(self, scenario):
        """Test that simulation is deterministic."""
        simulator = CivicSimulator(scenario)
        
        proposal = SpatialProposal(
            title="Test",
            spatial_type=SpatialProposalType.PARK,
            latitude=44.23,
            longitude=-76.48,
        )
        
        result1 = simulator.simulate(proposal)
        result2 = simulator.simulate(proposal)
        
        assert result1.overall_approval == result2.overall_approval

    def test_exposure_affects_scores(self, scenario):
        """Test that nearby clusters are more affected."""
        simulator = CivicSimulator(scenario)
        
        # Proposal near Cluster A
        proposal = SpatialProposal(
            title="Near A",
            spatial_type=SpatialProposalType.PARK,
            latitude=44.23,
            longitude=-76.48,
        )
        
        result = simulator.simulate(proposal)
        
        # Find region approvals
        region_a = next(r for r in result.approval_by_region if r.cluster_name == "Cluster A")
        region_b = next(r for r in result.approval_by_region if r.cluster_name == "Cluster B")
        
        # Cluster A should have higher exposure
        assert region_a.exposure > region_b.exposure

