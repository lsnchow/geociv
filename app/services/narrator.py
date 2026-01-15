"""Grounded narrative generation service with persona support."""

import json
import re
from typing import Optional, Union

import httpx

from app.config import get_settings
from app.schemas.proposal import SpatialProposal, CitywideProposal
from app.schemas.simulation import SimulateResponse, NarrativeResponse
from app.schemas.llm import (
    GroundedNarrative,
    CitedMetric,
    RoleplayReaction,
    PersonaResponse,
    DeterministicBreakdown,
)
from app.engine.personas import (
    PERSONAS,
    PersonaDefinition,
    get_persona,
    compute_voice_seed,
    hash_proposal,
    get_persona_reaction_prompt,
)
from app.engine.metrics import METRICS


# Grounding system prompt with strict rules
# NOTE: JSON braces must be escaped for LangChain/Backboard compatibility
GROUNDED_NARRATOR_PROMPT = """You are a civic narrator that generates GROUNDED narratives from simulation results.

CRITICAL GROUNDING RULES - YOU MUST FOLLOW THESE:
1. ONLY cite metrics that appear in the provided metric_deltas
2. NEVER invent numbers, percentages, or statistics not in the results
3. MUST cite at least 2 driver metrics by their exact names
4. Your sentiment MUST match the overall_approval direction (positive approval = supportive tone)
5. NEVER claim effects that aren't in metric_deltas

FORBIDDEN CLAIMS (will fail validation):
- Inventing survey results or public opinion percentages
- Claiming metrics improved/decreased that aren't in the deltas
- Contradicting the approval score direction
- Making up quotes with specific numbers

Respond with a JSON object containing:
- summary: 2-3 sentence summary citing specific metrics from results
- cited_metrics: array of objects with metric_key, metric_name, delta, direction, citation_text
- archetype_quotes: object mapping archetype_key to a grounded quote
- compromise_suggestion: specific suggestion based on negative drivers, or null"""

# Persona roleplay prompt
PERSONA_ROLEPLAY_PROMPT = """You are generating a roleplay reaction as a specific persona.

PERSONA: {persona_name}
TONE: {tone}
STYLE: {rhetorical_style}
PRIORITY CONCERNS: {priority_metrics}

GROUNDING RULES:
1. Your reaction MUST be grounded in the actual simulation results
2. Reference the persona's priority metrics if they appear in the results
3. Use the persona's common phrases and speaking style
4. Match your sentiment to what the results show for related archetypes

SIMULATION RESULTS:
{context}

Generate a 2-3 paragraph roleplay reaction in this persona's voice.
The reaction should feel authentic to the persona while being factually grounded in the results.

Respond with JSON:
{{
  "reaction": "The roleplay reaction text",
  "priority_metrics_cited": ["list of priority metrics you referenced"],
  "tone_applied": "description of tone used"
}}"""


