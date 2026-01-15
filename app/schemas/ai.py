"""AI-Max schemas for variant generation, objective seeking, and town hall."""

from typing import Optional, Union, Literal
from uuid import UUID
from pydantic import BaseModel, Field

from app.schemas.proposal import SpatialProposal, CitywideProposal


# Type alias for proposals
Proposal = Union[SpatialProposal, CitywideProposal]


# =============================================================================
# Variant Generation
# =============================================================================

class RankedVariant(BaseModel):
    """A proposal variant with simulation results and ranking info."""
    id: str
    variant_type: Literal["alternate", "compromise", "spicy", "base"]
    name: str
    description: str
    proposal: Proposal
    
    # Simulation results
    overall_approval: float
    overall_sentiment: str
    metric_deltas: dict[str, float]
    
    # Ranking scores (normalized 0-100)
    support_score: float = Field(description="Overall approval normalized")
    equity_score: float = Field(description="Score on equity metric")
    environment_score: float = Field(description="Score on environmental_quality")
    feasibility_score: float = Field(description="100 - max_opposition (political feasibility)")
    
    # What changed from base
    changes_from_base: list[str] = Field(default_factory=list)


class VariantBundle(BaseModel):
    """Complete bundle of variants generated from a base proposal."""
    base: RankedVariant
    alternates: list[RankedVariant] = Field(description="3 alternate approaches")
    compromises: list[RankedVariant] = Field(description="3 compromise packages")
    spicy: RankedVariant = Field(description="1 extreme/bold variant")
    
    # Rankings by different criteria
    rankings: dict[str, list[str]] = Field(
        description="criterion -> ordered variant_ids",
        default_factory=dict
    )
    
    # AI explanation
    analysis_summary: str = ""
    recommended_variant_id: Optional[str] = None
    recommendation_reason: str = ""


class GenerateVariantsRequest(BaseModel):
    """Request to generate variants for a proposal."""
    scenario_id: UUID
    proposal: Proposal
    ranking_priorities: list[str] = Field(
        default=["support", "equity", "environment", "feasibility"],
        description="Priority order for ranking"
    )
    include_spicy: bool = True


class GenerateVariantsResponse(BaseModel):
    """Response with generated variants."""
    success: bool
    bundle: Optional[VariantBundle] = None
    error: Optional[str] = None
    generation_time_ms: int = 0


# =============================================================================
# Objective Seeking
# =============================================================================

class Constraint(BaseModel):
    """A single constraint for objective seeking."""
    metric: str = Field(description="Metric key or 'approval'")
    operator: Literal[">", ">=", "<", "<=", "=="] = ">"
    value: float
    
    def evaluate(self, actual: float) -> bool:
        """Check if constraint is satisfied."""
        if self.operator == ">":
            return actual > self.value
        elif self.operator == ">=":
            return actual >= self.value
        elif self.operator == "<":
            return actual < self.value
        elif self.operator == "<=":
            return actual <= self.value
        else:
            return abs(actual - self.value) < 0.01


class ObjectiveGoal(BaseModel):
    """Goal specification for objective seeking."""
    constraints: list[Constraint] = Field(default_factory=list)
    priorities: list[str] = Field(
        default=["approval"],
        description="Metrics to maximize in priority order"
    )
    description: str = Field(default="", description="Natural language goal")


class SeekIteration(BaseModel):
    """Record of one iteration in objective seeking."""
    iteration: int
    proposal: Proposal
    approval: float
    constraints_met: int
    constraints_total: int
    change_made: str


class SeekResult(BaseModel):
    """Result of objective seeking."""
    success: bool
    goal_achieved: bool
    best_proposal: Proposal
    best_approval: float
    constraints_met: int
    constraints_total: int
    iterations_used: int
    iteration_history: list[SeekIteration] = Field(default_factory=list)
    explanation: str = ""
    suggestions_if_failed: list[str] = Field(default_factory=list)


class SeekObjectiveRequest(BaseModel):
    """Request to seek an objective."""
    scenario_id: UUID
    starting_proposal: Proposal
    goal: ObjectiveGoal
    max_iterations: int = Field(default=15, ge=1, le=50)


