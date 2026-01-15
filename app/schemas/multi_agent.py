"""Schemas for multi-agent simulation responses."""

from typing import Optional, Literal
from pydantic import BaseModel, Field


# =============================================================================
# Proposal Interpretation (LLM Call #1)
# =============================================================================

class ProposalLocation(BaseModel):
    """Location specification for a proposal."""
    kind: Literal["none", "zone", "point", "polygon"] = "none"
    zone_ids: list[str] = Field(default_factory=list)
    point: Optional[dict] = None  # {"lat": float, "lng": float}
    polygon: Optional[dict] = None  # GeoJSON polygon


class ProposalParameters(BaseModel):
    """Parameters for a proposal."""
    scale: float = 1.0
    budget_millions: Optional[float] = None
    target_group: Optional[str] = None


class InterpretedProposal(BaseModel):
    """Structured interpretation of user's proposal."""
    type: Literal["build", "policy"]
    title: str
    summary: str
    location: ProposalLocation = Field(default_factory=ProposalLocation)
    parameters: ProposalParameters = Field(default_factory=ProposalParameters)


class InterpretResult(BaseModel):
    """Result of proposal interpretation."""
    ok: bool = True
    proposal: Optional[InterpretedProposal] = None
    assumptions: list[str] = Field(default_factory=list)
    clarifying_questions: list[str] = Field(default_factory=list)
    confidence: float = 0.8
    error: Optional[str] = None


# =============================================================================
# Agent Reaction (LLM Call per agent)
# =============================================================================

class ZoneEffect(BaseModel):
    """Agent's perception of effect on a zone."""
    zone_id: str
    effect: Literal["support", "oppose", "neutral"] = "neutral"
    intensity: float = Field(ge=0.0, le=1.0, default=0.5)


class AgentReaction(BaseModel):
    """Single agent's reaction to a proposal.
    
    Note: agent_key == region_id (canonical rule).
    """
    agent_key: str  # == region_id
    agent_name: str  # display_name
    avatar: str = ""
    role: str = ""  # e.g., "North End Parent"
    bio: str = ""   # UI-only identity field
    tags: list[str] = Field(default_factory=list)  # e.g., ["families", "safety"]
    stance: Literal["support", "oppose", "neutral"] = "neutral"
    intensity: float = Field(ge=0.0, le=1.0, default=0.5)
    support_reasons: list[str] = Field(default_factory=list, max_length=3)
    concerns: list[str] = Field(default_factory=list, max_length=3)
    quote: str = Field(default="", max_length=150)  # ~25 words
    what_would_change_my_mind: list[str] = Field(default_factory=list, max_length=3)
    zones_most_affected: list[ZoneEffect] = Field(default_factory=list)
    proposed_amendments: list[str] = Field(default_factory=list, max_length=3)


# =============================================================================
# Zone Sentiment (Computed server-side)
# =============================================================================

class QuoteAttribution(BaseModel):
    """A quote with its source agent."""
    agent_name: str
    quote: str


class ZoneSentiment(BaseModel):
    """Aggregated sentiment for a zone."""
    zone_id: str
    zone_name: str
    sentiment: Literal["support", "oppose", "neutral"] = "neutral"
    score: float = Field(ge=-1.0, le=1.0, default=0.0)  # -1 oppose, +1 support
    top_support_quotes: list[QuoteAttribution] = Field(default_factory=list)
    top_oppose_quotes: list[QuoteAttribution] = Field(default_factory=list)


# =============================================================================
# Town Hall Transcript (LLM Call #final)
# =============================================================================

class TranscriptTurn(BaseModel):
    """Single turn in town hall debate."""
    speaker: str
    text: str = Field(max_length=250)  # ~40 words


class TownHallTranscript(BaseModel):
    """Moderated town hall debate transcript."""
    moderator_summary: str
    turns: list[TranscriptTurn] = Field(default_factory=list)
    compromise_options: list[str] = Field(default_factory=list, max_length=3)


# =============================================================================
# Full Response (locked API contract)
# =============================================================================

class SimulationReceipt(BaseModel):
    """Metadata about the simulation run."""
    provider: str = "backboard"
    memory: str = "Auto"
    model_name: str = "gpt-4"
    agent_count: int = 0
    duration_ms: int = 0
    run_hash: str = ""
    timestamp: str = ""


class MultiAgentResponse(BaseModel):
    """Full response from /v1/ai/chat with multi-agent simulation."""
    session_id: str
    thread_id: str
    assistant_message: str
    proposal: Optional[InterpretedProposal] = None
    reactions: list[AgentReaction] = Field(default_factory=list)
    zones: list[ZoneSentiment] = Field(default_factory=list)
    town_hall: Optional[TownHallTranscript] = None
    receipt: SimulationReceipt = Field(default_factory=SimulationReceipt)
    error: Optional[str] = None

