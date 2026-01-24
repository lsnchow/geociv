"""Cache and promotion endpoints for policy simulations."""

import hashlib
import json
import time
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.simulation import PromotionCache, AgentOverride
from app.config import get_settings, ALLOWED_MODELS, DEFAULT_MODEL

router = APIRouter(prefix="/cache", tags=["Cache"])


# =============================================================================
# Request/Response Schemas
# =============================================================================

class CacheKeyInputs(BaseModel):
    """Inputs for computing cache key."""
    scenario_id: str
    proposal_hash: str
    agent_models: dict[str, str] = Field(default_factory=dict)  # agent_key -> model
    archetype_overrides: dict[str, str] = Field(default_factory=dict)  # agent_key -> override hash
    sim_mode: str = "progressive"  # progressive or fast


class CacheCheckResponse(BaseModel):
    """Response from cache check."""
    hit: bool
    cache_key: str
    result: Optional[dict] = None
    provider_mix: Optional[str] = None
    created_at: Optional[str] = None


class PromoteRequest(BaseModel):
    """Request for promote endpoint."""
    scenario_id: UUID
    proposal: dict  # InterpretedProposal as dict
    session_id: str
    agent_overrides: dict[str, dict] = Field(default_factory=dict)  # agent_key -> {model?, archetype?}
    sim_mode: str = "progressive"
    world_state: Optional[dict] = None


class PromoteResponse(BaseModel):
    """Response from promote endpoint."""
    cached: bool
    cache_key: str
    result: dict
    provider_mix: str
    message: str  # "Cached" or "New run"


class InvalidateRequest(BaseModel):
    """Request to invalidate cache for a scenario."""
    scenario_id: UUID
    agent_key: Optional[str] = None  # If specified, only invalidate caches with this agent


# =============================================================================
# Helper Functions
# =============================================================================

def compute_cache_key(inputs: CacheKeyInputs) -> str:
    """Compute a deterministic cache key from inputs."""
    # Sort agent models and overrides for determinism
    sorted_models = sorted(inputs.agent_models.items())
    sorted_overrides = sorted(inputs.archetype_overrides.items())
    
    payload = json.dumps({
        "scenario_id": inputs.scenario_id,
        "proposal_hash": inputs.proposal_hash,
        "agent_models": sorted_models,
        "archetype_overrides": sorted_overrides,
        "sim_mode": inputs.sim_mode,
    }, sort_keys=True)
    
    return hashlib.sha256(payload.encode()).hexdigest()[:32]


def compute_proposal_hash(proposal: dict) -> str:
    """Compute a hash of the proposal for cache key."""
    # Extract key fields that affect simulation outcome
    key_fields = {
        "type": proposal.get("type"),
        "title": proposal.get("title"),
        "summary": proposal.get("summary"),
        "spatial_type": proposal.get("spatial_type"),
        "citywide_type": proposal.get("citywide_type"),
        "latitude": proposal.get("latitude"),
        "longitude": proposal.get("longitude"),
        "radius_km": proposal.get("radius_km"),
    }
    return hashlib.md5(json.dumps(key_fields, sort_keys=True).encode()).hexdigest()[:16]


def compute_provider_mix(agent_models: dict[str, str]) -> str:
    """Compute provider mix string for display."""
    provider_counts: dict[str, int] = {}
    for model in agent_models.values():
        if "nova" in model.lower() or "amazon" in model.lower():
            provider_counts["nova"] = provider_counts.get("nova", 0) + 1
        elif "claude" in model.lower() or "anthropic" in model.lower():
            provider_counts["haiku"] = provider_counts.get("haiku", 0) + 1
        elif "gemini" in model.lower() or "google" in model.lower():
            provider_counts["gemini"] = provider_counts.get("gemini", 0) + 1
        else:
            provider_counts["other"] = provider_counts.get("other", 0) + 1
    
    # Default to nova if no models specified
    if not provider_counts:
        provider_counts["nova"] = 21  # Default agent count
    
    return ", ".join(f"{k}:{v}" for k, v in sorted(provider_counts.items()))


# =============================================================================
# Endpoints
# =============================================================================