class SeekObjectiveResponse(BaseModel):
    """Response from objective seeking."""
    success: bool
    result: Optional[SeekResult] = None
    error: Optional[str] = None


# =============================================================================
# Town Hall
# =============================================================================

class Speaker(BaseModel):
    """A speaker in the town hall."""
    id: str
    archetype_key: str
    name: str
    role: str = Field(description="e.g., 'Long-time resident', 'Business owner'")
    stance: Literal["support", "oppose", "mixed"]
    approval_score: float
    avatar_emoji: str = "👤"


class Exchange(BaseModel):
    """A single exchange in the town hall transcript."""
    speaker_id: str
    type: Literal["statement", "question", "rebuttal", "interruption", "agreement"]
    content: str
    cited_metrics: list[str] = Field(default_factory=list)
    emotion: str = "neutral"


class TownHallTranscript(BaseModel):
    """Complete town hall transcript."""
    speakers: list[Speaker]
    exchanges: list[Exchange]
    summary: str
    key_tensions: list[str] = Field(default_factory=list)
    consensus_points: list[str] = Field(default_factory=list)
    vote_prediction: str = ""


class GenerateTownHallRequest(BaseModel):
    """Request to generate a town hall."""
    scenario_id: UUID
    proposal: Proposal
    num_speakers: int = Field(default=5, ge=3, le=8)
    include_dramatic_elements: bool = True
    focus_archetype: Optional[str] = None


class GenerateTownHallResponse(BaseModel):
    """Response with town hall transcript."""
    success: bool
    transcript: Optional[TownHallTranscript] = None
    error: Optional[str] = None


class CrossExamineRequest(BaseModel):
    """Request to cross-examine a speaker."""
    scenario_id: UUID
    proposal: Proposal
    speaker_archetype: str
    question: str


class CrossExamineResponse(BaseModel):
    """Response from cross-examination."""
    speaker_name: str
    response: str
    stance_changed: bool = False
    new_stance: Optional[str] = None


class FlipSpeakerRequest(BaseModel):
    """Request to find how to flip a speaker."""
    scenario_id: UUID
    proposal: Proposal
    speaker_archetype: str


class FlipSpeakerResponse(BaseModel):
    """Response with suggestions to flip a speaker."""
    speaker_name: str
    current_stance: str
    current_score: float
    suggestions: list[str]
    modified_proposal: Optional[Proposal] = None
    projected_new_score: Optional[float] = None


# =============================================================================
# History Intelligence
# =============================================================================

class HistoryInsight(BaseModel):
    """An insight derived from simulation history."""
    id: str
    pattern_type: Literal[
        "lever_effect",      # "Increasing scale always helps X"
        "archetype_trend",   # "Homeowners consistently oppose Y"
        "metric_correlation", # "Affordability and approval are correlated"
        "best_practice",     # "Most successful proposals include Z"
        "warning"            # "This combination never works"
    ]
    title: str
    description: str
    confidence: float = Field(ge=0.0, le=1.0)
    evidence_count: int
    evidence_ids: list[str] = Field(default_factory=list)
    actionable_advice: str = ""


class HistoryAnalysis(BaseModel):
    """Complete analysis of simulation history."""
    total_runs: int
    insights: list[HistoryInsight]
    best_run_id: Optional[str] = None
    best_run_approval: Optional[float] = None
    worst_run_id: Optional[str] = None
    worst_run_approval: Optional[float] = None
    playbook_recommendations: list[str] = Field(default_factory=list)
    summary: str = ""


class AnalyzeHistoryRequest(BaseModel):
    """Request to analyze history."""
    scenario_id: UUID
    history: list[dict] = Field(description="List of history entries")
    focus_metric: Optional[str] = None


class AnalyzeHistoryResponse(BaseModel):
    """Response with history analysis."""
    success: bool
    analysis: Optional[HistoryAnalysis] = None
    error: Optional[str] = None


class FindBestRunRequest(BaseModel):
    """Request to find the best run matching criteria."""
    scenario_id: UUID
    history: list[dict]
    criteria: str = Field(description="e.g., 'maximize approval', 'best equity'")


class FindBestRunResponse(BaseModel):
    """Response with best matching run."""
    success: bool
    run_id: Optional[str] = None
    run: Optional[dict] = None
    explanation: str = ""


