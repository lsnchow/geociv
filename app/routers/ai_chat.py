"""Multi-agent civic simulation endpoint."""

import asyncio
import datetime
import hashlib
import time
import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, status, BackgroundTasks
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
from app.services.simulation_job import (
    get_job_store,
    SimulationProgress,
    SimulationPhase,
    PHASE_MESSAGES,
)

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
# Progressive Simulation Endpoints - Real-time progress with polling
# =============================================================================

class SimulationStartResponse(BaseModel):
    """Response from starting a simulation job."""
    job_id: str
    status: str = "pending"
    message: str = "Simulation queued"


class SimulationStatusResponse(BaseModel):
    """Response from polling simulation status."""
    job_id: str
    status: str  # pending | running | complete | error
    progress: float  # 0-100
    phase: str
    message: str
    completed_agents: int = 0
    total_agents: int = 0
    partial_reactions: Optional[list] = None
    partial_zones: Optional[list] = None
    result: Optional[dict] = None
    error: Optional[str] = None


@router.post("/simulate", response_model=SimulationStartResponse)
async def start_simulation(request: AIChatRequest, background_tasks: BackgroundTasks):
    """
    Start a progressive simulation job.
    
    Returns immediately with job_id. Poll /simulate/{job_id} for progress.
    
    This enables:
    - Real-time progress updates (0-100%)
    - Phase-by-phase visibility
    - Partial results as agents complete
    - Professional "policy lab" UX instead of spinner
    """
    # Validate non-empty message
    if not request.message.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message cannot be empty"
        )
    
    # Session ID for continuity
    session_id = request.session_id or request.thread_id or f"scenario_{request.scenario_id}"
    
    # Create job in store
    store = await get_job_store()
    job = await store.create_job(
        session_id=session_id,
        request_payload=request.model_dump()
    )
    
    # Track the latest job for this session
    from app.agents.session_manager import get_session_manager
    session = get_session_manager().get_or_create_session(session_id)
    session.last_job_id = job.job_id
    
    # Start simulation in background
    background_tasks.add_task(
        run_progressive_simulation,
        job.job_id,
        request,
        session_id
    )
    
    return SimulationStartResponse(
        job_id=job.job_id,
        status="pending",
        message="Simulation starting..."
    )


@router.get("/simulate/{job_id}", response_model=SimulationStatusResponse)
async def get_simulation_status(job_id: str):
    """
    Poll simulation job status and progress.
    
    Returns:
    - status: pending | running | complete | error
    - progress: 0-100 (percentage complete)
    - phase: current execution phase
    - message: human-readable status message
    - partial_reactions: agents completed so far (for real-time map updates)
    - partial_zones: zone sentiments computed so far
    - result: full simulation result (when status=complete)
    - error: error message (when status=error)
    
    Poll every 1-2 seconds until status is 'complete' or 'error'.
    """
    store = await get_job_store()
    job = await store.get_job(job_id)
    
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Simulation job {job_id} not found"
        )
    
    return SimulationStatusResponse(**job.get_status_response())


