"""Zone Describer - generates AI descriptions of zones/clusters."""

import json
from typing import Optional, Union

import httpx

from app.config import get_settings
from app.schemas.proposal import SpatialProposal, CitywideProposal
from app.schemas.ai import ZoneDescription
from app.engine.simulator import CivicSimulator, ScenarioData, ClusterData
from app.engine.archetypes import ARCHETYPE_DEFINITIONS

Proposal = Union[SpatialProposal, CitywideProposal]


# Zone character templates based on dominant archetypes
ZONE_CHARACTERS = {
    "student": ("University District", "Vibrant student hub with affordable housing needs"),
    "young_renter": ("Young Professional Quarter", "Dynamic area with renters seeking amenities"),
    "established_homeowner": ("Established Residential", "Stable neighborhood with homeowner concerns"),
    "senior_fixed_income": ("Senior Community", "Quieter area with fixed-income residents"),
    "small_business_owner": ("Commercial Core", "Business-focused district"),
    "environmental_advocate": ("Green Corridor", "Environmentally conscious community"),
    "transit_dependent": ("Transit Hub", "High transit usage area"),
    "newcomer_immigrant": ("Multicultural District", "Diverse community with newcomer services"),
}


ZONE_PROMPT = """Describe this zone/cluster for a civic planning context.

ZONE DATA:
Name: {name}
Population: {population}
Archetype Distribution:
{archetype_dist}

{simulation_context}

Generate a brief, useful description in JSON:
{{
  "primary_character": "One-word character (e.g., 'University District')",
  "description": "2-3 sentence description",
  "recommended_proposals": ["3 proposal types that would work well"],
  "avoid_proposals": ["2 proposal types to avoid"],
  "score_explanation": "Why the current score is what it is (if applicable)"
}}"""


