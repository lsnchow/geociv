"""Multi-agent civic simulation endpoint."""

import datetime
import hashlib
import time
import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.services.backboard_client import BackboardClient, BackboardError
from app.agents.interpreter import ProposalInterpreter
from app.agents.reactor import AgentReactor
from app.agents.aggregator import SentimentAggregator
from app.agents.townhall import TownHallGenerator
from app.agents.definitions import AGENTS
from app.schemas.multi_agent import (
    InterpretedProposal,
    AgentReaction,
    ZoneSentiment,
    TownHallTranscript,
    SimulationReceipt,
    MultiAgentResponse,
)
from app.schemas.proposal import WorldStateSummary
from app.services.llm_metrics import reset_metrics, log_action_summary, set_wave_index

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["AI Chat"])


# =============================================================================
# Request Schema
# =============================================================================

class AIChatRequest(BaseModel):
    """Request for AI chat / simulation."""
    message: str = Field(..., min_length=1, description="User message (required, non-empty)")
    scenario_id: UUID = Field(..., description="Scenario ID for context")
    session_id: Optional[str] = Field(None, description="Session ID for continuity")
    thread_id: Optional[str] = Field(None, description="Thread ID (alias for session_id)")
    selected_zone_id: Optional[str] = Field(None, description="Zone user clicked on")
    # Speaker mode for multi-agent roleplay
    speaker_mode: Optional[str] = Field("user", description="'user' or 'agent' - who is speaking")
    speaker_agent_key: Optional[str] = Field(None, description="Agent key if speaker_mode='agent' (e.g., 'developer', 'student')")
    # Build mode - spatial proposal with vicinity data from drag-drop
    build_proposal: Optional[dict] = Field(None, description="Spatial proposal with affected_regions and containing_zone from build mode")
    # World state - canonical state for agent context
    world_state: Optional[WorldStateSummary] = Field(None, description="Current world state with placed items, adopted policies, and key relationships")
    # Legacy fields (still accepted)
    persona: Optional[str] = None
    auto_simulate: Optional[bool] = True


# =============================================================================
# Full Simulation Endpoint - ALWAYS produces simulation, never chatbot talk
# =============================================================================

