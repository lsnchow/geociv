"""Town Hall transcript generator - creates moderated debate from agent reactions."""

import json
import logging
from typing import Optional

from app.services.backboard_client import BackboardClient, BackboardError
from app.schemas.multi_agent import (
    InterpretedProposal,
    AgentReaction,
    TownHallTranscript,
    TranscriptTurn,
)
from app.agents.session_manager import get_session_manager

logger = logging.getLogger(__name__)

TOWNHALL_PROMPT = """You are a moderator for a Kingston town hall meeting about a civic proposal.

PROPOSAL: {proposal_title}
TYPE: {proposal_type}
SUMMARY: {proposal_summary}

STAKEHOLDER REACTIONS:
{reactions_summary}

Generate a realistic, engaging town hall transcript with 6-10 turns. Include:
1. Moderator opening summary
2. Back-and-forth dialogue between stakeholders
3. Some tension/disagreement
4. At least one moment of agreement or common ground
5. Moderator closing with compromise options

Respond with ONLY valid JSON:
- moderator_summary: 2-3 sentence overview of the debate
- turns: array of speaker turns, each with "speaker" (name or "Moderator") and "text" (max 40 words)
- compromise_options: 1-3 potential middle-ground solutions

Keep it realistic and engaging. Each turn should be max 40 words.
Respond with JSON only."""


class TownHallGenerator:
    """Generates town hall debate transcripts."""
    
    def __init__(self, client: BackboardClient):
        self.client = client
        self.session_mgr = get_session_manager()
    
    async def generate(
        self,
        proposal: InterpretedProposal,
        reactions: list[AgentReaction],
        session_id: str,
    ) -> TownHallTranscript:
        """
        Generate a town hall transcript from agent reactions.
        
        Uses session_id to maintain thread continuity.
        """
        session = self.session_mgr.get_or_create_session(session_id)
        
        # Build reactions summary
        reactions_summary = self._format_reactions(reactions)
        
        prompt = TOWNHALL_PROMPT.format(
            proposal_title=proposal.title,
            proposal_type=proposal.type,
            proposal_summary=proposal.summary,
            reactions_summary=reactions_summary,
        )
        
        try:
            # Get or create thread for THIS SESSION
            if not session.townhall_thread_id:
                if not session.townhall_assistant_id:
                    session.townhall_assistant_id = await self.client.create_assistant(
                        name="CivicSim Town Hall",
                        system_prompt="You moderate town hall meetings and generate realistic debate transcripts. Respond with valid JSON only."
                    )
                    logger.info(f"[TOWNHALL] Created assistant={session.townhall_assistant_id}")
                session.townhall_thread_id = await self.client.create_thread(session.townhall_assistant_id)
                logger.info(f"[TOWNHALL] Created thread={session.townhall_thread_id} for session={session_id}")
            
            logger.info(f"[TOWNHALL] session={session_id} thread={session.townhall_thread_id} content_len={len(prompt)}")
            
            # Send to Backboard (returns string directly)
            response_text = await self.client.send_message(session.townhall_thread_id, prompt)
            
            logger.info(f"[TOWNHALL] session={session_id} response_len={len(response_text)}")
            
            # Parse response
            transcript = self._parse_transcript(response_text, reactions)
            return transcript
            
        except BackboardError as e:
            logger.error(f"[TOWNHALL] session={session_id} Backboard error: {e}")
            return self._fallback_transcript(proposal, reactions)
        except Exception as e:
            logger.error(f"[TOWNHALL] session={session_id} Error: {e}")
            return self._fallback_transcript(proposal, reactions)
    
    def _format_reactions(self, reactions: list[AgentReaction]) -> str:
        """Format reactions for the prompt."""
        lines = []
        for r in reactions:
            stance_emoji = {"support": "👍", "oppose": "👎", "neutral": "🤔"}.get(r.stance, "🤔")
            lines.append(f"- {r.agent_name} ({r.avatar}): {stance_emoji} {r.stance.upper()}")
            if r.quote:
                lines.append(f'  Quote: "{r.quote}"')
            if r.concerns:
                lines.append(f"  Concerns: {', '.join(r.concerns[:2])}")
            if r.support_reasons:
                lines.append(f"  Supports because: {', '.join(r.support_reasons[:2])}")
        return "\n".join(lines)
    
    def _parse_transcript(
        self,
        response_text: str,
        reactions: list[AgentReaction],
    ) -> TownHallTranscript:
        """Parse LLM response into TownHallTranscript."""
        text = response_text.strip()
        
        # Handle markdown code blocks
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
        
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            logger.warning("[TOWNHALL] JSON parse failed")
            return self._fallback_transcript_from_reactions(reactions)
        
        # Build turns
        turns = []
        for turn in data.get("turns", [])[:12]:
            if isinstance(turn, dict) and "speaker" in turn and "text" in turn:
                turns.append(TranscriptTurn(
                    speaker=turn["speaker"],
                    text=turn["text"][:250],
                ))
        
        # Ensure we have enough turns
        if len(turns) < 5:
            return self._fallback_transcript_from_reactions(reactions)
        
        return TownHallTranscript(
            moderator_summary=data.get("moderator_summary", "Town hall discussion on the proposal.")[:500],
            turns=turns,
            compromise_options=data.get("compromise_options", [])[:3],
        )
    
    def _fallback_transcript(
        self,
        proposal: InterpretedProposal,
        reactions: list[AgentReaction],
    ) -> TownHallTranscript:
        """Create fallback transcript when LLM fails."""
        return self._fallback_transcript_from_reactions(reactions)
    
    def _fallback_transcript_from_reactions(
        self,
        reactions: list[AgentReaction],
    ) -> TownHallTranscript:
        """Build a simple transcript from agent reactions."""
        turns = [
            TranscriptTurn(
                speaker="Moderator",
                text="Welcome to today's town hall. We'll hear from various stakeholders about this proposal."
            )
        ]
        
        # Add turns from agents with quotes
        for r in reactions:
            if r.quote:
                turns.append(TranscriptTurn(
                    speaker=r.agent_name,
                    text=r.quote,
                ))
        
        # Ensure minimum 5 turns
        while len(turns) < 5:
            turns.append(TranscriptTurn(
                speaker="Moderator",
                text="Thank you for your input. Let's continue the discussion."
            ))
        
        turns.append(TranscriptTurn(
            speaker="Moderator",
            text="Thank you all for participating. We'll take these perspectives under consideration."
        ))
        
        return TownHallTranscript(
            moderator_summary="A town hall discussion was held to gather community feedback on the proposal.",
            turns=turns[:12],
            compromise_options=["Consider phased implementation", "Gather more community input"],
        )