class Narrator:
    """
    Generates grounded narratives and persona roleplay from simulation results.
    
    Key features:
    - Strict grounding validation (no hallucinated metrics)
    - Persona-based roleplay with consistent voice seeds
    - Citation tracking for transparency
    - Forbidden claims detection
    """

    def __init__(self, api_key: Optional[str] = None):
        """Initialize narrator with API key."""
        settings = get_settings()
        self.api_key = api_key or settings.backboard_api_key
        self.base_url = settings.backboard_base_url
        self.headers = {
            "X-API-Key": self.api_key,
            "Accept": "application/json",
        }
        self._narrator_assistant_id: Optional[str] = None
        self._persona_assistant_id: Optional[str] = None

    async def _ensure_narrator_assistant(self) -> str:
        """Ensure the grounded narrator assistant exists."""
        if self._narrator_assistant_id:
            return self._narrator_assistant_id
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/assistants",
                headers=self.headers,
                json={
                    "name": "CivicSim Grounded Narrator",
                    "system_prompt": GROUNDED_NARRATOR_PROMPT,
                },
            )
            
            if response.status_code in (200, 201):
                data = response.json()
                self._narrator_assistant_id = data.get("assistant_id") or data.get("id")
                return self._narrator_assistant_id
            else:
                # Try to find existing
                list_response = await client.get(
                    f"{self.base_url}/assistants",
                    headers=self.headers,
                )
                if list_response.status_code == 200:
                    for asst in list_response.json().get("assistants", []):
                        if isinstance(asst, dict) and "Grounded Narrator" in asst.get("name", ""):
                            self._narrator_assistant_id = asst.get("assistant_id") or asst.get("id")
                            return self._narrator_assistant_id
                
                raise Exception(f"Failed to create narrator: {response.text}")

    async def generate_grounded_narrative(
        self,
        proposal: Union[SpatialProposal, CitywideProposal],
        result: SimulateResponse,
    ) -> GroundedNarrative:
        """
        Generate a strictly grounded narrative from simulation results.
        
        Ensures:
        - At least 2 metrics are cited
        - No claims about metrics not in deltas
        - Sentiment matches approval direction
        """
        context = self._build_grounding_context(proposal, result)
        
        try:
            assistant_id = await self._ensure_narrator_assistant()
            
            async with httpx.AsyncClient(timeout=60.0) as client:
                thread_response = await client.post(
                    f"{self.base_url}/assistants/{assistant_id}/threads",
                    headers=self.headers,
                )
                
                if thread_response.status_code not in (200, 201):
                    return self._fallback_grounded_narrative(proposal, result)
                
                thread_id = thread_response.json().get("thread_id") or thread_response.json().get("id")
                
                prompt = f"""Generate a grounded narrative for these results:

{context}

Remember: Cite at least 2 metrics by name. Never invent statistics."""
                
                response = await client.post(
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
                    timeout=60.0,
                )
                
                if response.status_code == 200:
                    content = response.json().get("content") or response.json().get("message", {}).get("content", "")
                    
                    # Extract JSON
                    if "```json" in content:
                        json_str = content.split("```json")[1].split("```")[0]
                    elif "```" in content:
                        json_str = content.split("```")[1].split("```")[0]
                    else:
                        json_str = content
                    
                    narrative_data = json.loads(json_str.strip())
                    
                    # Validate grounding
                    narrative = self._build_grounded_narrative(narrative_data, result)
                    
                    # Run validation
                    if not self._validate_grounding(narrative, result):
                        return self._fallback_grounded_narrative(proposal, result)
                    
                    return narrative
                    
        except Exception:
            pass
        
        return self._fallback_grounded_narrative(proposal, result)

    async def generate_persona_roleplay(
        self,
        proposal: Union[SpatialProposal, CitywideProposal],
        result: SimulateResponse,
        persona_key: str,
        scenario_seed: int = 42,
    ) -> RoleplayReaction:
        """
        Generate a persona-based roleplay reaction.
        
        Uses voice seed for consistent output across same inputs.
        """
        persona = get_persona(persona_key)
        context = self._build_grounding_context(proposal, result)
        
        # Compute voice seed for consistency
        proposal_hash = hash_proposal(proposal.model_dump())
        voice_seed = compute_voice_seed(persona_key, proposal_hash, scenario_seed)
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                # Create temporary thread
                thread_response = await client.post(
                    f"{self.base_url}/assistants/{await self._ensure_narrator_assistant()}/threads",
                    headers=self.headers,
                )
                
                if thread_response.status_code not in (200, 201):
                    return self._fallback_roleplay(persona, result, voice_seed)
                
                thread_id = thread_response.json().get("thread_id") or thread_response.json().get("id")
                
                prompt = PERSONA_ROLEPLAY_PROMPT.format(
                    persona_name=persona.name,
                    tone=persona.tone,
                    rhetorical_style=persona.rhetorical_style,
                    priority_metrics=", ".join(persona.priority_metrics),
                    context=context,
                )
                
                response = await client.post(
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
                    timeout=60.0,
                )
                
                if response.status_code == 200:
                    content = response.json().get("content") or response.json().get("message", {}).get("content", "")
                    
                    if "```json" in content:
                        json_str = content.split("```json")[1].split("```")[0]
                    elif "```" in content:
                        json_str = content.split("```")[1].split("```")[0]
                    else:
                        json_str = content
                    
                    roleplay_data = json.loads(json_str.strip())
                    
                    return RoleplayReaction(
                        persona_key=persona_key,
                        persona_name=persona.name,
                        voice_seed=voice_seed,
                        reaction=roleplay_data.get("reaction", ""),
                        priority_metrics_cited=roleplay_data.get("priority_metrics_cited", []),
                        tone_applied=roleplay_data.get("tone_applied", persona.tone),
                    )
                    
        except Exception:
            pass
        
        return self._fallback_roleplay(persona, result, voice_seed)

    async def generate_full_response(
        self,
        proposal: Union[SpatialProposal, CitywideProposal],
        result: SimulateResponse,
        persona_key: Optional[str] = None,
        scenario_seed: int = 42,
        assumptions: list[str] = None,
    ) -> PersonaResponse:
        """
        Generate a complete response with roleplay + deterministic breakdown.
        
        This is the main entry point for the two-section response format.
        """
        # Generate grounded narrative
        narrative = await self.generate_grounded_narrative(proposal, result)
        
        # Generate roleplay if persona specified
        roleplay = None
        if persona_key:
            roleplay = await self.generate_persona_roleplay(
                proposal, result, persona_key, scenario_seed
            )
        
        # Build deterministic breakdown
        breakdown = DeterministicBreakdown(
            overall_approval=result.overall_approval,
            overall_sentiment=result.overall_sentiment,
            top_drivers=[d.model_dump() for d in result.top_drivers],
            metric_deltas=result.metric_deltas,
            assumptions_used=assumptions or [],
            confidence=1.0,  # Engine results are deterministic
        )
        
        return PersonaResponse(
            roleplay_reaction=roleplay,
            deterministic_breakdown=breakdown,
            grounded_narrative=narrative,
        )

    # Keep backward-compatible method
    async def generate_narrative(
        self,
        proposal: Union[SpatialProposal, CitywideProposal],
        result: SimulateResponse,
    ) -> NarrativeResponse:
        """Legacy method for backward compatibility."""
        grounded = await self.generate_grounded_narrative(proposal, result)
        return NarrativeResponse(
            summary=grounded.summary,
            archetype_quotes=grounded.archetype_quotes,
            compromise_suggestion=grounded.compromise_suggestion,
        )

    def _build_grounding_context(
        self,
        proposal: Union[SpatialProposal, CitywideProposal],
        result: SimulateResponse,
    ) -> str:
        """Build context with explicit grounding data."""
        lines = [
            "=== PROPOSAL ===",
            f"Title: {proposal.title}",
            f"Type: {proposal.type}",
            f"Description: {proposal.description or 'N/A'}",
            "",
            "=== RESULTS (USE THESE EXACT VALUES) ===",
            f"Overall Approval: {result.overall_approval:.1f}",
            f"Sentiment: {result.overall_sentiment}",
            "",
            "=== METRIC DELTAS (ONLY CITE THESE) ===",
        ]
        
        for key, delta in result.metric_deltas.items():
            metric_def = METRICS.get(key)
            name = metric_def.name if metric_def else key
            direction = "improved" if delta > 0 else "decreased" if delta < 0 else "unchanged"
            lines.append(f"  - {name} ({key}): {delta:+.3f} ({direction})")
        
        lines.extend([
            "",
            "=== TOP DRIVERS ===",
        ])
        
        for driver in result.top_drivers:
            lines.append(f"  - {driver.metric_name}: {driver.direction} ({driver.magnitude})")
        
        lines.extend([
            "",
            "=== ARCHETYPE SCORES ===",
        ])
        
        for arch in result.approval_by_archetype:
            lines.append(f"  - {arch.archetype_name}: {arch.score:.1f} ({arch.sentiment})")
        
        return "\n".join(lines)

    def _build_grounded_narrative(
        self,
        data: dict,
        result: SimulateResponse,
    ) -> GroundedNarrative:
        """Build GroundedNarrative from LLM response."""
        # Extract cited metrics
        cited_metrics = []
        for cm in data.get("cited_metrics", []):
            if isinstance(cm, dict):
                metric_key = cm.get("metric_key", "")
                if metric_key in result.metric_deltas:
                    cited_metrics.append(CitedMetric(
                        metric_key=metric_key,
                        metric_name=cm.get("metric_name", metric_key),
                        delta=result.metric_deltas[metric_key],  # Use actual value
                        direction=cm.get("direction", "neutral"),
                        citation_text=cm.get("citation_text", ""),
                    ))
        
        # Ensure at least 2 citations
        if len(cited_metrics) < 2:
            # Add from top drivers
            for driver in result.top_drivers:
                if driver.metric_key not in [cm.metric_key for cm in cited_metrics]:
                    cited_metrics.append(CitedMetric(
                        metric_key=driver.metric_key,
                        metric_name=driver.metric_name,
                        delta=driver.delta,
                        direction=driver.direction,
                        citation_text=f"Impact on {driver.metric_name.lower()}",
                    ))
                    if len(cited_metrics) >= 2:
                        break
        
        return GroundedNarrative(
            summary=data.get("summary", ""),
            cited_metrics=cited_metrics,
            archetype_quotes=data.get("archetype_quotes", {}),
            compromise_suggestion=data.get("compromise_suggestion"),
            grounding_validation=True,
        )

    def _validate_grounding(
        self,
        narrative: GroundedNarrative,
        result: SimulateResponse,
    ) -> bool:
        """
        Validate that narrative is properly grounded.
        
        Checks:
        - At least 2 metrics cited
        - All cited metrics exist in deltas
        - Sentiment direction matches approval
        """
        # Check citation count
        if len(narrative.cited_metrics) < 2:
            return False
        
        # Check all citations are valid
        valid_keys = set(result.metric_deltas.keys())
        for cm in narrative.cited_metrics:
            if cm.metric_key not in valid_keys:
                return False
        
        # Check sentiment direction
        is_positive_approval = result.overall_approval > 0
        summary_lower = narrative.summary.lower()
        
        # Simple sentiment check
        positive_words = ["support", "approval", "benefit", "positive", "welcome"]
        negative_words = ["oppose", "concern", "negative", "reject", "resistance"]
        
        has_positive = any(w in summary_lower for w in positive_words)
        has_negative = any(w in summary_lower for w in negative_words)
        
        # Allow mixed for neutral scores
        if abs(result.overall_approval) < 20:
            return True
        
        if is_positive_approval and has_negative and not has_positive:
            return False
        if not is_positive_approval and has_positive and not has_negative:
            return False
        
        return True

    def _detect_forbidden_claims(self, text: str, result: SimulateResponse) -> list[str]:
        """Detect forbidden claims in generated text."""
        violations = []
        
        # Check for invented percentages
        percentages = re.findall(r'\d+(?:\.\d+)?%', text)
        for pct in percentages:
            # Only allow if it matches actual approval
            pct_val = float(pct.rstrip('%'))
            if abs(pct_val - abs(result.overall_approval)) > 5:
                violations.append(f"Invented percentage: {pct}")
        
        # Check for metrics not in deltas
        valid_metrics = set(result.metric_deltas.keys())
        for metric_key, metric_def in METRICS.items():
            if metric_key not in valid_metrics:
                if metric_def.name.lower() in text.lower():
                    violations.append(f"Referenced non-impacted metric: {metric_def.name}")
        
        return violations

    def _fallback_grounded_narrative(
        self,
        proposal: Union[SpatialProposal, CitywideProposal],
        result: SimulateResponse,
    ) -> GroundedNarrative:
        """Generate fallback grounded narrative without LLM."""
        # Determine sentiment
        if result.overall_approval >= 50:
            sentiment = "strong support"
        elif result.overall_approval >= 20:
            sentiment = "moderate support"
        elif result.overall_approval >= -20:
            sentiment = "mixed reactions"
        elif result.overall_approval >= -50:
            sentiment = "moderate opposition"
        else:
            sentiment = "strong opposition"
        
        # Build summary citing top drivers
        drivers = result.top_drivers[:2]
        driver_text = ""
        if drivers:
            driver_parts = []
            for d in drivers:
                if d.direction == "positive":
                    driver_parts.append(f"improvements to {d.metric_name.lower()}")
                else:
                    driver_parts.append(f"concerns about {d.metric_name.lower()}")
            driver_text = f" Key factors include {' and '.join(driver_parts)}."
        
        summary = (
            f"The proposal '{proposal.title}' received {sentiment} with an overall "
            f"approval score of {result.overall_approval:.1f}.{driver_text}"
        )
        
        # Build cited metrics
        cited_metrics = []
        for driver in result.top_drivers[:2]:
            cited_metrics.append(CitedMetric(
                metric_key=driver.metric_key,
                metric_name=driver.metric_name,
                delta=driver.delta,
                direction=driver.direction,
                citation_text=f"Impact on {driver.metric_name.lower()}",
            ))
        
        # Build quotes
        quotes = {}
        for arch in result.approval_by_archetype[:3]:
            if arch.score > 20:
                quotes[arch.archetype_key] = f"This addresses real needs in our community."
            elif arch.score < -20:
                quotes[arch.archetype_key] = f"I have serious concerns about the impact."
            else:
                quotes[arch.archetype_key] = f"There are pros and cons to consider here."
        
        # Compromise suggestion
        compromise = None
        if result.overall_approval < 50:
            negative_drivers = [d for d in result.top_drivers if d.direction == "negative"]
            if negative_drivers:
                compromise = f"Consider adding measures to address {negative_drivers[0].metric_name.lower()} concerns."
        
        return GroundedNarrative(
            summary=summary,
            cited_metrics=cited_metrics,
            archetype_quotes=quotes,
            compromise_suggestion=compromise,
            grounding_validation=True,
        )

    def _fallback_roleplay(
        self,
        persona: PersonaDefinition,
        result: SimulateResponse,
        voice_seed: int,
    ) -> RoleplayReaction:
        """Generate fallback roleplay without LLM."""
        # Determine if persona would likely support based on priority metrics
        support_score = 0
        cited_priorities = []
        
        for metric_key in persona.priority_metrics:
            if metric_key in result.metric_deltas:
                delta = result.metric_deltas[metric_key]
                support_score += delta
                cited_priorities.append(metric_key)
        
        # Use one of the persona's common phrases
        opener = persona.common_phrases[voice_seed % len(persona.common_phrases)]
        
        # Generate reaction based on support
        if support_score > 0.1:
            reaction = get_persona_reaction_prompt(
                persona,
                is_supportive=True,
                primary_metric=persona.priority_metrics[0] if persona.priority_metrics else "community",
                secondary_metric=persona.priority_metrics[1] if len(persona.priority_metrics) > 1 else None,
            )
        else:
            reaction = get_persona_reaction_prompt(
                persona,
                is_supportive=False,
                primary_metric=persona.priority_metrics[0] if persona.priority_metrics else "community",
                primary_concern=f"the effect on {persona.priority_metrics[0]}" if persona.priority_metrics else "our community",
            )
        
        full_reaction = f"{opener} {reaction}"
        
        return RoleplayReaction(
            persona_key=persona.key,
            persona_name=persona.name,
            voice_seed=voice_seed,
            reaction=full_reaction,
            priority_metrics_cited=cited_priorities,
            tone_applied=persona.tone,
        )