@router.post("/chat", response_model=MultiAgentResponse)
async def ai_chat(request: AIChatRequest):
    """
    Multi-agent civic simulation endpoint.
    
    IMPORTANT: This is NOT a chatbot. Every message MUST result in:
    - A structured proposal + agent reactions, OR
    - Clarifying questions asking for missing parameters
    
    Flow:
    1. Interpret user message into structured proposal
    2. Get reactions from 6 agents (parallel)
    3. Aggregate zone sentiment
    4. Generate Town Hall transcript
    
    If speaker_mode='agent', the message is framed as that agent speaking.
    
    Returns full simulation response with reactions, zones, and transcript.
    On Backboard failure, returns 502 with error details.
    """
    start_time = time.time()
    
    # Reset metrics for this action
    reset_metrics()
    
    # Validate non-empty message
    if not request.message.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message cannot be empty"
        )
    
    # Session ID for continuity
    session_id = request.session_id or request.thread_id or f"scenario_{request.scenario_id}"
    
    try:
        client = BackboardClient()
        
        # Prepare message with speaker context if in agent mode
        effective_message = request.message
        if request.speaker_mode == "agent" and request.speaker_agent_key:
            from app.agents.definitions import get_agent
            agent = get_agent(request.speaker_agent_key)
            if agent:
                agent_name = agent.get('display_name', agent.get('name', 'Agent'))
                effective_message = f"[{agent_name} ({agent['role']}) proposes]: {request.message}"
                logger.info(f"[SIM] Speaking as agent: {agent_name}")
        
        # =================================================================
        # ALWAYS RUN FULL SIMULATION - no chatbot fallback
        # =================================================================
        
        logger.info(f"[SIM] Starting simulation for: {effective_message[:50]}...")
        
        # Step 1: Interpret proposal
        logger.info("[SIM] Step 1: Interpreting proposal...")
        set_wave_index(0)  # Wave 0 = interpretation
        interpreter = ProposalInterpreter(client)
        interpret_result = await interpreter.interpret(effective_message, session_id)
        
        if not interpret_result.ok or not interpret_result.proposal:
            # Interpretation failed - return clarification
            run_hash = hashlib.md5(
                f"{request.message}:{session_id}:{datetime.datetime.utcnow().isoformat()}".encode()
            ).hexdigest()[:12]
            
            assistant_msg = "I'm not sure I understood your proposal. "
            if interpret_result.clarifying_questions:
                assistant_msg += "Could you clarify: " + " ".join(interpret_result.clarifying_questions)
            elif interpret_result.error:
                assistant_msg += f"Error: {interpret_result.error}"
            else:
                assistant_msg += "Could you describe your proposal in more detail?"
            
            return MultiAgentResponse(
                session_id=session_id,
                thread_id=session_id,
                assistant_message=assistant_msg,
                receipt=SimulationReceipt(
                    run_hash=run_hash,
                    timestamp=datetime.datetime.utcnow().isoformat(),
                    duration_ms=int((time.time() - start_time) * 1000),
                ),
            )
        
        proposal = interpret_result.proposal
        logger.info(f"[SIM] Interpreted: {proposal.title} ({proposal.type})")
        
        # Step 2: Get agent reactions (parallel)
        logger.info("[SIM] Step 2: Getting agent reactions...")
        set_wave_index(1)  # Wave 1 = agent reactions
        reactor = AgentReactor(client)
        # Pass build_proposal vicinity data if available (from drag-drop build mode)
        vicinity_data = request.build_proposal if request.build_proposal else None
        # Pass world_state for context-aware reactions
        world_state = request.world_state
        reactions = await reactor.get_all_reactions(proposal, session_id, vicinity_data, world_state)
        logger.info(f"[SIM] Got {len(reactions)} reactions")
        
        # Step 3: Aggregate zone sentiment
        logger.info("[SIM] Step 3: Aggregating zone sentiment...")
        aggregator = SentimentAggregator()
        zones = aggregator.aggregate(reactions)
        logger.info(f"[SIM] Aggregated {len(zones)} zones")
        
        # Step 4: Generate Town Hall transcript
        logger.info("[SIM] Step 4: Generating Town Hall...")
        set_wave_index(2)  # Wave 2 = reducer/townhall
        townhall_gen = TownHallGenerator(client)
        town_hall = await townhall_gen.generate(proposal, reactions, session_id)
        logger.info(f"[SIM] Generated transcript with {len(town_hall.turns)} turns")
        
        # Build assistant message (summary)
        support_count = sum(1 for r in reactions if r.stance == "support")
        oppose_count = sum(1 for r in reactions if r.stance == "oppose")
        neutral_count = len(reactions) - support_count - oppose_count
        
        assistant_message = f"**{proposal.title}**\n\n"
        assistant_message += f"{proposal.summary}\n\n"
        assistant_message += f"**Community Reaction:** {support_count} support, {oppose_count} oppose, {neutral_count} neutral\n\n"
        
        if interpret_result.assumptions:
            assistant_message += f"*Assumptions: {', '.join(interpret_result.assumptions[:2])}*"
        
        # Build receipt
        duration_ms = int((time.time() - start_time) * 1000)
        run_hash = hashlib.md5(
            f"{proposal.title}:{session_id}:{datetime.datetime.utcnow().isoformat()}".encode()
        ).hexdigest()[:12]
        
        # Log summary metrics for this action
        log_action_summary(
            num_agents=len(reactions),
            max_concurrency=len(AGENTS),  # All agents run in parallel
            total_wall_ms=duration_ms,
            action_type="proposal"
        )
        
        return MultiAgentResponse(
            session_id=session_id,
            thread_id=session_id,
            assistant_message=assistant_message,
            proposal=proposal,
            reactions=reactions,
            zones=zones,
            town_hall=town_hall,
            receipt=SimulationReceipt(
                run_hash=run_hash,
                timestamp=datetime.datetime.utcnow().isoformat(),
                agent_count=len(reactions),
                duration_ms=duration_ms,
            ),
        )
        
    except BackboardError as e:
        logger.error(f"[SIM] Backboard error: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(e.body),
        )
    except Exception as e:
        logger.error(f"[SIM] Unexpected error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Simulation failed: {str(e)[:200]}",
        )