async def run_progressive_simulation(
    job_id: str,
    request: AIChatRequest,
    session_id: str
):
    """
    Execute simulation with progress updates.
    
    This runs in background and updates job status in Redis.
    Frontend polls for updates.
    """
    store = await get_job_store()
    job = await store.get_job(job_id)
    
    if not job:
        logger.error(f"[SIM-JOB] Job {job_id} not found")
        return
    
    progress = SimulationProgress(job, store)
    start_time = time.time()
    
    # Reset metrics for this action
    reset_metrics()
    
    try:
        await progress.start(total_agents=len(AGENTS))
        
        # Create an edge from user to townhall for this simulation request
        from app.agents.session_manager import get_session_manager
        session = get_session_manager().get_or_create_session(session_id)
        session.update_relationship(
            from_agent="user",
            to_agent="townhall",
            delta=0.0,
            reason="Initiated simulation",
            message=f"Proposal: {request.message[:80]}...",
        )
        
        client = BackboardClient()
        
        # Prepare message with speaker context
        effective_message = request.message
        if request.speaker_mode == "agent" and request.speaker_agent_key:
            from app.agents.definitions import get_agent
            agent = get_agent(request.speaker_agent_key)
            if agent:
                agent_name = agent.get('display_name', agent.get('name', 'Agent'))
                effective_message = f"[{agent_name} ({agent['role']}) proposes]: {request.message}"
        
        # =================================================================
        # Phase 1: Interpreting (10%)
        # =================================================================
        await progress.set_phase(
            SimulationPhase.INTERPRETING,
            PHASE_MESSAGES[SimulationPhase.INTERPRETING]
        )
        set_wave_index(0)
        
        interpreter = ProposalInterpreter(client)
        interpret_result = await interpreter.interpret(effective_message, session_id)
        
        if not interpret_result.ok or not interpret_result.proposal:
            # Interpretation failed
            error_msg = "Could not interpret proposal"
            if interpret_result.clarifying_questions:
                error_msg = "Clarification needed: " + " ".join(interpret_result.clarifying_questions)
            await progress.fail(error_msg)
            return
        
        proposal = interpret_result.proposal
        logger.info(f"[SIM-JOB {job_id[:8]}] Interpreted: {proposal.title}")
        
        # =================================================================
        # Phase 2: Analyzing Impact (10%)
        # =================================================================
        await progress.set_phase(
            SimulationPhase.ANALYZING_IMPACT,
            f"Analyzing impact of: {proposal.title}"
        )
        
        # Prepare context for agents
        vicinity_data = request.build_proposal if request.build_proposal else None
        world_state = request.world_state
        
        # =================================================================
        # Phase 3: Agent Reactions (50%) - with per-agent progress
        # =================================================================
        await progress.set_phase(
            SimulationPhase.AGENT_REACTIONS,
            PHASE_MESSAGES[SimulationPhase.AGENT_REACTIONS]
        )
        set_wave_index(1)
        
        reactor = AgentReactor(client)
        aggregator = SentimentAggregator()
        
        # Get reactions with progress updates (modified to report per-agent)
        reactions = await reactor.get_all_reactions_with_progress(
            proposal=proposal,
            session_id=session_id,
            vicinity_data=vicinity_data,
            world_state=world_state,
            progress_callback=progress.agent_completed,
            aggregator=aggregator,
        )
        
        logger.info(f"[SIM-JOB {job_id[:8]}] Got {len(reactions)} reactions")
        
        # =================================================================
        # Phase 4: Coalition Synthesis (10%)
        # =================================================================
        await progress.set_phase(
            SimulationPhase.COALITION_SYNTHESIS,
            PHASE_MESSAGES[SimulationPhase.COALITION_SYNTHESIS]
        )
        
        # Final aggregation
        zones = aggregator.aggregate(reactions)
        
        # Identify coalitions
        support_count = sum(1 for r in reactions if r.stance == "support")
        oppose_count = sum(1 for r in reactions if r.stance == "oppose")
        
        # =================================================================
        # Phase 5: Town Hall Generation (10%)
        # =================================================================
        await progress.set_phase(
            SimulationPhase.GENERATING_TOWNHALL,
            PHASE_MESSAGES[SimulationPhase.GENERATING_TOWNHALL]
        )
        set_wave_index(2)
        
        townhall_gen = TownHallGenerator(client)
        town_hall = await townhall_gen.generate(proposal, reactions, session_id)
        
        logger.info(f"[SIM-JOB {job_id[:8]}] Generated town hall with {len(town_hall.turns)} turns")
        
        # =================================================================
        # Phase 6: Finalizing (5%)
        # =================================================================
        await progress.set_phase(
            SimulationPhase.FINALIZING,
            PHASE_MESSAGES[SimulationPhase.FINALIZING]
        )
        
        # Build final result
        duration_ms = int((time.time() - start_time) * 1000)
        run_hash = hashlib.md5(
            f"{proposal.title}:{session_id}:{datetime.datetime.utcnow().isoformat()}".encode()
        ).hexdigest()[:12]
        
        neutral_count = len(reactions) - support_count - oppose_count
        
        assistant_message = f"**{proposal.title}**\n\n"
        assistant_message += f"{proposal.summary}\n\n"
        assistant_message += f"**Community Reaction:** {support_count} support, {oppose_count} oppose, {neutral_count} neutral\n\n"
        
        if interpret_result.assumptions:
            assistant_message += f"*Assumptions: {', '.join(interpret_result.assumptions[:2])}*"
        
        # Log metrics
        log_action_summary(
            num_agents=len(reactions),
            max_concurrency=len(AGENTS),
            total_wall_ms=duration_ms,
            action_type="progressive_simulation"
        )
        
        # Build final response
        result = MultiAgentResponse(
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
        
        # Mark complete with full result
        await progress.complete(result.model_dump())
        
    except BackboardError as e:
        logger.error(f"[SIM-JOB {job_id[:8]}] Backboard error: {e}")
        await progress.fail(f"LLM service error: {str(e.body)[:100]}")
    except Exception as e:
        logger.error(f"[SIM-JOB {job_id[:8]}] Unexpected error: {e}")
        await progress.fail(f"Simulation failed: {str(e)[:100]}")


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


# =============================================================================
# Graph Data Endpoints - For Force-Directed Node Graph
# =============================================================================

class GraphNodeResponse(BaseModel):
    """Node in the agent graph."""
    id: str
    type: str  # agent | townhall | user | system
    name: str
    avatar: str
    role: str = ""
    model: Optional[str] = None
    archetype_status: str = "default"  # default | edited
    call_state: str = "idle"  # idle | pending | running | done | error
    stance: Optional[str] = None  # support | oppose | neutral


class GraphEdgeResponse(BaseModel):
    """Edge in the agent graph."""
    id: str
    source: str
    target: str
    type: str  # dm | call
    last_message: Optional[str] = None
    stance_before: Optional[str] = None
    stance_after: Optional[str] = None
    timestamp: Optional[str] = None
    status: str = "complete"  # pending | running | complete | error
    score: float = 0.0


class GraphDataResponse(BaseModel):
    """Full graph data for visualization."""
    session_id: str
    nodes: list[GraphNodeResponse]
    edges: list[GraphEdgeResponse]


class ActiveCallResponse(BaseModel):
    """Active call status."""
    agent_key: str
    status: str  # pending | running | done | error
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class ActiveCallsResponse(BaseModel):
    """Response for active calls polling."""
    session_id: str
    active_calls: list[ActiveCallResponse]
    recently_completed: list[ActiveCallResponse]


@router.get("/graph-data/{session_id}", response_model=GraphDataResponse)
async def get_graph_data(session_id: str):
    """
    Get full graph data for force-directed visualization.
    
    Returns all nodes (agents, townhall, user, system) and edges (DMs, calls).
    """
    from app.agents.session_manager import get_session_manager
    from app.agents.definitions import AGENTS, get_agent
    from app.config import DEFAULT_MODEL

    session = get_session_manager().get_or_create_session(session_id)

    # Build nodes from agent definitions
    nodes: list[GraphNodeResponse] = []
    
    # Add agent nodes
    for agent in AGENTS:
        agent_key = agent["key"]
        
        # Check if agent has a thread (has been used)
        has_thread = agent_key in (session.agent_threads if session else {})
        
        nodes.append(GraphNodeResponse(
            id=agent_key,
            type="agent",
            name=agent.get("display_name", agent.get("name", "Agent")),
            avatar=agent.get("avatar", "👤"),
            role=agent.get("role", ""),
            model=None,  # Will be populated from DB if needed
            archetype_status="default",
            call_state="idle",
            stance=None,
        ))
    
    # Add special nodes
    nodes.append(GraphNodeResponse(
        id="townhall",
        type="townhall",
        name="Town Hall",
        avatar="🏛️",
        role="Civic Debate Forum",
        call_state="idle",
    ))
    
    nodes.append(GraphNodeResponse(
        id="user",
        type="user",
        name="User",
        avatar="👤",
        role="Policy Proposer",
        call_state="idle",
    ))
    
    nodes.append(GraphNodeResponse(
        id="system",
        type="system",
        name="Backboard",
        avatar="🤖",
        role="LLM Gateway",
        call_state="idle",
    ))
    
    # Build edges from relationships
    edges: list[GraphEdgeResponse] = []
    
    if session:
        edge_idx = 0
        for edge in session.get_all_edges():
            edges.append(GraphEdgeResponse(
                id=f"edge_{edge_idx}",
                source=edge.from_agent,
                target=edge.to_agent,
                type="dm",
                last_message=edge.last_message[:120] if edge.last_message else None,
                stance_before=edge.stance_before,
                stance_after=edge.stance_after,
                timestamp=edge.timestamp,
                status="complete",
                score=edge.score,
            ))
            edge_idx += 1
    
    return GraphDataResponse(
        session_id=session_id,
        nodes=nodes,
        edges=edges,
    )


@router.get("/active-calls/{session_id}", response_model=ActiveCallsResponse)
async def get_active_calls(session_id: str):
    """
    Get active and recently completed calls for polling.
    
    Returns:
    - active_calls: Currently running agent calls
    - recently_completed: Agents that finished within last 5 seconds (for green fade effect)
    """
    import datetime
    
    # Get current job status from job store
    store = await get_job_store()
    from app.agents.session_manager import get_session_manager
    from app.services.simulation_job import SimulationPhase
    from app.agents.definitions import AGENTS
    
    active_calls: list[ActiveCallResponse] = []
    recently_completed: list[ActiveCallResponse] = []
    
    session = get_session_manager().get_session(session_id)
    job = await store.get_job(session.last_job_id) if session and session.last_job_id else None
    
    # Compute active and recently completed calls
    if job:
        now = time.time()
        completed_keys = set()
        for r in job.partial_reactions or []:
            key = r.get("agent_key")
            if key:
                completed_keys.add(key)
                completed_at = r.get("completed_at")
                if completed_at and (now - completed_at) <= 5:
                    recently_completed.append(ActiveCallResponse(
                        agent_key=key,
                        status="done",
                        completed_at=datetime.datetime.utcfromtimestamp(completed_at).isoformat(),
                    ))
        
        # If in agent reactions phase, mark incomplete agents as active
        if job.status == "running" and job.phase == SimulationPhase.AGENT_REACTIONS.value:
            for agent in AGENTS:
                key = agent["key"]
                if key not in completed_keys:
                    active_calls.append(ActiveCallResponse(
                        agent_key=key,
                        status="running",
                        started_at=datetime.datetime.utcfromtimestamp(job.started_at or now).isoformat(),
                    ))
        
        # If generating town hall, mark townhall active
        if job.status == "running" and job.phase == SimulationPhase.GENERATING_TOWNHALL.value:
            active_calls.append(ActiveCallResponse(
                agent_key="townhall",
                status="running",
                started_at=datetime.datetime.utcfromtimestamp(job.started_at or now).isoformat(),
            ))
        
        # After completion, mark townhall as recently completed for a short window
        if job.status == "complete" and job.completed_at and (now - job.completed_at) <= 5:
            recently_completed.append(ActiveCallResponse(
                agent_key="townhall",
                status="done",
                completed_at=datetime.datetime.utcfromtimestamp(job.completed_at).isoformat(),
            ))
    
    # #region agent log
    return ActiveCallsResponse(
        session_id=session_id,
        active_calls=active_calls,
        recently_completed=recently_completed,
    )
