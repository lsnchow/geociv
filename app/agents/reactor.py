"""Agent reactor - generates reactions from multiple agents in parallel."""

import asyncio
import json
import logging
from typing import Optional, Callable, Any

from app.services.backboard_client import BackboardClient, BackboardError
from app.schemas.multi_agent import (
    InterpretedProposal,
    AgentReaction,
    ZoneEffect,
)
from app.schemas.proposal import WorldStateSummary
from app.agents.definitions import AGENTS, ZONES
from app.agents.session_manager import get_session_manager
from app.config import DEFAULT_MODEL, get_provider

logger = logging.getLogger(__name__)


# Type for agent overrides passed from the API
AgentOverridesMap = dict[str, dict[str, Optional[str]]]  # agent_key -> {model?, archetype_override?}

# Reaction prompt template
REACTION_PROMPT = """You are {agent_name}, the {agent_role} representing {region_name}.

BIO: {bio}

SPEAKING STYLE: {speaking_style}

{persona}
{world_state_context}
A civic proposal has been made in Kingston:
TITLE: {proposal_title}
TYPE: {proposal_type}
SUMMARY: {proposal_summary}
AFFECTED AREAS: {affected_zones}
{vicinity_context}

Based on your persona, priorities, concerns, and your region's interests, provide your reaction.
Consider any existing buildings, adopted policies, or relationship dynamics when forming your opinion.

Respond with ONLY valid JSON:
- stance: "support", "oppose", or "neutral"
- intensity: 0.0 to 1.0 (how strongly you feel)
- support_reasons: list of 0-3 reasons you support (if any)
- concerns: list of 0-3 concerns you have
- quote: your reaction in 25 words or less, in first person, in character, using your speaking style
- what_would_change_my_mind: 1-3 things that would shift your position
- zones_most_affected: list of zones you think are most impacted, each with zone_id, effect (support/oppose/neutral), intensity
- proposed_amendments: 0-3 changes you'd propose to improve it

Available zone_ids: {available_zone_ids}

Respond with JSON only."""