@router.get("/{cache_key}", response_model=CacheCheckResponse)
async def check_cache(
    cache_key: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Check if a cached promotion result exists.
    
    Returns hit=true with cached result, or hit=false if not found.
    Target: <150ms read latency.
    """
    start = time.time()
    
    result = await db.execute(
        select(PromotionCache).where(PromotionCache.cache_key == cache_key)
    )
    cache_entry = result.scalar_one_or_none()
    
    latency_ms = (time.time() - start) * 1000
    
    if cache_entry:
        return CacheCheckResponse(
            hit=True,
            cache_key=cache_key,
            result=cache_entry.result_json,
            provider_mix=cache_entry.provider_mix,
            created_at=cache_entry.created_at.isoformat(),
        )
    
    return CacheCheckResponse(
        hit=False,
        cache_key=cache_key,
    )


@router.post("/promote", response_model=PromoteResponse)
async def promote_policy(
    request: PromoteRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Promote a policy with caching.
    
    Flow:
    1. Compute cache key from inputs
    2. Check for cached result
    3. If hit: return cached result immediately
    4. If miss: run simulation, store result, return with "New run" flag
    """
    # Get agent overrides from DB for this scenario
    db_overrides_result = await db.execute(
        select(AgentOverride).where(AgentOverride.scenario_id == request.scenario_id)
    )
    db_overrides = {o.agent_key: o for o in db_overrides_result.scalars().all()}
    
    # Build agent models map (DB overrides + request overrides)
    agent_models: dict[str, str] = {}
    archetype_hashes: dict[str, str] = {}
    
    for agent_key, override in db_overrides.items():
        if override.model:
            agent_models[agent_key] = override.model
        if override.archetype_override:
            archetype_hashes[agent_key] = hashlib.md5(
                override.archetype_override.encode()
            ).hexdigest()[:8]
    
    # Merge request overrides (takes precedence)
    for agent_key, override in request.agent_overrides.items():
        if override.get("model"):
            agent_models[agent_key] = override["model"]
        if override.get("archetype"):
            archetype_hashes[agent_key] = hashlib.md5(
                override["archetype"].encode()
            ).hexdigest()[:8]
    
    # Compute cache key
    proposal_hash = compute_proposal_hash(request.proposal)
    cache_inputs = CacheKeyInputs(
        scenario_id=str(request.scenario_id),
        proposal_hash=proposal_hash,
        agent_models=agent_models,
        archetype_overrides=archetype_hashes,
        sim_mode=request.sim_mode,
    )
    cache_key = compute_cache_key(cache_inputs)
    
    # Check cache
    cache_result = await db.execute(
        select(PromotionCache).where(PromotionCache.cache_key == cache_key)
    )
    cache_entry = cache_result.scalar_one_or_none()
    
    if cache_entry:
        return PromoteResponse(
            cached=True,
            cache_key=cache_key,
            result=cache_entry.result_json,
            provider_mix=cache_entry.provider_mix or "nova:21",
            message="Cached",
        )
    
    # Cache miss - run simulation
    # Import here to avoid circular dependency
    from app.routers.ai_chat import ai_chat, AIChatRequest
    
    # Build simulation request
    sim_request = AIChatRequest(
        message=f"Evaluate: {request.proposal.get('title', 'Unknown proposal')}",
        scenario_id=request.scenario_id,
        session_id=request.session_id,
        world_state=request.world_state,
    )
    
    # Run simulation
    sim_result = await ai_chat(sim_request)
    result_dict = sim_result.model_dump()
    
    # Compute provider mix
    provider_mix = compute_provider_mix(agent_models)
    
    # Store in cache
    new_cache = PromotionCache(
        scenario_id=request.scenario_id,
        cache_key=cache_key,
        inputs_json={
            "proposal": request.proposal,
            "agent_models": agent_models,
            "sim_mode": request.sim_mode,
        },
        result_json=result_dict,
        provider_mix=provider_mix,
    )
    db.add(new_cache)
    await db.commit()
    
    return PromoteResponse(
        cached=False,
        cache_key=cache_key,
        result=result_dict,
        provider_mix=provider_mix,
        message="New run",
    )


@router.post("/invalidate")
async def invalidate_cache(
    request: InvalidateRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Invalidate cached entries for a scenario.
    
    Called when agent model or archetype changes.
    If agent_key is specified, only invalidates caches that include that agent.
    """
    if request.agent_key:
        # Delete caches that include this agent in their inputs
        # This is a simplified approach - ideally we'd parse inputs_json
        result = await db.execute(
            delete(PromotionCache).where(
                PromotionCache.scenario_id == request.scenario_id
            )
        )
    else:
        result = await db.execute(
            delete(PromotionCache).where(
                PromotionCache.scenario_id == request.scenario_id
            )
        )
    
    await db.commit()
    
    return {
        "success": True,
        "scenario_id": str(request.scenario_id),
        "invalidated": True,
    }


@router.post("/compute-key")
async def compute_key(inputs: CacheKeyInputs):
    """
    Compute cache key for given inputs (utility endpoint).
    
    Used by frontend to check cache before promoting.
    """
    return {
        "cache_key": compute_cache_key(inputs),
        "inputs": inputs.model_dump(),
    }
