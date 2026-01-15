"""SQLAlchemy models for scenarios and clusters."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Scenario(Base):
    """A simulation scenario containing a city model with clusters and population."""

    __tablename__ = "scenarios"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    seed: Mapped[int] = mapped_column(Integer, default=42)
    
    # Simulation parameters
    lambda_decay: Mapped[float] = mapped_column(Float, default=1.0)
    
    # Baseline metric values (JSON dict of metric_key -> value)
    baseline_metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    clusters: Mapped[list["Cluster"]] = relationship(
        "Cluster", back_populates="scenario", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Scenario(id={self.id}, name='{self.name}')>"


class Cluster(Base):
    """A population cluster within a scenario (e.g., downtown, university area)."""

    __tablename__ = "clusters"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    scenario_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("scenarios.id", ondelete="CASCADE"), nullable=False
    )
    
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    
    # Geographic location (Kingston coordinates roughly 44.2312° N, 76.4860° W)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    
    # Total population in this cluster
    population: Mapped[int] = mapped_column(Integer, default=1000)
    
    # GeoJSON polygon boundary (optional - if null, use circle from lat/lng)
    # Format: {"type": "Polygon", "coordinates": [[[lng, lat], ...]]}
    polygon: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    
    # AI-generated zone label (e.g., "University District")
    ai_label: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    
    # Cluster-specific baseline metrics (overrides scenario defaults)
    baseline_metrics: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # Relationships
    scenario: Mapped["Scenario"] = relationship("Scenario", back_populates="clusters")
    archetype_distributions: Mapped[list["ClusterArchetypeDistribution"]] = relationship(
        "ClusterArchetypeDistribution", back_populates="cluster", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Cluster(id={self.id}, name='{self.name}')>"


class ClusterArchetypeDistribution(Base):
    """Distribution of archetypes within a cluster."""

    __tablename__ = "cluster_archetype_distributions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    cluster_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clusters.id", ondelete="CASCADE"), nullable=False
    )
    
    # Archetype key (references engine/archetypes.py definitions)
    archetype_key: Mapped[str] = mapped_column(String(100), nullable=False)
    
    # Percentage of cluster population (0.0 to 1.0)
    percentage: Mapped[float] = mapped_column(Float, nullable=False)

    # Relationship
    cluster: Mapped["Cluster"] = relationship(
        "Cluster", back_populates="archetype_distributions"
    )

    def __repr__(self) -> str:
        return f"<ClusterArchetypeDistribution(archetype='{self.archetype_key}', pct={self.percentage})>"