class AgentReactor:
    """Generates reactions from multiple agents in parallel."""
    
    def __init__(self, client: BackboardClient):
        self.client = client
        self.session_mgr = get_session_manager()
    
    async def get_all_reactions(
        self,
        proposal: InterpretedProposal,
        session_id: str,
        vicinity_data: Optional[dict] = None,
        world_state: Optional[WorldStateSummary] = None,
        agent_overrides: Optional[AgentOverridesMap] = None,
    ) -> list[AgentReaction]:
        """
        Get reactions from all agents in parallel.
        
        Uses session_id to maintain thread continuity per agent.
        vicinity_data (optional): Contains affected_regions with proximity weights.
        world_state (optional): Canonical world state with placed items, policies, relationships.
        agent_overrides (optional): Per-agent model and archetype overrides.
        Returns list of AgentReaction objects.
        """
        logger.info(f"[REACTOR] Starting reactions for session={session_id}")
        if world_state:
            logger.info(f"[REACTOR] World state: {world_state.version} version, {len(world_state.placed_items)} items, {len(world_state.adopted_policies)} policies")
        if agent_overrides:
            override_count = sum(1 for o in agent_overrides.values() if o.get("model") or o.get("archetype_override"))
            logger.info(f"[REACTOR] Agent overrides: {override_count} agents with custom settings")
        
        overrides = agent_overrides or {}
        
        # Run all agent reactions concurrently
        tasks = [
            self._get_agent_reaction(agent, proposal, session_id, vicinity_data, world_state, overrides.get(agent["key"]))
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
        
        logger.info(f"[REACTOR] Completed {len(reactions)} reactions for session={session_id}")
        return reactions
    
    async def get_all_reactions_with_progress(
        self,
        proposal: InterpretedProposal,
        session_id: str,
        vicinity_data: Optional[dict] = None,
        world_state: Optional[WorldStateSummary] = None,
        progress_callback: Optional[Callable] = None,
        aggregator: Optional[Any] = None,
        agent_overrides: Optional[AgentOverridesMap] = None,
    ) -> list[AgentReaction]:
        """
        Get reactions from all agents with per-agent progress updates.
        
        Uses asyncio.as_completed to report progress as each agent finishes.
        This enables real-time UI updates showing agents populating the map.
        
        Args:
            proposal: The interpreted proposal
            session_id: Session ID for thread continuity
            vicinity_data: Optional proximity data from build mode
            world_state: Optional canonical world state
            progress_callback: Async callback(reaction_dict, zone_sentiment_dict) per agent
            aggregator: SentimentAggregator to compute zone sentiment per agent
            agent_overrides: Optional per-agent model and archetype overrides
        
        Returns:
            List of AgentReaction objects
        """
        logger.info(f"[REACTOR-PROGRESSIVE] Starting reactions for session={session_id}")
        
        overrides = agent_overrides or {}
        
        # Create tasks with agent info for tracking
        # Store both task and agent info together so we can identify which agent completed
        task_agent_map = []
        for agent in AGENTS:
            task = self._get_agent_reaction(agent, proposal, session_id, vicinity_data, world_state, overrides.get(agent["key"]))
            task_agent_map.append((task, agent))
        
        reactions = []
        
        # Process as each agent completes
        for coro in asyncio.as_completed([t for t, _ in task_agent_map]):
            try:
                result = await coro
                reactions.append(result)
                
                # Find which agent this result belongs to by matching agent_key
                agent = next(a for _, a in task_agent_map if a['key'] == result.agent_key)
                
                # Report progress if callback provided
                if progress_callback:
                    # Compute zone sentiment for this agent
                    zone_sentiment = None
                    if aggregator:
                        # Get single-agent sentiment for their zone
                        zone_sentiment = self._compute_agent_zone_sentiment(result, agent)
                    
                    await progress_callback(
                        result.model_dump(),
                        zone_sentiment
                    )
                
                logger.debug(f"[REACTOR-PROGRESSIVE] Agent {agent['key']} completed")
                
            except Exception as e:
                logger.error(f"[REACTOR-PROGRESSIVE] Agent failed: {e}")
                # Create a fallback reaction - we don't know which agent failed
                # but we still need to report it
                fallback = self._fallback_reaction(AGENTS[len(reactions)])
                reactions.append(fallback)
                
                if progress_callback:
                    await progress_callback(fallback.model_dump(), None)
        
        logger.info(f"[REACTOR-PROGRESSIVE] Completed {len(reactions)} reactions for session={session_id}")
        return reactions
    
    def _compute_agent_zone_sentiment(self, reaction: AgentReaction, agent: dict) -> Optional[dict]:
        """Compute zone sentiment from a single agent's reaction."""
        # Map stance to sentiment value
        stance_value = {
            "support": 1.0,
            "oppose": -1.0,
            "neutral": 0.0
        }.get(reaction.stance, 0.0)
        
        # Weight by intensity
        weighted_sentiment = stance_value * reaction.intensity
        
        # Find the zone this agent represents
        zone_id = agent.get("key", agent.get("id", "unknown"))
        zone = next((z for z in ZONES if z["id"] == zone_id), None)
        
        if zone:
            return {
                "zone_id": zone["id"],
                "zone_name": zone["name"],
                "sentiment": weighted_sentiment,
                "dominant_stance": reaction.stance,
                "agent_key": agent.get("key"),
            }
        return None
    
    async def _get_agent_reaction(
        self,
        agent: dict,
        proposal: InterpretedProposal,
        session_id: str,
        vicinity_data: Optional[dict] = None,
        world_state: Optional[WorldStateSummary] = None,
        agent_override: Optional[dict] = None,
    ) -> AgentReaction:
        """Get reaction from a single agent.
        
        Args:
            agent: Agent definition dict
            proposal: The interpreted proposal
            session_id: Session ID for thread continuity
            vicinity_data: Optional proximity data from build mode
            world_state: Optional canonical world state
            agent_override: Optional dict with 'model' and/or 'archetype_override' keys
        """
        agent_key = agent["key"]
        session = self.session_mgr.get_or_create_session(session_id)
        
        # Get region name for this agent
        zone = next((z for z in ZONES if z["id"] == agent_key), None)
        region_name = zone["name"] if zone else agent_key
        
        # Build affected zones string
        if proposal.location.zone_ids:
            affected = ", ".join(
                z["name"] for z in ZONES 
                if z["id"] in proposal.location.zone_ids
            ) or "Citywide"
        else:
            affected = "Citywide"
        
        # Build world state context (if provided)
        world_state_context = ""
        if world_state:
            world_state_context = world_state.to_prompt_context()
        
        # Build vicinity context for this agent (if we have vicinity data from build mode)
        vicinity_context = ""
        if vicinity_data and vicinity_data.get("affected_regions"):
            # Find this agent's region in the affected regions list
            my_region = next(
                (r for r in vicinity_data["affected_regions"] if r.get("zone_id") == agent_key),
                None
            )
            if my_region:
                bucket = my_region.get("distance_bucket", "unknown")
                weight = my_region.get("proximity_weight", 0)
                
                if bucket == "near":
                    vicinity_context = f"\nPROXIMITY: This proposal is VERY CLOSE to your region ({region_name}). It will strongly affect your community."
                elif bucket == "medium":
                    vicinity_context = f"\nPROXIMITY: This proposal is at a MODERATE DISTANCE from your region ({region_name}). It will have some effect on your community."
                else:  # far
                    vicinity_context = f"\nPROXIMITY: This proposal is FAR from your region ({region_name}). It will have minimal direct effect on your community, but you may still have opinions."
        
        # Build list of available zone IDs
        available_zone_ids = ", ".join(z["id"] for z in ZONES)
        
        # Use archetype override if provided, otherwise use default persona
        persona = agent["persona"]
        if agent_override and agent_override.get("archetype_override"):
            persona = agent_override["archetype_override"]
            logger.debug(f"[REACTOR] Using custom archetype for agent={agent_key}")
        
        prompt = REACTION_PROMPT.format(
            agent_name=agent.get("display_name", agent.get("name", "Agent")),
            agent_role=agent["role"],
            region_name=region_name,
            bio=agent.get("bio", ""),
            speaking_style=agent.get("speaking_style", "Direct and clear"),
            persona=persona,
            world_state_context=world_state_context,
            proposal_title=proposal.title,
            proposal_type=proposal.type,
            proposal_summary=proposal.summary,
            affected_zones=affected,
            vicinity_context=vicinity_context,
            available_zone_ids=available_zone_ids,
        )
        
        # Determine model to use (override or default)
        model = DEFAULT_MODEL
        if agent_override and agent_override.get("model"):
            model = agent_override["model"]
            logger.debug(f"[REACTOR] Using custom model for agent={agent_key}: {model}")
        
        provider = get_provider(model)
        
        try:
            # Get or create thread for this agent IN THIS SESSION
            thread_id = await self._get_agent_thread(agent_key, session)
            
            logger.info(f"[REACTOR] session={session_id} agent={agent_key} thread={thread_id} model={model} content_len={len(prompt)}")

            # Create an edge for this API call from system to agent
            session.update_relationship(
                from_agent="system",
                to_agent=agent_key,
                delta=0.0,  # No relationship change, just tracking the call
                reason=f"API call for proposal reaction",
                message=f"Requesting reaction to: {proposal.title[:60]}...",
            )

            # Send to Backboard with agent-specific model
            response_text = await self.client.send_message(
                thread_id, 
                prompt,
                model=model,
                provider=provider,
                caller_context=f"reactor.react[{agent_key}]",
                request_type="agent"
            )
            
            logger.info(f"[REACTOR] session={session_id} agent={agent_key} response_len={len(response_text)}")

            # Parse response
            reaction = self._parse_reaction(response_text, agent)
            return reaction
            
        except BackboardError as e:
            logger.error(f"[REACTOR] session={session_id} agent={agent_key} Backboard error: {e}")
            return self._fallback_reaction(agent)
        except Exception as e:
            logger.error(f"[REACTOR] session={session_id} agent={agent_key} error: {e}")
            return self._fallback_reaction(agent)
    
    async def _get_agent_thread(self, agent_key: str, session) -> str:
        """Get or create a thread for an agent within a session."""
        # Check if thread already exists for this agent in this session
        if agent_key in session.agent_threads:
            logger.debug(f"[REACTOR] Reusing thread for agent={agent_key}")
            return session.agent_threads[agent_key]
        
        # Ensure reactor assistant exists for this session
        if not session.reactor_assistant_id:
            session.reactor_assistant_id = await self.client.create_assistant(
                name="CivicSim Agent",
                system_prompt="You are a Kingston resident reacting to civic proposals. Respond in character with valid JSON only.",
                caller_context="reactor.setup"
            )
            logger.info(f"[REACTOR] Created reactor assistant={session.reactor_assistant_id}")
        
        # Create thread for this agent
        thread_id = await self.client.create_thread(
            session.reactor_assistant_id,
            caller_context="reactor.setup"
        )
        session.agent_threads[agent_key] = thread_id
        logger.info(f"[REACTOR] Created thread={thread_id} for agent={agent_key} session={session.session_id}")
        
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
        
        # Normalize list fields - LLM sometimes returns objects instead of strings
        def normalize_string_list(items: list) -> list[str]:
            result = []
            for item in items:
                if isinstance(item, str):
                    result.append(item)
                elif isinstance(item, dict):
                    # Extract first string value from dict
                    for v in item.values():
                        if isinstance(v, str):
                            result.append(v)
                            break
            return result
        
        return AgentReaction(
            agent_key=agent["key"],
            agent_name=agent.get("display_name", agent.get("name", "Agent")),
            avatar=agent.get("avatar", "👤"),
            role=agent.get("role", ""),
            bio=agent.get("bio", ""),
            tags=agent.get("tags", []),
            stance=data.get("stance", "neutral"),
            intensity=min(1.0, max(0.0, data.get("intensity", 0.5))),
            support_reasons=normalize_string_list(data.get("support_reasons", []))[:3],
            concerns=normalize_string_list(data.get("concerns", []))[:3],
            quote=data.get("quote", "")[:150],
            what_would_change_my_mind=normalize_string_list(data.get("what_would_change_my_mind", []))[:3],
            zones_most_affected=zone_effects,
            proposed_amendments=normalize_string_list(data.get("proposed_amendments", []))[:3],
        )
    
    def _fallback_reaction(self, agent: dict) -> AgentReaction:
        """Create a neutral fallback reaction when LLM fails."""
        return AgentReaction(
            agent_key=agent["key"],
            agent_name=agent.get("display_name", agent.get("name", "Agent")),
            avatar=agent.get("avatar", "👤"),
            role=agent.get("role", ""),
            bio=agent.get("bio", ""),
            tags=agent.get("tags", []),
            stance="neutral",
            intensity=0.5,
            quote="I need more information to form an opinion on this.",
            concerns=["More details needed"],
        )