class ZoneDescriber:
    """
    Generates AI descriptions of zones/clusters.
    
    Features:
    - Zone character identification
    - Archetype breakdown analysis
    - Proposal recommendations
    - Score explanations
    """

    def __init__(self, api_key: Optional[str] = None):
        settings = get_settings()
        self.api_key = api_key or settings.backboard_api_key
        self.base_url = settings.backboard_base_url
        self.headers = {
            "X-API-Key": self.api_key,
            "Accept": "application/json",
        }

    async def describe_zone(
        self,
        cluster: ClusterData,
        scenario_data: ScenarioData,
        current_proposal: Optional[Proposal] = None,
    ) -> ZoneDescription:
        """
        Generate a description of a zone.
        
        Args:
            cluster: The cluster to describe
            scenario_data: Scenario context
            current_proposal: Optional proposal being considered
            
        Returns:
            ZoneDescription with character and recommendations
        """
        # Get archetype breakdown
        archetype_breakdown = cluster.archetype_distribution or {}
        
        # Find dominant archetype
        dominant_archetype = max(
            archetype_breakdown.items(),
            key=lambda x: x[1],
            default=("unknown", 0)
        )[0] if archetype_breakdown else "unknown"
        
        # Get dominant archetypes (top 3)
        sorted_archetypes = sorted(
            archetype_breakdown.items(),
            key=lambda x: x[1],
            reverse=True
        )
        dominant_archetypes = [a[0] for a in sorted_archetypes[:3]]
        
        # Get base character from dominant archetype
        char_info = ZONE_CHARACTERS.get(
            dominant_archetype,
            ("Mixed Use", "Diverse community with varied needs")
        )
        
        # Calculate current score if proposal provided
        current_score = None
        score_explanation = None
        
        if current_proposal:
            simulator = CivicSimulator(scenario_data)
            result = simulator.simulate(current_proposal, include_debug=False)
            
            # Find this cluster's score
            for region in result.approval_by_region:
                if region.cluster_id == str(cluster.id) or region.cluster_name == cluster.name:
                    current_score = region.score
                    
                    if current_score > 20:
                        score_explanation = f"This zone supports the proposal (score: {current_score:.0f}) because it aligns with {dominant_archetype.replace('_', ' ')} priorities."
                    elif current_score < -20:
                        score_explanation = f"This zone opposes the proposal (score: {current_score:.0f}) due to concerns from {dominant_archetype.replace('_', ' ')} residents."
                    else:
                        score_explanation = f"This zone has mixed feelings (score: {current_score:.0f}) about the proposal."
                    break
        
        # Generate recommendations based on archetypes
        recommended = self._generate_recommendations(dominant_archetypes)
        avoid = self._generate_avoidances(dominant_archetypes)
        
        # Try LLM for richer description
        try:
            if self.api_key:
                return await self._llm_describe_zone(
                    cluster, archetype_breakdown, current_score, score_explanation,
                    dominant_archetypes, recommended, avoid
                )
        except Exception:
            pass
        
        # Fallback description
        arch_names = [a.replace("_", " ").title() for a in dominant_archetypes[:2]]
        description = (
            f"{cluster.name} is primarily home to {' and '.join(arch_names)} residents. "
            f"With a population of {cluster.population:,}, this {char_info[0].lower()} "
            f"has distinct needs and preferences."
        )
        
        return ZoneDescription(
            cluster_id=str(cluster.id),
            cluster_name=cluster.name,
            primary_character=char_info[0],
            description=description,
            dominant_archetypes=dominant_archetypes,
            archetype_breakdown=archetype_breakdown,
            recommended_proposals=recommended,
            avoid_proposals=avoid,
            current_score=current_score,
            score_explanation=score_explanation,
        )

    async def _llm_describe_zone(
        self,
        cluster: ClusterData,
        archetype_breakdown: dict,
        current_score: Optional[float],
        score_explanation: Optional[str],
        dominant_archetypes: list[str],
        recommended: list[str],
        avoid: list[str],
    ) -> ZoneDescription:
        """Generate zone description using LLM."""
        archetype_dist_str = "\n".join([
            f"  - {k.replace('_', ' ').title()}: {v*100:.0f}%"
            for k, v in sorted(archetype_breakdown.items(), key=lambda x: x[1], reverse=True)
        ])
        
        sim_context = ""
        if current_score is not None:
            sim_context = f"\nCurrent proposal score for this zone: {current_score:.1f}"
        
        prompt = ZONE_PROMPT.format(
            name=cluster.name,
            population=cluster.population,
            archetype_dist=archetype_dist_str,
            simulation_context=sim_context,
        )
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            asst_response = await client.post(
                f"{self.base_url}/assistants",
                headers=self.headers,
                json={
                    "name": "CivicSim Zone Describer",
                    "system_prompt": "Describe civic planning zones. JSON only.",
                },
            )
            
            asst_id = asst_response.json().get("assistant_id") or asst_response.json().get("id")
            
            thread_response = await client.post(
                f"{self.base_url}/assistants/{asst_id}/threads",
                headers=self.headers,
            )
            thread_id = thread_response.json().get("thread_id") or thread_response.json().get("id")
            
            msg_response = await client.post(
                f"{self.base_url}/threads/{thread_id}/messages",
                headers=self.headers,
                data={
                    "content": prompt,
                    "memory": "off",
                    "web_search": "off",
                    "llm_provider": "amazon",
                    "model_name": "amazon/nova-micro-v1",
                    "stream": "false",
                },
            )
            
            content = msg_response.json().get("content", "")
            
            if "```json" in content:
                json_str = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                json_str = content.split("```")[1].split("```")[0]
            else:
                json_str = content
            
            data = json.loads(json_str.strip())
            
            return ZoneDescription(
                cluster_id=str(cluster.id),
                cluster_name=cluster.name,
                primary_character=data.get("primary_character", "Mixed Use"),
                description=data.get("description", "A diverse community area."),
                dominant_archetypes=dominant_archetypes,
                archetype_breakdown=archetype_breakdown,
                recommended_proposals=data.get("recommended_proposals", recommended),
                avoid_proposals=data.get("avoid_proposals", avoid),
                current_score=current_score,
                score_explanation=data.get("score_explanation", score_explanation),
            )

    def _generate_recommendations(self, dominant_archetypes: list[str]) -> list[str]:
        """Generate proposal recommendations based on archetypes."""
        recommendations = set()
        
        archetype_recs = {
            "student": ["transit_line", "bike_lane", "housing_development"],
            "young_renter": ["housing_development", "park", "commercial_development"],
            "established_homeowner": ["park", "community_center"],
            "senior_fixed_income": ["transit_line", "community_center", "subsidy"],
            "small_business_owner": ["commercial_development", "tax_decrease"],
            "environmental_advocate": ["park", "bike_lane", "environmental_policy"],
            "transit_dependent": ["transit_line", "transit_funding"],
            "newcomer_immigrant": ["housing_development", "community_center", "subsidy"],
        }
        
        for arch in dominant_archetypes:
            recs = archetype_recs.get(arch, [])
            recommendations.update(recs)
        
        return list(recommendations)[:3]

    def _generate_avoidances(self, dominant_archetypes: list[str]) -> list[str]:
        """Generate proposals to avoid based on archetypes."""
        avoidances = set()
        
        archetype_avoid = {
            "student": ["tax_increase"],
            "young_renter": ["tax_increase"],
            "established_homeowner": ["upzone", "factory"],
            "senior_fixed_income": ["tax_increase", "factory"],
            "small_business_owner": ["tax_increase", "regulation"],
            "environmental_advocate": ["factory"],
            "transit_dependent": [],
            "newcomer_immigrant": [],
        }
        
        for arch in dominant_archetypes:
            avoids = archetype_avoid.get(arch, [])
            avoidances.update(avoids)
        
        return list(avoidances)[:2]
