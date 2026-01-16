"""Town Hall Generator - creates multi-speaker town hall transcripts."""

import json
import uuid
from typing import Optional, Union

import httpx

from app.config import get_settings
from app.schemas.proposal import SpatialProposal, CitywideProposal
from app.schemas.ai import (
    TownHallTranscript,
    Speaker,
    Exchange,
    CrossExamineResponse,
    FlipSpeakerResponse,
)
from app.engine.simulator import CivicSimulator, ScenarioData
from app.engine.archetypes import ARCHETYPE_DEFINITIONS

Proposal = Union[SpatialProposal, CitywideProposal]


# Archetype to speaker role mapping
ARCHETYPE_ROLES = {
    "young_renter": ("Alex Chen", "Young professional renter", "🎓"),
    "established_homeowner": ("Margaret Thompson", "Long-time homeowner", "🏡"),
    "senior_fixed_income": ("Harold Williams", "Retired senior", "👵"),
    "small_business_owner": ("Raj Patel", "Local shop owner", "🏪"),
    "environmental_advocate": ("Sarah Green", "Environmental activist", "🌱"),
    "transit_dependent": ("Maria Santos", "Transit rider", "🚌"),
    "newcomer_immigrant": ("Ahmed Hassan", "Recent immigrant", "🌍"),
    "student": ("Emma Wilson", "University student", "📚"),
}


TOWNHALL_PROMPT = """Generate a town hall transcript for this civic proposal.

PROPOSAL:
{proposal}

SIMULATION RESULTS:
{results}

Generate a realistic town hall with {num_speakers} speakers. Each speaker should:
1. Represent their archetype's perspective
2. Make arguments grounded in the metric drivers
3. Reference their actual approval score sentiment

Include dramatic elements like interruptions and rebuttals if requested: {dramatic}

Respond with JSON:
{{
  "exchanges": [
    {{
      "speaker_id": "archetype_key",
      "type": "statement|question|rebuttal|interruption|agreement",
      "content": "What they say",
      "cited_metrics": ["metric_keys referenced"],
      "emotion": "angry|supportive|concerned|hopeful|neutral"
    }}
  ],
  "summary": "Brief summary of the meeting",
  "key_tensions": ["Main points of conflict"],
  "consensus_points": ["Points everyone agrees on"],
  "vote_prediction": "How a vote would likely go"
}}"""