# =============================================================================
# Zone Description
# =============================================================================

class ZoneDescription(BaseModel):
    """AI-generated description of a zone/cluster."""
    cluster_id: str
    cluster_name: str
    
    # Character
    primary_character: str = Field(description="e.g., 'University District'")
    description: str
    
    # Demographics
    dominant_archetypes: list[str]
    archetype_breakdown: dict[str, float]
    
    # Recommendations
    recommended_proposals: list[str]
    avoid_proposals: list[str]
    
    # If simulation ran
    current_score: Optional[float] = None
    score_explanation: Optional[str] = None


class DescribeZoneRequest(BaseModel):
    """Request to describe a zone."""
    scenario_id: UUID
    cluster_id: str
    current_proposal: Optional[Proposal] = None


class DescribeZoneResponse(BaseModel):
    """Response with zone description."""
    success: bool
    description: Optional[ZoneDescription] = None
    error: Optional[str] = None


# =============================================================================
# AI Compile (Messy Input -> Structured)
# =============================================================================

class CompileRequest(BaseModel):
    """Request to compile messy input into structured proposals."""
    scenario_id: UUID
    input_text: str
    map_click: Optional[dict] = Field(default=None, description="lat/lng if map was clicked")
    lasso_path: Optional[list[dict]] = Field(default=None, description="Path if lasso was drawn")


class CompiledProposal(BaseModel):
    """A compiled proposal with assumptions."""
    proposal: Proposal
    confidence: float
    assumptions: list[dict]  # {field, value, reason}
    interpretation: str


class CompileResponse(BaseModel):
    """Response with compiled proposals."""
    success: bool
    proposals: list[CompiledProposal] = Field(default_factory=list)
    message: str = ""
    needs_clarification: bool = False
    clarification_question: Optional[str] = None


# =============================================================================
# AI Receipt / Transparency
# =============================================================================

class AIReceipt(BaseModel):
    """Transparency receipt for AI operations."""
    run_hash: str
    active_features: list[str] = Field(
        default_factory=list,
        description="Which AI features were used: parse, variants, townhall, seek"
    )
    assumptions_count: int = 0
    assumptions: list[dict] = Field(default_factory=list)
    deterministic_metrics: bool = True
    timestamp: str = ""
    scenario_seed: Optional[int] = None
    
    # Recipe for reproducibility
    recipe: dict = Field(default_factory=dict)


# =============================================================================
# AI Chat (Full Agent Loop)
# =============================================================================

class AIChatRequest(BaseModel):
    """Request for AI chat with full agent loop."""
    message: str = Field(..., max_length=2000, description="User message")
    scenario_id: UUID
    thread_id: Optional[str] = Field(None, description="Thread ID for conversation continuity")
    persona: Optional[str] = Field(None, description="Persona key for roleplay")
    auto_simulate: bool = Field(default=True, description="Auto-run simulation if proposal parsed")


class SimulationSummary(BaseModel):
    """Compact simulation result summary."""
    overall_approval: float
    overall_sentiment: str
    top_supporters: list[str] = Field(default_factory=list)
    top_opponents: list[str] = Field(default_factory=list)
    key_drivers: list[dict] = Field(default_factory=list)
    metric_deltas: dict[str, float] = Field(default_factory=dict)


class AIChatResponse(BaseModel):
    """Response from AI chat with full context."""
    # Conversation
    thread_id: str = Field(description="Thread ID for continuity")
    assistant_message: str = Field(description="LLM-generated response")
    
    # Parsed proposal (if any)
    proposal_parsed: bool = False
    proposal: Optional[Proposal] = None
    confidence: float = 0.0
    assumptions: list[dict] = Field(default_factory=list)
    
    # Simulation (if ran)
    simulation_ran: bool = False
    simulation_result: Optional[SimulationSummary] = None
    grounded_narrative: Optional[str] = None
    
    # Roleplay (if persona specified)
    persona_reaction: Optional[str] = None
    persona_name: Optional[str] = None
    
    # Receipt
    receipt: AIReceipt
    
    # Error (if Backboard unavailable)
    error: Optional[str] = None
    backboard_available: bool = True