# =============================================================================
# Debug Endpoint - Observe Session/Thread State
# =============================================================================

@router.get("/debug/session/{session_id}")
async def debug_session(session_id: str):
    """
    Debug endpoint to inspect session state.
    
    Shows all threads created for a session:
    - interpreter_thread_id
    - reactor_assistant_id + agent_threads (per-agent)
    - townhall_thread_id
    
    Use this to verify thread continuity across requests.
    """
    from app.agents.session_manager import get_session_manager
    return get_session_manager().debug_info(session_id)


@router.get("/debug/sessions")
async def debug_all_sessions():
    """
    List all active sessions in the SessionManager.
    
    Returns list of session_ids that have been created.
    """
    from app.agents.session_manager import get_session_manager
    return {"sessions": get_session_manager().list_sessions()}


# =============================================================================
# Adoption Endpoint - Persist Decisions to Agent Memory
# =============================================================================

class AdoptedQuote(BaseModel):
    agent_name: str
    stance: str
    quote: str

class ZoneDelta(BaseModel):
    zone_id: str
    zone_name: str
    sentiment_shift: float

class VoteSummary(BaseModel):
    support: int
    oppose: int
    neutral: int
    agreement_pct: int

class AdoptedProposalData(BaseModel):
    type: str
    title: str
    summary: str

class AdoptedEventRequest(BaseModel):
    id: str
    timestamp: str
    session_id: str
    proposal: AdoptedProposalData
    outcome: str  # 'adopted' or 'forced'
    vote_summary: VoteSummary
    key_quotes: list[AdoptedQuote]
    zone_deltas: list[ZoneDelta]

class AdoptRequest(BaseModel):
    session_id: str
    adopted_event: AdoptedEventRequest

@router.post("/adopt")
async def adopt_proposal(request: AdoptRequest):
    """
    Persist an adopted/forced decision to all agent threads.
    
    Writes a summary note into each agent's thread with memory='Auto'
    so agents remember prior decisions when asked about policy history.
    """
    from app.agents.session_manager import get_session_manager
    
    # Use get_or_create_session so adoption works even if user hasn't run an AI chat yet
    session = get_session_manager().get_or_create_session(request.session_id)
    logger.info(f"[ADOPT] Session {request.session_id} retrieved/created")
    
    event = request.adopted_event
    
    # Build adoption summary message
    outcome_label = "ADOPTED" if event.outcome == "adopted" else "FORCED FORWARD"
    quotes_text = "\n".join([
        f"- {q.agent_name} ({q.stance}): \"{q.quote[:100]}...\""
        for q in event.key_quotes[:3]
    ])
    
    adoption_note = f"""
[DECISION RECORD - {outcome_label}]
Proposal: {event.proposal.title}
Type: {event.proposal.type}
Summary: {event.proposal.summary}

Vote Result: {event.vote_summary.support} support / {event.vote_summary.oppose} oppose / {event.vote_summary.neutral} neutral ({event.vote_summary.agreement_pct}% agreement)

Key Reactions:
{quotes_text}

This decision has been officially recorded. Remember this when discussing past policies or cumulative impacts.
""".strip()
    
    logger.info(f"[ADOPT] Writing decision to session={request.session_id} threads")
    
    try:
        client = BackboardClient()
        written_threads = []
        
        # Write to all agent threads that exist in this session
        for agent_key, thread_id in session.agent_threads.items():
            try:
                await client.send_message(thread_id, adoption_note)
                written_threads.append(agent_key)
                logger.info(f"[ADOPT] Wrote to {agent_key} thread={thread_id}")
            except Exception as e:
                logger.warning(f"[ADOPT] Failed to write to {agent_key}: {e}")
        
        # Write to interpreter thread if exists
        if session.interpreter_thread_id:
            try:
                await client.send_message(session.interpreter_thread_id, adoption_note)
                written_threads.append("interpreter")
            except Exception as e:
                logger.warning(f"[ADOPT] Failed to write to interpreter: {e}")
        
        # Write to townhall thread if exists
        if session.townhall_thread_id:
            try:
                await client.send_message(session.townhall_thread_id, adoption_note)
                written_threads.append("townhall")
            except Exception as e:
                logger.warning(f"[ADOPT] Failed to write to townhall: {e}")
        
        logger.info(f"[ADOPT] Successfully wrote to {len(written_threads)} threads: {written_threads}")
        
        return {
            "success": True,
            "threads_updated": written_threads,
            "proposal_title": event.proposal.title,
            "outcome": event.outcome,
        }
        
    except BackboardError as e:
        logger.error(f"[ADOPT] Backboard error: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(e.body),
        )