class TownHallGenerator:
    """
    Generates realistic town hall transcripts with multiple speakers.
    
    Features:
    - Speakers from different archetypes
    - Arguments grounded in simulation results
    - Dramatic elements (interruptions, rebuttals)
    - Cross-examination support
    - Flip strategy suggestions
    """

    def __init__(self, api_key: Optional[str] = None):
        settings = get_settings()
        self.api_key = api_key or settings.backboard_api_key
        self.base_url = settings.backboard_base_url
        self.headers = {
            "X-API-Key": self.api_key,
            "Accept": "application/json",
        }

    async def generate_townhall(
        self,
        proposal: Proposal,
        scenario_data: ScenarioData,
        num_speakers: int = 5,
        include_dramatic_elements: bool = True,
        focus_archetype: Optional[str] = None,
    ) -> TownHallTranscript:
        """Generate a town hall transcript."""
        # Run simulation to get results
        simulator = CivicSimulator(scenario_data)
        result = simulator.simulate(proposal, include_debug=False)
        
        # Select speakers based on results
        speakers = self._select_speakers(result, num_speakers, focus_archetype)
        
        # Generate exchanges
        try:
            if self.api_key:
                exchanges, summary, tensions, consensus, vote = await self._llm_generate_exchanges(
                    proposal, result, speakers, include_dramatic_elements
                )
            else:
                raise Exception("No API key")
        except Exception:
            exchanges, summary, tensions, consensus, vote = self._fallback_generate_exchanges(
                proposal, result, speakers, include_dramatic_elements
            )
        
        return TownHallTranscript(
            speakers=speakers,
            exchanges=exchanges,
            summary=summary,
            key_tensions=tensions,
            consensus_points=consensus,
            vote_prediction=vote,
        )

    def _select_speakers(
        self,
        result,
        num_speakers: int,
        focus_archetype: Optional[str],
    ) -> list[Speaker]:
        """Select speakers from archetypes based on results."""
        speakers = []
        
        # Sort archetypes by score extremity (most opinionated first)
        sorted_archetypes = sorted(
            result.approval_by_archetype,
            key=lambda a: abs(a.score),
            reverse=True
        )
        
        # Include focus archetype if specified
        if focus_archetype:
            for arch in sorted_archetypes:
                if arch.archetype_key == focus_archetype:
                    sorted_archetypes.remove(arch)
                    sorted_archetypes.insert(0, arch)
                    break
        
        # Create speakers
        for arch in sorted_archetypes[:num_speakers]:
            role_info = ARCHETYPE_ROLES.get(
                arch.archetype_key,
                ("Citizen", "Community member", "👤")
            )
            
            stance = "support" if arch.score > 20 else "oppose" if arch.score < -20 else "mixed"
            
            speakers.append(Speaker(
                id=arch.archetype_key,
                archetype_key=arch.archetype_key,
                name=role_info[0],
                role=role_info[1],
                stance=stance,
                approval_score=arch.score,
                avatar_emoji=role_info[2],
            ))
        
        return speakers

    async def _llm_generate_exchanges(
        self,
        proposal: Proposal,
        result,
        speakers: list[Speaker],
        dramatic: bool,
    ) -> tuple[list[Exchange], str, list[str], list[str], str]:
        """Generate exchanges using LLM."""
        # Build context
        proposal_str = json.dumps(proposal.model_dump(), indent=2)
        
        results_str = f"""Overall Approval: {result.overall_approval:.1f}
Sentiment: {result.overall_sentiment}

Speaker Scores:
"""
        for s in speakers:
            results_str += f"- {s.name} ({s.archetype_key}): {s.approval_score:.1f} ({s.stance})\n"
        
        results_str += "\nTop Drivers:\n"
        for d in result.top_drivers[:3]:
            results_str += f"- {d.metric_name}: {d.direction} ({d.delta:+.2f})\n"
        
        prompt = TOWNHALL_PROMPT.format(
            proposal=proposal_str,
            results=results_str,
            num_speakers=len(speakers),
            dramatic="yes" if dramatic else "no",
        )
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            # Create assistant
            asst_response = await client.post(
                f"{self.base_url}/assistants",
                headers=self.headers,
                json={
                    "name": "CivicSim Town Hall",
                    "system_prompt": "You generate town hall transcripts in JSON format.",
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
            thread_id = thread_response.json().get("thread_id") or thread_response.json().get("id")
            
            # Send message
            msg_response = await client.post(
                f"{self.base_url}/threads/{thread_id}/messages",
                headers=self.headers,
                data={
                    "content": prompt,
                    "memory": "off",
                    "web_search": "off",
                    "llm_provider": "google",
                    "model_name": "gemini-2.5-flash",
                    "stream": "false",
                },
            )
            
            content = msg_response.json().get("content", "")
            
            # Extract JSON
            if "```json" in content:
                json_str = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                json_str = content.split("```")[1].split("```")[0]
            else:
                json_str = content
            
            data = json.loads(json_str.strip())
            
            exchanges = [
                Exchange(
                    speaker_id=e.get("speaker_id", speakers[0].id),
                    type=e.get("type", "statement"),
                    content=e.get("content", ""),
                    cited_metrics=e.get("cited_metrics", []),
                    emotion=e.get("emotion", "neutral"),
                )
                for e in data.get("exchanges", [])
            ]
            
            return (
                exchanges,
                data.get("summary", "Town hall concluded."),
                data.get("key_tensions", []),
                data.get("consensus_points", []),
                data.get("vote_prediction", "Mixed results expected"),
            )

    def _fallback_generate_exchanges(
        self,
        proposal: Proposal,
        result,
        speakers: list[Speaker],
        dramatic: bool,
    ) -> tuple[list[Exchange], str, list[str], list[str], str]:
        """Generate exchanges without LLM."""
        exchanges = []
        
        # Opening statement
        exchanges.append(Exchange(
            speaker_id=speakers[0].id,
            type="statement",
            content=self._generate_archetype_statement(speakers[0], result),
            cited_metrics=[result.top_drivers[0].metric_key] if result.top_drivers else [],
            emotion="supportive" if speakers[0].stance == "support" else "concerned",
        ))
        
        # Responses from other speakers
        for i, speaker in enumerate(speakers[1:], 1):
            exchanges.append(Exchange(
                speaker_id=speaker.id,
                type="statement",
                content=self._generate_archetype_statement(speaker, result),
                cited_metrics=[result.top_drivers[min(i, len(result.top_drivers)-1)].metric_key] if result.top_drivers else [],
                emotion="supportive" if speaker.stance == "support" else "concerned" if speaker.stance == "oppose" else "neutral",
            ))
            
            # Add dramatic elements
            if dramatic and i < len(speakers) - 1:
                prev_speaker = speakers[i-1] if i > 0 else speakers[0]
                if prev_speaker.stance != speaker.stance:
                    exchanges.append(Exchange(
                        speaker_id=prev_speaker.id,
                        type="rebuttal",
                        content=f"I have to disagree with that assessment. The data shows otherwise.",
                        emotion="neutral",
                    ))
        
        # Summary
        supporters = sum(1 for s in speakers if s.stance == "support")
        opposers = sum(1 for s in speakers if s.stance == "oppose")
        
        if supporters > opposers:
            summary = f"The meeting showed majority support ({supporters}/{len(speakers)}) for the proposal."
            vote = "Likely to pass"
        elif opposers > supporters:
            summary = f"The meeting revealed significant opposition ({opposers}/{len(speakers)}) to the proposal."
            vote = "Likely to fail"
        else:
            summary = "The meeting showed divided opinions on the proposal."
            vote = "Too close to call"
        
        tensions = []
        consensus = []
        
        if result.top_drivers:
            if result.top_drivers[0].direction == "negative":
                tensions.append(f"Concerns about {result.top_drivers[0].metric_name}")
            else:
                consensus.append(f"Agreement on benefits to {result.top_drivers[0].metric_name}")
        
        return exchanges, summary, tensions, consensus, vote

    def _generate_archetype_statement(self, speaker: Speaker, result) -> str:
        """Generate a statement for an archetype based on results."""
        arch_def = ARCHETYPE_DEFINITIONS.get(speaker.archetype_key, {})
        
        if speaker.stance == "support":
            return (
                f"As a {speaker.role.lower()}, I support this proposal. "
                f"It addresses real needs in our community, particularly around "
                f"{arch_def.get('top_concern', 'important issues')}. "
                f"My approval score is {speaker.approval_score:.0f}."
            )
        elif speaker.stance == "oppose":
            return (
                f"I have serious concerns about this proposal. As a {speaker.role.lower()}, "
                f"I worry about the impact on {arch_def.get('top_concern', 'our community')}. "
                f"My approval score is {speaker.approval_score:.0f}."
            )
        else:
            return (
                f"I have mixed feelings about this proposal. While there are some benefits, "
                f"I'd like to see more consideration for {arch_def.get('top_concern', 'community needs')}. "
                f"My approval score is {speaker.approval_score:.0f}."
            )

    async def cross_examine(
        self,
        proposal: Proposal,
        scenario_data: ScenarioData,
        speaker_archetype: str,
        question: str,
    ) -> CrossExamineResponse:
        """Cross-examine a speaker with a specific question."""
        # Run simulation
        simulator = CivicSimulator(scenario_data)
        result = simulator.simulate(proposal, include_debug=False)
        
        # Find the archetype's result
        arch_result = None
        for a in result.approval_by_archetype:
            if a.archetype_key == speaker_archetype:
                arch_result = a
                break
        
        if not arch_result:
            return CrossExamineResponse(
                speaker_name="Unknown",
                response="I wasn't at this meeting.",
            )
        
        role_info = ARCHETYPE_ROLES.get(speaker_archetype, ("Citizen", "Community member", "👤"))
        
        # Generate response based on stance
        if arch_result.score > 20:
            response = (
                f"That's a fair question. As a {role_info[1].lower()}, I support this because "
                f"it aligns with what our community needs. My score of {arch_result.score:.0f} "
                f"reflects genuine optimism about the outcomes."
            )
        elif arch_result.score < -20:
            response = (
                f"I appreciate you asking. My concerns stem from the potential negative impacts. "
                f"With a score of {arch_result.score:.0f}, I believe we need significant changes "
                f"before I can support this proposal."
            )
        else:
            response = (
                f"It's complicated. I see both positives and negatives here. "
                f"My moderate score of {arch_result.score:.0f} reflects this ambivalence. "
                f"I'd support it with some modifications."
            )
        
        return CrossExamineResponse(
            speaker_name=role_info[0],
            response=response,
        )

    async def find_flip_strategy(
        self,
        proposal: Proposal,
        scenario_data: ScenarioData,
        speaker_archetype: str,
    ) -> FlipSpeakerResponse:
        """Find what changes would flip a speaker's stance."""
        # Run simulation
        simulator = CivicSimulator(scenario_data)
        result = simulator.simulate(proposal, include_debug=False)
        
        # Find archetype
        arch_result = None
        for a in result.approval_by_archetype:
            if a.archetype_key == speaker_archetype:
                arch_result = a
                break
        
        if not arch_result:
            return FlipSpeakerResponse(
                speaker_name="Unknown",
                current_stance="unknown",
                current_score=0,
                suggestions=["Speaker not found"],
            )
        
        role_info = ARCHETYPE_ROLES.get(speaker_archetype, ("Citizen", "Community member", "👤"))
        arch_def = ARCHETYPE_DEFINITIONS.get(speaker_archetype, {})
        
        stance = "support" if arch_result.score > 20 else "oppose" if arch_result.score < -20 else "mixed"
        
        suggestions = []
        
        # Generate suggestions based on archetype's sensitivities
        sensitivities = arch_def.get("sensitivities", {})
        for metric, sensitivity in sorted(sensitivities.items(), key=lambda x: abs(x[1]), reverse=True)[:3]:
            if sensitivity > 0:
                suggestions.append(f"Improve {metric.replace('_', ' ')} outcomes to gain support")
            else:
                suggestions.append(f"Reduce negative impact on {metric.replace('_', ' ')}")
        
        if not suggestions:
            if stance == "oppose":
                suggestions = [
                    "Add affordable housing component",
                    "Include green space requirements",
                    "Phase the implementation",
                ]
            else:
                suggestions = ["Current proposal already has their support"]
        
        return FlipSpeakerResponse(
            speaker_name=role_info[0],
            current_stance=stance,
            current_score=arch_result.score,
            suggestions=suggestions,
        )
