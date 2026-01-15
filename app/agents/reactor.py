"""Agent reactor - generates reactions from multiple agents in parallel."""

import asyncio
import json
import logging
from typing import Optional

from app.services.backboard_client import BackboardClient, BackboardError
from app.schemas.multi_agent import (
    InterpretedProposal,
    AgentReaction,
    ZoneEffect,
)
from app.agents.definitions import AGENTS, ZONES

logger = logging.getLogger(__name__)

# Reaction prompt template
REACTION_PROMPT = """You are {agent_name}, {agent_role}.

{persona}

A civic proposal has been made in Kingston:
TITLE: {proposal_title}
TYPE: {proposal_type}
SUMMARY: {proposal_summary}
AFFECTED AREAS: {affected_zones}

Based on your persona, priorities, and concerns, provide your reaction.

Respond with ONLY valid JSON:
- stance: "support", "oppose", or "neutral"
- intensity: 0.0 to 1.0 (how strongly you feel)
- support_reasons: list of 0-3 reasons you support (if any)
- concerns: list of 0-3 concerns you have
- quote: your reaction in 25 words or less, in first person, in character
- what_would_change_my_mind: 1-3 things that would shift your position
- zones_most_affected: list of zones you think are most impacted, each with zone_id, effect (support/oppose/neutral), intensity
- proposed_amendments: 0-3 changes you'd propose to improve it

Available zone_ids: university, north_end, west_kingston, downtown

Respond with JSON only."""


class AgentReactor:
    """Generates reactions from multiple agents in parallel."""
    
    def __init__(self, client: BackboardClient):
        self.client = client
        self._assistant_id: Optional[str] = None
        self._agent_threads: dict[str, str] = {}  # agent_key -> thread_id
    
    async def get_all_reactions(
        self,
        proposal: InterpretedProposal,
        session_id: str,
    ) -> list[AgentReaction]:
        """
        Get reactions from all agents in parallel.
        
        Returns list of AgentReaction objects.
        """
        # Run all agent reactions concurrently
        tasks = [
            self._get_agent_reaction(agent, proposal, session_id)
            for agent in AGENTS
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Filter out errors and return valid reactions
        reactions = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"[REACTOR] Agent {AGENTS[i]['key']} failed: {result}")
                # Create a neutral fallback reaction
                reactions.append(self._fallback_reaction(AGENTS[i]))
            else:
                reactions.append(result)
        
        return reactions
    
    async def _get_agent_reaction(
        self,
        agent: dict,
        proposal: InterpretedProposal,
        session_id: str,
    ) -> AgentReaction:
        """Get reaction from a single agent."""
        agent_key = agent["key"]
        
        # Build affected zones string
        if proposal.location.zone_ids:
            affected = ", ".join(
                z["name"] for z in ZONES 
                if z["id"] in proposal.location.zone_ids
            ) or "Citywide"
        else:
            affected = "Citywide"
        
        # Build prompt
        prompt = REACTION_PROMPT.format(
            agent_name=agent["name"],
            agent_role=agent["role"],
            persona=agent["persona"],
            proposal_title=proposal.title,
            proposal_type=proposal.type,
            proposal_summary=proposal.summary,
            affected_zones=affected,
        )
        
        try:
            # Get or create thread for this agent
            thread_id = await self._get_agent_thread(agent_key, session_id)
            
            # Send to Backboard
            response_text = await self.client.send_message(thread_id, prompt)
            
            # Parse response
            reaction = self._parse_reaction(response_text, agent)
            return reaction
            
        except BackboardError as e:
            logger.error(f"[REACTOR] Agent {agent_key} Backboard error: {e}")
            return self._fallback_reaction(agent)
        except Exception as e:
            logger.error(f"[REACTOR] Agent {agent_key} error: {e}")
            return self._fallback_reaction(agent)
    
    async def _get_agent_thread(self, agent_key: str, session_id: str) -> str:
        """Get or create a thread for an agent."""
        cache_key = f"{session_id}:{agent_key}"
        
        if cache_key in self._agent_threads:
            return self._agent_threads[cache_key]
        
        # Ensure assistant exists
        if not self._assistant_id:
            self._assistant_id = await self.client.create_assistant(
                name="CivicSim Agent",
                system_prompt="You are a Kingston resident reacting to civic proposals. Respond in character with valid JSON only."
            )
        
        # Create thread for this agent
        thread_id = await self.client.create_thread(self._assistant_id)
        self._agent_threads[cache_key] = thread_id
        
        return thread_id
    
    def _parse_reaction(self, response_text: str, agent: dict) -> AgentReaction:
        """Parse LLM response into AgentReaction."""
        text = response_text.strip()
        
        # Handle markdown code blocks
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
        
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            logger.warning(f"[REACTOR] JSON parse failed for {agent['key']}")
            return self._fallback_reaction(agent)
        
        # Build zone effects
        zone_effects = []
        for z in data.get("zones_most_affected", []):
            if isinstance(z, dict) and "zone_id" in z:
                zone_effects.append(ZoneEffect(
                    zone_id=z["zone_id"],
                    effect=z.get("effect", "neutral"),
                    intensity=z.get("intensity", 0.5),
                ))
        
        return AgentReaction(
            agent_key=agent["key"],
            agent_name=agent["name"],
            avatar=agent.get("avatar", "👤"),
            stance=data.get("stance", "neutral"),
            intensity=min(1.0, max(0.0, data.get("intensity", 0.5))),
            support_reasons=data.get("support_reasons", [])[:3],
            concerns=data.get("concerns", [])[:3],
            quote=data.get("quote", "")[:150],
            what_would_change_my_mind=data.get("what_would_change_my_mind", [])[:3],
            zones_most_affected=zone_effects,
            proposed_amendments=data.get("proposed_amendments", [])[:3],
        )
    
    def _fallback_reaction(self, agent: dict) -> AgentReaction:
        """Create a neutral fallback reaction when LLM fails."""
        return AgentReaction(
            agent_key=agent["key"],
            agent_name=agent["name"],
            avatar=agent.get("avatar", "👤"),
            stance="neutral",
            intensity=0.5,
            quote="I need more information to form an opinion on this.",
            concerns=["More details needed"],
        )