# =============================================================================
# DM Endpoint - Agent-to-Agent Direct Conversations
# =============================================================================

class DMRequest(BaseModel):
    """Request for agent-to-agent direct message."""
    session_id: str = Field(..., description="Session ID")
    from_agent_key: str = Field(..., description="Speaking agent key")
    to_agent_key: str = Field(..., description="Target agent key")
    message: str = Field(..., min_length=1, description="DM content")
    proposal_title: Optional[str] = Field(None, description="Current proposal being discussed")


class StanceUpdate(BaseModel):
    """Agent's stance update after DM."""
    relationship_delta: float = Field(..., ge=-1, le=1, description="Change in relationship [-1, +1]")
    stance_changed: bool = Field(..., description="Whether stance on proposal changed")
    new_stance: Optional[str] = Field(None, description="New stance if changed")
    new_intensity: Optional[float] = Field(None, description="New intensity if changed")
    reason: str = Field(..., description="One-line reason for change")


class DMResponse(BaseModel):
    """Response from DM endpoint."""
    reply: str = Field(..., description="Target agent's reply")
    stance_update: StanceUpdate = Field(..., description="Structured stance update")
    relationship_score: float = Field(..., description="New relationship score")


@router.post("/dm", response_model=DMResponse)
async def send_dm(request: DMRequest):
    """
    Send a direct message from one agent to another.
    
    Flow:
    1. Get or create DM pair thread
    2. Send message in context of speaker agent
    3. Get target agent's reply
    4. Run structured follow-up to extract relationship/stance changes
    5. Update relationship edges
    6. Write summary to main agent threads if stance changed
    """
    from app.agents.session_manager import get_session_manager
    from app.agents.definitions import get_agent
    
    # Use get_or_create to allow DMs even before simulation runs
    session = get_session_manager().get_or_create_session(request.session_id)
    
    from_agent = get_agent(request.from_agent_key)
    to_agent = get_agent(request.to_agent_key)
    
    if not from_agent or not to_agent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid agent key(s)"
        )
    
    try:
        client = BackboardClient()
        
        # Get or create DM pair thread
        dm_key = session.get_dm_thread_key(request.from_agent_key, request.to_agent_key)
        if dm_key not in session.dm_threads:
            if not session.dm_assistant_id:
                session.dm_assistant_id = await client.create_assistant(
                    name="CivicSim DM",
                    system_prompt="You facilitate direct conversations between civic stakeholders. Respond in character."
                )
            thread_id = await client.create_thread(session.dm_assistant_id)
            session.dm_threads[dm_key] = thread_id
            logger.info(f"[DM] Created DM thread={thread_id} for {dm_key}")
        
        dm_thread_id = session.dm_threads[dm_key]
        
        # Get display names
        from_name = from_agent.get('display_name', from_agent.get('name', 'Agent'))
        to_name = to_agent.get('display_name', to_agent.get('name', 'Agent'))
        
        # Build DM prompt with speaker context
        dm_prompt = f"""[DIRECT MESSAGE]
From: {from_name} ({from_agent['role']})
To: {to_name} ({to_agent['role']})

{from_name} says: "{request.message}"

---
You are {to_name}. Respond to this message in character.
Context: {to_agent['persona'][:300]}

Respond naturally as {to_name} would."""

        logger.info(f"[DM] {request.from_agent_key} -> {request.to_agent_key}: {request.message[:50]}...")
        
        # Get target agent's reply
        reply = await client.send_message(dm_thread_id, dm_prompt)
        logger.info(f"[DM] Reply from {request.to_agent_key}: {reply[:100]}...")
        
        # Structured follow-up to extract stance/relationship changes
        proposal_context = f' regarding "{request.proposal_title}"' if request.proposal_title else ""
        
        structured_prompt = f"""Based on the conversation{proposal_context}, provide a brief assessment.

{to_name} just said: "{reply[:200]}"

Respond with ONLY valid JSON:
{{
  "relationship_delta": <float -1 to +1, how much {to_name}'s opinion of {from_name} changed>,
  "stance_changed": <true/false if stance on current proposal changed>,
  "new_stance": <"support"/"oppose"/"neutral" if changed, null otherwise>,
  "new_intensity": <0.0-1.0 if stance changed, null otherwise>,
  "reason": "<one sentence explaining any change>"
}}

Example: {{"relationship_delta": 0.1, "stance_changed": false, "new_stance": null, "new_intensity": null, "reason": "Appreciated the thoughtful points but remains unconvinced."}}

JSON only:"""
        
        import json
        structured_response = await client.send_message(dm_thread_id, structured_prompt)
        
        # Parse structured response
        try:
            # Clean up response (remove markdown code blocks if present)
            clean_response = structured_response.strip()
            if clean_response.startswith("```"):
                clean_response = clean_response.split("```")[1]
                if clean_response.startswith("json"):
                    clean_response = clean_response[4:]
            clean_response = clean_response.strip()
            
            update_data = json.loads(clean_response)
            stance_update = StanceUpdate(
                relationship_delta=float(update_data.get("relationship_delta", 0)),
                stance_changed=bool(update_data.get("stance_changed", False)),
                new_stance=update_data.get("new_stance"),
                new_intensity=float(update_data["new_intensity"]) if update_data.get("new_intensity") is not None else None,
                reason=str(update_data.get("reason", "No significant change."))
            )
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            logger.warning(f"[DM] Failed to parse structured response: {e}")
            stance_update = StanceUpdate(
                relationship_delta=0.0,
                stance_changed=False,
                new_stance=None,
                new_intensity=None,
                reason="Conversation continued without major shifts."
            )
        
        # Update relationship in session
        new_rel_score = session.update_relationship(
            request.to_agent_key, 
            request.from_agent_key, 
            stance_update.relationship_delta,
            stance_update.reason
        )
        
        # If stance changed, write summary to main agent thread
        if stance_update.stance_changed and request.proposal_title:
            main_thread_id = session.agent_threads.get(request.to_agent_key)
            if main_thread_id:
                stance_summary = f"""[STANCE UPDATE]
After talking with {from_name}, I'm now {stance_update.new_stance or 'reconsidering'} the proposal "{request.proposal_title}".
Reason: {stance_update.reason}"""
                
                try:
                    await client.send_message(main_thread_id, stance_summary)
                    logger.info(f"[DM] Wrote stance update to {request.to_agent_key} main thread")
                except Exception as e:
                    logger.warning(f"[DM] Failed to write to main thread: {e}")
        
        return DMResponse(
            reply=reply,
            stance_update=stance_update,
            relationship_score=new_rel_score
        )
        
    except BackboardError as e:
        logger.error(f"[DM] Backboard error: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(e.body),
        )


@router.get("/relationships/{session_id}")
async def get_relationships(session_id: str):
    """Get relationship edges for visualization."""
    from app.agents.session_manager import get_session_manager
    
    session = get_session_manager().get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found"
        )
    
    edges = session.get_top_relationships(n=10)
    return {
        "session_id": session_id,
        "edges": [
            {
                "from": e.from_agent,
                "to": e.to_agent,
                "score": e.score,
                "reason": e.last_reason
            }
            for e in edges
        ]
    }
