"""SQLAlchemy models for simulation results, caching, and agent overrides."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Float, DateTime, ForeignKey, JSON, Text, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SimulationResult(Base):
    """Stored result of a simulation run."""

    __tablename__ = "simulation_results"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    scenario_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("scenarios.id", ondelete="CASCADE"), nullable=False
    )
    
    # Proposal that was simulated (stored as JSON for flexibility)
    proposal: Mapped[dict] = mapped_column(JSON, nullable=False)
    proposal_type: Mapped[str] = mapped_column(String(50), nullable=False)  # spatial or citywide
    
    # Results
    overall_approval: Mapped[float] = mapped_column(Float, nullable=False)
    approval_by_archetype: Mapped[dict] = mapped_column(JSON, nullable=False)
    approval_by_region: Mapped[dict] = mapped_column(JSON, nullable=False)
    
    # Explainability
    top_drivers: Mapped[list] = mapped_column(JSON, nullable=False)
    metric_deltas: Mapped[dict] = mapped_column(JSON, nullable=False)
    
    # Debug info
    seed_used: Mapped[int] = mapped_column(nullable=False)
    lambda_used: Mapped[float] = mapped_column(Float, nullable=False)
    
    # Optional narrative (if generated)
    narrative: Mapped[Optional[str]] = mapped_column(String(5000), nullable=True)
    archetype_quotes: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    compromise_suggestion: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    def __repr__(self) -> str:
        return f"<SimulationResult(id={self.id}, approval={self.overall_approval})>"


class PromotionCache(Base):
    """Cached promotion/simulation results for reuse across sessions.
    
    Cache key is computed from: scenario_id + proposal_hash + agent_models + archetype_overrides + sim_mode
    """

    __tablename__ = "promotion_cache"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    scenario_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("scenarios.id", ondelete="CASCADE"), nullable=False
    )
    
    # Cache key - hash of inputs for quick lookup
    cache_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    
    # Full inputs for debugging/verification
    inputs_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    
    # Cached simulation result (MultiAgentResponse)
    result_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    
    # Provider mix for display (e.g., "nova:15, haiku:3, gemini:3")
    provider_mix: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Index for fast cache lookups
    __table_args__ = (
        Index('ix_promotion_cache_scenario_key', 'scenario_id', 'cache_key'),
    )

    def __repr__(self) -> str:
        return f"<PromotionCache(id={self.id}, cache_key={self.cache_key[:16]}...)>"


class AgentOverride(Base):
    """Per-agent model and archetype overrides for a scenario.
    
    Allows users to customize individual agent's LLM model and persona.
    """

    __tablename__ = "agent_overrides"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    scenario_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("scenarios.id", ondelete="CASCADE"), nullable=False
    )
    
    # Agent key (matches agent definitions, e.g., "queens_west", "skeleton_park")
    agent_key: Mapped[str] = mapped_column(String(100), nullable=False)
    
    # Model override (null = use default)
    model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    
    # Archetype/persona override (null = use default from definitions)
    archetype_override: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Timestamp
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Unique constraint: one override per agent per scenario
    __table_args__ = (
        UniqueConstraint('scenario_id', 'agent_key', name='uq_agent_override_scenario_agent'),
        Index('ix_agent_overrides_scenario', 'scenario_id'),
    )

    def __repr__(self) -> str:
        return f"<AgentOverride(scenario={self.scenario_id}, agent={self.agent_key}, model={self.model})>"

