"""Observability endpoints for health checks and debugging."""

from fastapi import APIRouter

from app.engine.archetypes import ARCHETYPES
from app.engine.metrics import METRICS

router = APIRouter()


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "civicsim",
        "version": "0.1.0",
    }


@router.get("/metrics")
async def list_metrics():
    """List all metric definitions."""
    return {
        "metrics": [
            {
                "key": m.key,
                "name": m.name,
                "description": m.description,
                "higher_is_better": m.higher_is_better,
            }
            for m in METRICS.values()
        ]
    }


@router.get("/archetypes")
async def list_archetypes():
    """List all archetype definitions."""
    return {
        "archetypes": [
            {
                "key": a.key,
                "name": a.name,
                "description": a.description,
                "income_level": a.income_level,
                "housing_status": a.housing_status,
                "weights": a.weights,
            }
            for a in ARCHETYPES.values()
        ]
    }

