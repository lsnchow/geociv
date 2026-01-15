"""Pydantic schemas for LLM layer - parsing, grounding, personas."""

from enum import Enum
from typing import Optional, Union
from pydantic import BaseModel, Field

from app.schemas.proposal import SpatialProposal, CitywideProposal


class ClarificationPriority(int, Enum):
    """Priority levels for clarification questions."""
    
    PROPOSAL_TYPE = 1  # Highest priority - spatial vs citywide
    LOCATION = 2  # Required for spatial proposals
    MAGNITUDE = 3  # Scale/intensity
    FUNDING = 4  # Funding source or tradeoff


class ClarificationQuestion(BaseModel):
    """A question to clarify ambiguous proposal input."""
    
    priority: ClarificationPriority = Field(..., description="Question priority (1=highest)")
    question: str = Field(..., description="The clarifying question to ask")
    field: str = Field(..., description="Which field this question resolves")
    options: Optional[list[str]] = Field(None, description="Suggested options if applicable")
    default_if_skipped: Optional[str] = Field(
        None, description="Default value to use if user skips"
    )


class Assumption(BaseModel):
    """An assumption made during proposal parsing."""
    
    field: str = Field(..., description="Field that was assumed")
    value: str = Field(..., description="Value that was assumed")
    reason: str = Field(..., description="Why this assumption was made")


class ParsedProposalResult(BaseModel):
    """Result of parsing natural language into a structured proposal."""
    
    success: bool = Field(..., description="Whether parsing succeeded")
    proposal: Optional[Union[SpatialProposal, CitywideProposal]] = Field(
        None, description="The structured proposal if successful"
    )
    confidence: float = Field(
        default=0.0, ge=0.0, le=1.0, description="Confidence in the parsing (0-1)"
    )
    assumptions: list[Assumption] = Field(
        default_factory=list, description="Assumptions made during parsing"
    )
    clarification_needed: Optional[list[ClarificationQuestion]] = Field(
        None, description="Questions to ask if clarification needed (max 2)"
    )
    raw_interpretation: Optional[str] = Field(
        None, description="How the system interpreted the input"
    )


class CitedMetric(BaseModel):
    """A metric cited in a grounded narrative."""
    
    metric_key: str = Field(..., description="Key of the metric from engine output")
    metric_name: str = Field(..., description="Human-readable name")
    delta: float = Field(..., description="The actual delta from engine")
    direction: str = Field(..., description="positive, negative, or neutral")
    citation_text: str = Field(..., description="How this metric is mentioned in narrative")


class GroundedNarrative(BaseModel):
    """A narrative that is strictly grounded in engine outputs."""
    
    summary: str = Field(..., description="2-3 sentence summary grounded in results")
    cited_metrics: list[CitedMetric] = Field(
        ..., min_length=2, description="At least 2 metrics must be cited"
    )
    archetype_quotes: dict[str, str] = Field(
        default_factory=dict, description="Quotes from archetypes based on their scores"
    )
    compromise_suggestion: Optional[str] = Field(
        None, description="Suggested compromise if approval < 50"
    )
    grounding_validation: bool = Field(
        default=True, description="Whether narrative passed grounding checks"
    )


class RoleplayReaction(BaseModel):
    """A persona-based roleplay reaction."""
    
    persona_key: str = Field(..., description="Key of the persona used")
    persona_name: str = Field(..., description="Display name of persona")
    voice_seed: int = Field(..., description="Deterministic seed for voice consistency")
    reaction: str = Field(..., description="The roleplay reaction text")
    priority_metrics_cited: list[str] = Field(
        ..., description="Which of the persona's priority metrics were cited"
    )
    tone_applied: str = Field(..., description="The tone style used")


class DeterministicBreakdown(BaseModel):
    """The factual, deterministic part of a response."""
    
    overall_approval: float = Field(..., description="Overall approval score")
    overall_sentiment: str = Field(..., description="Sentiment label")
    top_drivers: list[dict] = Field(..., description="Top metric drivers")
    metric_deltas: dict[str, float] = Field(..., description="Raw metric deltas")
    assumptions_used: list[str] = Field(
        default_factory=list, description="Assumptions that were applied"
    )
    confidence: float = Field(default=1.0, description="Confidence in interpretation")


class ShowMyWork(BaseModel):
    """Full transparency debug bundle."""
    
    structured_proposal: dict = Field(..., description="The proposal JSON used")
    raw_metric_contributions: dict[str, dict[str, float]] = Field(
        ..., description="Per-archetype metric contributions"
    )
    exposure_values: dict[str, float] = Field(..., description="Exposure by cluster")
    utility_scores: dict[str, float] = Field(..., description="Raw utility before transform")
    assumptions_applied: list[Assumption] = Field(
        default_factory=list, description="All assumptions made"
    )
    clarifications_asked: list[str] = Field(
        default_factory=list, description="Questions that were asked"
    )
    clarifications_answered: dict[str, str] = Field(
        default_factory=dict, description="User's answers to clarifications"
    )


class PersonaResponse(BaseModel):
    """Complete response with roleplay reaction and deterministic breakdown."""
    
    roleplay_reaction: Optional[RoleplayReaction] = Field(
        None, description="Persona-voiced reaction (if persona specified)"
    )
    deterministic_breakdown: DeterministicBreakdown = Field(
        ..., description="Factual breakdown from engine"
    )
    grounded_narrative: Optional[GroundedNarrative] = Field(
        None, description="Grounded narrative summary"
    )
    show_my_work: Optional[ShowMyWork] = Field(
        None, description="Full debug transparency (if requested)"
    )


class ConversationState(BaseModel):
    """State of an ongoing conversation for multi-turn clarification."""
    
    thread_id: str = Field(..., description="Conversation thread ID")
    pending_proposal: Optional[dict] = Field(
        None, description="Partially parsed proposal awaiting clarification"
    )
    asked_questions: list[str] = Field(
        default_factory=list, description="Questions already asked"
    )
    received_answers: dict[str, str] = Field(
        default_factory=dict, description="Answers received"
    )
    assumptions_confirmed: list[str] = Field(
        default_factory=list, description="Assumptions user confirmed"
    )
    turn_count: int = Field(default=0, description="Number of conversation turns")


class EnhancedChatRequest(BaseModel):
    """Enhanced chat request with persona and debug options."""
    
    content: str = Field(..., max_length=2000, description="User message")
    user_id: str = Field(default="default", description="User identifier")
    scenario_id: Optional[str] = Field(None, description="Scenario to simulate")
    persona: Optional[str] = Field(
        None, description="Persona key for roleplay (e.g., 'conservative_homeowner')"
    )
    auto_simulate: bool = Field(default=True, description="Auto-run simulation")
    show_my_work: bool = Field(default=False, description="Include full debug info")
    conversation_state: Optional[ConversationState] = Field(
        None, description="Existing conversation state for multi-turn"
    )


class EnhancedChatResponse(BaseModel):
    """Enhanced chat response with two-section format."""
    
    message: str = Field(..., description="Main response message")
    response: Optional[PersonaResponse] = Field(
        None, description="Full structured response with roleplay + breakdown"
    )
    clarification_needed: Optional[list[ClarificationQuestion]] = Field(
        None, description="Questions to ask (max 2)"
    )
    conversation_state: Optional[ConversationState] = Field(
        None, description="Updated conversation state"
    )
    proposal_parsed: bool = Field(default=False)
    proposal: Optional[dict] = Field(None, description="Parsed proposal if any")

