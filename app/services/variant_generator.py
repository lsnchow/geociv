"""AI Variant Generator - generates proposal variants and ranks them."""

import json
import uuid
import asyncio
from typing import Optional, Union
from copy import deepcopy

import httpx

from app.config import get_settings
from app.schemas.proposal import SpatialProposal, CitywideProposal
from app.schemas.ai import (
    RankedVariant,
    VariantBundle,
    GenerateVariantsRequest,
    GenerateVariantsResponse,
)
from app.engine.simulator import CivicSimulator, ScenarioData
from app.schemas.simulation import SimulateResponse

Proposal = Union[SpatialProposal, CitywideProposal]


# LLM prompt for generating creative variants
VARIANT_GENERATION_PROMPT = """You are a civic planning AI assistant. Given a base proposal, generate creative variants.

BASE PROPOSAL:
{base_proposal}

SCENARIO CONTEXT:
- Location: Kingston, Ontario
- Key archetypes: Young renters, Homeowners, Seniors, Small business owners, Students

Generate exactly this JSON structure:
{{
  "alternates": [
    {{
      "name": "Variant name",
      "description": "Why this approach differs",
      "changes": {{"field": "new_value"}},
      "rationale": "Why this might work better"
    }}
  ],
  "compromises": [
    {{
      "name": "Compromise name", 
      "description": "How this balances concerns",
      "changes": {{"field": "new_value"}},
      "groups_helped": ["archetype1", "archetype2"]
    }}
  ],
  "spicy": {{
    "name": "Bold variant name",
    "description": "An ambitious version",
    "changes": {{"field": "new_value"}},
    "risk_reward": "Why this is bold but could pay off"
  }}
}}

For SPATIAL proposals, you can modify: scale (0.5-2.0), radius_km (0.2-3.0), includes_affordable_housing, includes_green_space, includes_transit_access
For CITYWIDE proposals, you can modify: amount (10-500), percentage (1-50), income_targeted, target_income_level

Generate 3 alternates, 3 compromises, and 1 spicy variant. Be creative but realistic."""


