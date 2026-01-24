"""Observability endpoints for health checks and debugging."""

from fastapi import APIRouter

from app.engine.archetypes import ARCHETYPES
from app.engine.metrics import METRICS
from app.services.llm_metrics import get_provider_latency_stats, get_call_metrics
from app.config import ALLOWED_MODELS, DEFAULT_MODEL

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


@router.get("/llm-stats")
async def get_llm_stats():
    """
    Get LLM provider latency statistics.
    
    Returns average latency by provider for the current session.
    Used for UI tooltips showing provider performance.
    """
    provider_stats = get_provider_latency_stats()
    call_metrics = get_call_metrics()
    
    # Count cache hits
    cache_hits = sum(1 for m in call_metrics if m.get("cache_hit", False))
    total_calls = len(call_metrics)
    
    return {
        "provider_stats": provider_stats,
        "total_calls": total_calls,
        "cache_hits": cache_hits,
        "cache_hit_rate_pct": round(cache_hits / total_calls * 100, 1) if total_calls > 0 else 0,
        "allowed_models": ALLOWED_MODELS,
        "default_model": DEFAULT_MODEL,
    }

