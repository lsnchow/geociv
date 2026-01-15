"""SQLAlchemy models for simulation results."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Float, DateTime, ForeignKey, JSON
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