class VariantGenerator:
    """
    Generates proposal variants and ranks them by multiple criteria.
    
    Flow:
    1. Generate 7 variants using LLM (or deterministic fallback)
    2. Run simulation on each variant
    3. Rank by: support, equity, environment, feasibility
    4. Return bundle with recommendations
    """

    def __init__(self, api_key: Optional[str] = None):
        settings = get_settings()
        self.api_key = api_key or settings.backboard_api_key
        self.base_url = settings.backboard_base_url
        self.headers = {
            "X-API-Key": self.api_key,
            "Accept": "application/json",
        }

    async def generate_variants(
        self,
        base_proposal: Proposal,
        scenario_data: ScenarioData,
        ranking_priorities: list[str] = None,
        include_spicy: bool = True,
    ) -> VariantBundle:
        """
        Generate variants for a proposal and rank them.
        
        Args:
            base_proposal: The starting proposal
            scenario_data: Scenario context for simulation
            ranking_priorities: Order of criteria for ranking
            include_spicy: Whether to include bold variant
            
        Returns:
            VariantBundle with all variants ranked
        """
        ranking_priorities = ranking_priorities or ["support", "equity", "environment", "feasibility"]
        
        # Step 1: Generate variant proposals
        variant_proposals = await self._generate_variant_proposals(base_proposal, include_spicy)
        
        # Step 2: Simulate all variants (including base)
        simulator = CivicSimulator(scenario_data)
        all_proposals = [base_proposal] + variant_proposals
        
        results = []
        for proposal in all_proposals:
            try:
                result = simulator.simulate(proposal, include_debug=False)
                results.append(result)
            except Exception:
                # If simulation fails, use neutral result
                results.append(self._create_neutral_result())
        
        # Step 3: Build ranked variants
        base_result = results[0]
        base_ranked = self._build_ranked_variant(
            id=str(uuid.uuid4()),
            variant_type="base",
            name="Original Proposal",
            description="The base proposal as submitted",
            proposal=base_proposal,
            result=base_result,
            changes_from_base=[],
        )
        
        alternates = []
        compromises = []
        spicy = None
        
        variant_idx = 1
        for i, (proposal, result) in enumerate(zip(variant_proposals, results[1:])):
            variant_type = "alternate" if i < 3 else "compromise" if i < 6 else "spicy"
            
            ranked = self._build_ranked_variant(
                id=str(uuid.uuid4()),
                variant_type=variant_type,
                name=f"{variant_type.title()} {(i % 3) + 1}" if variant_type != "spicy" else "Bold Vision",
                description=self._describe_variant(base_proposal, proposal),
                proposal=proposal,
                result=result,
                changes_from_base=self._get_changes(base_proposal, proposal),
            )
            
            if variant_type == "alternate":
                alternates.append(ranked)
            elif variant_type == "compromise":
                compromises.append(ranked)
            else:
                spicy = ranked
        
        # Ensure we have all required variants
        while len(alternates) < 3:
            alternates.append(self._create_fallback_variant(base_proposal, base_result, "alternate", len(alternates)))
        while len(compromises) < 3:
            compromises.append(self._create_fallback_variant(base_proposal, base_result, "compromise", len(compromises)))
        if spicy is None:
            spicy = self._create_fallback_variant(base_proposal, base_result, "spicy", 0)
        
        # Step 4: Build rankings
        all_variants = [base_ranked] + alternates + compromises + [spicy]
        rankings = self._compute_rankings(all_variants, ranking_priorities)
        
        # Step 5: Generate recommendation
        recommended_id, recommendation_reason = self._generate_recommendation(
            all_variants, rankings, ranking_priorities
        )
        
        return VariantBundle(
            base=base_ranked,
            alternates=alternates,
            compromises=compromises,
            spicy=spicy,
            rankings=rankings,
            analysis_summary=self._generate_analysis_summary(all_variants, rankings),
            recommended_variant_id=recommended_id,
            recommendation_reason=recommendation_reason,
        )

    async def _generate_variant_proposals(
        self,
        base_proposal: Proposal,
        include_spicy: bool = True,
    ) -> list[Proposal]:
        """Generate variant proposals using LLM or fallback."""
        try:
            if self.api_key:
                return await self._llm_generate_variants(base_proposal, include_spicy)
        except Exception:
            pass
        
        return self._deterministic_generate_variants(base_proposal, include_spicy)

    async def _llm_generate_variants(
        self,
        base_proposal: Proposal,
        include_spicy: bool = True,
    ) -> list[Proposal]:
        """Use LLM to generate creative variants."""
        prompt = VARIANT_GENERATION_PROMPT.format(
            base_proposal=json.dumps(base_proposal.model_dump(), indent=2)
        )
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            # Create assistant
            asst_response = await client.post(
                f"{self.base_url}/assistants",
                headers=self.headers,
                json={
                    "name": "CivicSim Variant Generator",
                    "system_prompt": "You generate civic proposal variants in JSON format only.",
                },
            )
            
            if asst_response.status_code not in (200, 201):
                raise Exception("Failed to create assistant")
            
            asst_data = asst_response.json()
            assistant_id = asst_data.get("assistant_id") or asst_data.get("id")
            
            # Create thread
            thread_response = await client.post(
                f"{self.base_url}/assistants/{assistant_id}/threads",
                headers=self.headers,
            )
            
            if thread_response.status_code not in (200, 201):
                raise Exception("Failed to create thread")
            
            thread_data = thread_response.json()
            thread_id = thread_data.get("thread_id") or thread_data.get("id")
            
            # Send message
            msg_response = await client.post(
                f"{self.base_url}/threads/{thread_id}/messages",
                headers=self.headers,
                data={
                    "content": prompt,
                    "memory": "off",
                    "web_search": "off",
                    "llm_provider": "openai",
                    "model_name": "gpt-4o",
                    "stream": "false",
                },
            )
            
            if msg_response.status_code != 200:
                raise Exception("Failed to get response")
            
            content = msg_response.json().get("content", "")
            
            # Extract JSON
            if "```json" in content:
                json_str = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                json_str = content.split("```")[1].split("```")[0]
            else:
                json_str = content
            
            data = json.loads(json_str.strip())
            
            return self._parse_llm_variants(base_proposal, data, include_spicy)
        
    def _parse_llm_variants(
        self,
        base_proposal: Proposal,
        data: dict,
        include_spicy: bool,
    ) -> list[Proposal]:
        """Parse LLM-generated variant specifications into proposals."""
        variants = []
        
        # Parse alternates
        for alt in data.get("alternates", [])[:3]:
            variant = self._apply_changes(base_proposal, alt.get("changes", {}))
            variants.append(variant)
        
        # Parse compromises
        for comp in data.get("compromises", [])[:3]:
            variant = self._apply_changes(base_proposal, comp.get("changes", {}))
            variants.append(variant)
        
        # Parse spicy
        if include_spicy and "spicy" in data:
            spicy = self._apply_changes(base_proposal, data["spicy"].get("changes", {}))
            variants.append(spicy)
        
        return variants

    def _apply_changes(self, base_proposal: Proposal, changes: dict) -> Proposal:
        """Apply changes to create a new variant."""
        data = base_proposal.model_dump()
        
        for key, value in changes.items():
            if key in data:
                data[key] = value
        
        if base_proposal.type == "spatial":
            return SpatialProposal(**data)
        else:
            return CitywideProposal(**data)

    def _deterministic_generate_variants(
        self,
        base_proposal: Proposal,
        include_spicy: bool = True,
    ) -> list[Proposal]:
        """Generate variants deterministically without LLM."""
        variants = []
        
        if base_proposal.type == "spatial":
            base_data = base_proposal.model_dump()
            
            # Alternate 1: Smaller scale
            v1 = deepcopy(base_data)
            v1["scale"] = max(0.5, (base_data.get("scale", 1.0) or 1.0) * 0.7)
            v1["title"] = f"{base_data['title']} (Scaled Down)"
            variants.append(SpatialProposal(**v1))
            
            # Alternate 2: Larger radius
            v2 = deepcopy(base_data)
            v2["radius_km"] = min(3.0, (base_data.get("radius_km", 0.5) or 0.5) * 1.5)
            v2["title"] = f"{base_data['title']} (Wider Impact)"
            variants.append(SpatialProposal(**v2))
            
            # Alternate 3: With green space
            v3 = deepcopy(base_data)
            v3["includes_green_space"] = True
            v3["title"] = f"{base_data['title']} (Green Version)"
            variants.append(SpatialProposal(**v3))
            
            # Compromise 1: Add affordable housing
            c1 = deepcopy(base_data)
            c1["includes_affordable_housing"] = True
            c1["scale"] = (base_data.get("scale", 1.0) or 1.0) * 0.85
            c1["title"] = f"{base_data['title']} (Affordable)"
            variants.append(SpatialProposal(**c1))
            
            # Compromise 2: Add transit access
            c2 = deepcopy(base_data)
            c2["includes_transit_access"] = True
            c2["title"] = f"{base_data['title']} (Transit-Linked)"
            variants.append(SpatialProposal(**c2))
            
            # Compromise 3: Full community package
            c3 = deepcopy(base_data)
            c3["includes_affordable_housing"] = True
            c3["includes_green_space"] = True
            c3["includes_transit_access"] = True
            c3["scale"] = (base_data.get("scale", 1.0) or 1.0) * 0.75
            c3["title"] = f"{base_data['title']} (Community Package)"
            variants.append(SpatialProposal(**c3))
            
            # Spicy: Maximum scale
            if include_spicy:
                s1 = deepcopy(base_data)
                s1["scale"] = min(2.0, (base_data.get("scale", 1.0) or 1.0) * 1.8)
                s1["radius_km"] = min(3.0, (base_data.get("radius_km", 0.5) or 0.5) * 2.0)
                s1["title"] = f"{base_data['title']} (Bold Vision)"
                variants.append(SpatialProposal(**s1))
        
        else:  # Citywide
            base_data = base_proposal.model_dump()
            
            # Alternate 1: Lower amount
            v1 = deepcopy(base_data)
            if base_data.get("amount"):
                v1["amount"] = base_data["amount"] * 0.7
            if base_data.get("percentage"):
                v1["percentage"] = base_data["percentage"] * 0.7
            v1["title"] = f"{base_data['title']} (Modest)"
            variants.append(CitywideProposal(**v1))
            
            # Alternate 2: Higher amount
            v2 = deepcopy(base_data)
            if base_data.get("amount"):
                v2["amount"] = base_data["amount"] * 1.3
            if base_data.get("percentage"):
                v2["percentage"] = base_data["percentage"] * 1.3
            v2["title"] = f"{base_data['title']} (Enhanced)"
            variants.append(CitywideProposal(**v2))
            
            # Alternate 3: Different targeting
            v3 = deepcopy(base_data)
            v3["income_targeted"] = not base_data.get("income_targeted", False)
            v3["title"] = f"{base_data['title']} ({'Targeted' if v3['income_targeted'] else 'Universal'})"
            variants.append(CitywideProposal(**v3))
            
            # Compromise 1: Target low income
            c1 = deepcopy(base_data)
            c1["income_targeted"] = True
            c1["target_income_level"] = "low"
            c1["title"] = f"{base_data['title']} (Low-Income Focus)"
            variants.append(CitywideProposal(**c1))
            
            # Compromise 2: Reduced scope
            c2 = deepcopy(base_data)
            if base_data.get("amount"):
                c2["amount"] = base_data["amount"] * 0.6
            if base_data.get("percentage"):
                c2["percentage"] = base_data["percentage"] * 0.6
            c2["income_targeted"] = True
            c2["title"] = f"{base_data['title']} (Phased)"
            variants.append(CitywideProposal(**c2))
            
            # Compromise 3: Middle-income focus
            c3 = deepcopy(base_data)
            c3["income_targeted"] = True
            c3["target_income_level"] = "middle"
            c3["title"] = f"{base_data['title']} (Middle Class)"
            variants.append(CitywideProposal(**c3))
            
            # Spicy: Maximum
            if include_spicy:
                s1 = deepcopy(base_data)
                if base_data.get("amount"):
                    s1["amount"] = min(500, base_data["amount"] * 2.0)
                if base_data.get("percentage"):
                    s1["percentage"] = min(50, base_data["percentage"] * 2.0)
                s1["title"] = f"{base_data['title']} (Bold)"
                variants.append(CitywideProposal(**s1))
        
        return variants

    def _build_ranked_variant(
        self,
        id: str,
        variant_type: str,
        name: str,
        description: str,
        proposal: Proposal,
        result: SimulateResponse,
        changes_from_base: list[str],
    ) -> RankedVariant:
        """Build a RankedVariant from simulation result."""
        # Calculate ranking scores
        support_score = self._normalize_score(result.overall_approval, -100, 100)
        
        equity_delta = result.metric_deltas.get("equity", 0)
        equity_score = self._normalize_score(equity_delta, -1, 1)
        
        env_delta = result.metric_deltas.get("environmental_quality", 0)
        environment_score = self._normalize_score(env_delta, -1, 1)
        
        # Feasibility = 100 - max opposition
        max_opposition = 0
        for arch in result.approval_by_archetype:
            if arch.score < max_opposition:
                max_opposition = arch.score
        feasibility_score = 100 + max_opposition  # Lower opposition = higher score
        
        return RankedVariant(
            id=id,
            variant_type=variant_type,
            name=name,
            description=description,
            proposal=proposal,
            overall_approval=result.overall_approval,
            overall_sentiment=result.overall_sentiment,
            metric_deltas=result.metric_deltas,
            support_score=support_score,
            equity_score=equity_score,
            environment_score=environment_score,
            feasibility_score=max(0, min(100, feasibility_score)),
            changes_from_base=changes_from_base,
        )

    def _normalize_score(self, value: float, min_val: float, max_val: float) -> float:
        """Normalize a value to 0-100 scale."""
        normalized = (value - min_val) / (max_val - min_val) * 100
        return max(0, min(100, normalized))

    def _compute_rankings(
        self,
        variants: list[RankedVariant],
        priorities: list[str],
    ) -> dict[str, list[str]]:
        """Compute rankings by different criteria."""
        rankings = {}
        
        criteria_map = {
            "support": lambda v: v.support_score,
            "equity": lambda v: v.equity_score,
            "environment": lambda v: v.environment_score,
            "feasibility": lambda v: v.feasibility_score,
        }
        
        for criterion in priorities:
            if criterion in criteria_map:
                sorted_variants = sorted(
                    variants,
                    key=criteria_map[criterion],
                    reverse=True
                )
                rankings[criterion] = [v.id for v in sorted_variants]
        
        # Combined ranking using priority weights
        def combined_score(v: RankedVariant) -> float:
            score = 0
            for i, criterion in enumerate(priorities):
                weight = 1.0 / (i + 1)  # Decreasing weights
                if criterion == "support":
                    score += v.support_score * weight
                elif criterion == "equity":
                    score += v.equity_score * weight
                elif criterion == "environment":
                    score += v.environment_score * weight
                elif criterion == "feasibility":
                    score += v.feasibility_score * weight
            return score
        
        sorted_combined = sorted(variants, key=combined_score, reverse=True)
        rankings["combined"] = [v.id for v in sorted_combined]
        
        return rankings

    def _generate_recommendation(
        self,
        variants: list[RankedVariant],
        rankings: dict[str, list[str]],
        priorities: list[str],
    ) -> tuple[str, str]:
        """Generate a recommendation based on rankings."""
        if not rankings.get("combined"):
            return variants[0].id, "Default to base proposal"
        
        best_id = rankings["combined"][0]
        best_variant = next((v for v in variants if v.id == best_id), variants[0])
        
        reasons = []
        if best_variant.variant_type == "base":
            reasons.append("The original proposal performs well")
        elif best_variant.variant_type == "compromise":
            reasons.append("This compromise balances competing interests")
        elif best_variant.variant_type == "spicy":
            reasons.append("This bold approach offers high potential")
        else:
            reasons.append("This alternate approach improves outcomes")
        
        if best_variant.support_score > 70:
            reasons.append("strong community support")
        if best_variant.feasibility_score > 70:
            reasons.append("low political opposition")
        if best_variant.equity_score > 60:
            reasons.append("positive equity impact")
        
        return best_id, ". ".join(reasons[:2]) if reasons else "Best overall performance"

    def _generate_analysis_summary(
        self,
        variants: list[RankedVariant],
        rankings: dict[str, list[str]],
    ) -> str:
        """Generate a summary of the variant analysis."""
        if not variants:
            return "No variants generated."
        
        best_support = max(variants, key=lambda v: v.support_score)
        best_equity = max(variants, key=lambda v: v.equity_score)
        best_feasibility = max(variants, key=lambda v: v.feasibility_score)
        
        summary_parts = [
            f"Generated {len(variants)} variants.",
            f"Best for support: {best_support.name} ({best_support.overall_approval:.0f} approval).",
            f"Best for equity: {best_equity.name}.",
            f"Most politically feasible: {best_feasibility.name}.",
        ]
        
        return " ".join(summary_parts)

    def _describe_variant(self, base: Proposal, variant: Proposal) -> str:
        """Generate description of how variant differs from base."""
        changes = self._get_changes(base, variant)
        if not changes:
            return "Same as base proposal"
        return "Changes: " + ", ".join(changes)

    def _get_changes(self, base: Proposal, variant: Proposal) -> list[str]:
        """Get list of changes from base to variant."""
        base_data = base.model_dump()
        variant_data = variant.model_dump()
        changes = []
        
        skip_fields = {"type", "spatial_type", "citywide_type"}
        
        for key in variant_data:
            if key in skip_fields:
                continue
            if key in base_data and base_data[key] != variant_data[key]:
                changes.append(f"{key}: {base_data[key]} → {variant_data[key]}")
        
        return changes

    def _create_neutral_result(self) -> SimulateResponse:
        """Create a neutral simulation result for failed simulations."""
        from app.schemas.simulation import SimulateResponse
        return SimulateResponse(
            overall_approval=0,
            overall_sentiment="unknown",
            approval_by_archetype=[],
            approval_by_region=[],
            top_drivers=[],
            metric_deltas={},
        )

    def _create_fallback_variant(
        self,
        base_proposal: Proposal,
        base_result: SimulateResponse,
        variant_type: str,
        index: int,
    ) -> RankedVariant:
        """Create a fallback variant when generation fails."""
        return RankedVariant(
            id=str(uuid.uuid4()),
            variant_type=variant_type,
            name=f"{variant_type.title()} {index + 1}",
            description="Fallback variant",
            proposal=base_proposal,
            overall_approval=base_result.overall_approval,
            overall_sentiment=base_result.overall_sentiment,
            metric_deltas=base_result.metric_deltas,
            support_score=50,
            equity_score=50,
            environment_score=50,
            feasibility_score=50,
            changes_from_base=[],
        )


# Convenience function
async def generate_variants(
    base_proposal: Proposal,
    scenario_data: ScenarioData,
    ranking_priorities: list[str] = None,
    include_spicy: bool = True,
) -> VariantBundle:
    """Generate variants for a proposal."""
    generator = VariantGenerator()
    return await generator.generate_variants(
        base_proposal, scenario_data, ranking_priorities, include_spicy
    )

