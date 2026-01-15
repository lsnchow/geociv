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
    # Legacy fields (still accepted)
    persona: Optional[str] = None
    auto_simulate: Optional[bool] = True


# =============================================================================
# Simple Chat Mode (for "Hello" type messages)
# =============================================================================

SIMPLE_SYSTEM_PROMPT = """You are CivicSim, a friendly AI assistant for exploring civic proposals in Kingston, Ontario.

If the user greets you or asks a general question, respond conversationally.
If the user describes a proposal (building something, changing a policy, etc.), acknowledge it and let them know you'll simulate community reactions.

Kingston zones: University District, North End, West Kingston, Downtown Core.
Stakeholders: homeowners, students, business owners, housing advocates, developers, city planners.

Be friendly, concise, and helpful."""


async def _simple_chat(client: BackboardClient, message: str, session_id: str) -> str:
    """Simple chat for greetings and general questions."""
    assistant_id = await client.create_assistant("CivicSim Chat", SIMPLE_SYSTEM_PROMPT)
    thread_id = await client.create_thread(assistant_id)
    response = await client.send_message(thread_id, message)
    return response


def _is_proposal_message(message: str) -> bool:
    """Check if message looks like a proposal vs a greeting."""
    msg_lower = message.lower().strip()
    
    # Greeting patterns
    greetings = ["hello", "hi", "hey", "good morning", "good afternoon", "good evening", 
                 "what can you do", "help", "how does this work", "who are you"]
    
    for greeting in greetings:
        if msg_lower.startswith(greeting) or msg_lower == greeting:
            return False
    
    # Proposal indicators
    proposal_words = ["build", "create", "add", "remove", "increase", "decrease", "double",
                      "tax", "subsidy", "park", "housing", "transit", "bike", "lane",
                      "zoning", "policy", "what if", "propose", "should we", "let's"]
    
    for word in proposal_words:
        if word in msg_lower:
            return True
    
    # Default: treat longer messages as proposals
    return len(message.split()) > 5


# =============================================================================
# Full Simulation Endpoint
# =============================================================================

@router.post("/chat", response_model=MultiAgentResponse)
async def ai_chat(request: AIChatRequest):
    """
    Multi-agent civic simulation endpoint.
    
    Flow:
    1. Interpret user message into structured proposal
    2. Get reactions from 6 agents (parallel)
    3. Aggregate zone sentiment
    4. Generate Town Hall transcript
    
    Returns full simulation response with reactions, zones, and transcript.
    On Backboard failure, returns 502 with error details.
    """
    start_time = time.time()
    
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
        
        # Check if this is a simple greeting vs a proposal
        if not _is_proposal_message(request.message):
            # Simple chat mode
            response_text = await _simple_chat(client, request.message, session_id)
            
            run_hash = hashlib.md5(
                f"{request.message}:{session_id}:{datetime.datetime.utcnow().isoformat()}".encode()
            ).hexdigest()[:12]
            
            return MultiAgentResponse(
                session_id=session_id,
                thread_id=session_id,
                assistant_message=response_text,
                receipt=SimulationReceipt(
                    run_hash=run_hash,
                    timestamp=datetime.datetime.utcnow().isoformat(),
                    agent_count=0,
                    duration_ms=int((time.time() - start_time) * 1000),
                ),
            )
        
        # =================================================================
        # FULL SIMULATION MODE
        # =================================================================
        
        logger.info(f"[SIM] Starting simulation for: {request.message[:50]}...")
        
        # Step 1: Interpret proposal
        logger.info("[SIM] Step 1: Interpreting proposal...")
        interpreter = ProposalInterpreter(client)
        interpret_result = await interpreter.interpret(request.message, session_id)
        
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
        reactor = AgentReactor(client)
        reactions = await reactor.get_all_reactions(proposal, session_id)
        logger.info(f"[SIM] Got {len(reactions)} reactions")
        
        # Step 3: Aggregate zone sentiment
        logger.info("[SIM] Step 3: Aggregating zone sentiment...")
        aggregator = SentimentAggregator()
        zones = aggregator.aggregate(reactions)
        logger.info(f"[SIM] Aggregated {len(zones)} zones")
        
        # Step 4: Generate Town Hall transcript
        logger.info("[SIM] Step 4: Generating Town Hall...")
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
