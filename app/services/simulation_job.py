"""
Simulation Job Service - Redis-backed job tracking for progressive simulations.

Enables real-time progress updates for long-running multi-agent simulations.
"""

import asyncio
import json
import time
import uuid
from dataclasses import dataclass, field, asdict
from typing import Optional, Any, Dict, List
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class SimulationPhase(str, Enum):
    """Simulation execution phases with progress weights."""
    INITIALIZING = "initializing"           # 5%
    INTERPRETING = "interpreting"           # 10%
    ANALYZING_IMPACT = "analyzing_impact"   # 10%
    AGENT_REACTIONS = "agent_reactions"     # 50%
    COALITION_SYNTHESIS = "coalition_synthesis"  # 10%
    GENERATING_TOWNHALL = "generating_townhall"  # 10%
    FINALIZING = "finalizing"               # 5%
    COMPLETE = "complete"
    ERROR = "error"


# Phase progress weights (must sum to 100)
PHASE_WEIGHTS = {
    SimulationPhase.INITIALIZING: 5,
    SimulationPhase.INTERPRETING: 10,
    SimulationPhase.ANALYZING_IMPACT: 10,
    SimulationPhase.AGENT_REACTIONS: 50,
    SimulationPhase.COALITION_SYNTHESIS: 10,
    SimulationPhase.GENERATING_TOWNHALL: 10,
    SimulationPhase.FINALIZING: 5,
}

# Cumulative progress at start of each phase
PHASE_START_PROGRESS = {}
_cumulative = 0
for phase, weight in PHASE_WEIGHTS.items():
    PHASE_START_PROGRESS[phase] = _cumulative
    _cumulative += weight


@dataclass
class SimulationJob:
    """
    Represents a running simulation with progress tracking.
    
    Stored in Redis for persistence across requests and workers.
    """
    job_id: str
    session_id: str
    status: str = "pending"  # pending | running | complete | error
    progress: float = 0.0  # 0-100
    phase: str = SimulationPhase.INITIALIZING.value
    message: str = "Initializing simulation..."
    
    # Request context
    request_payload: Dict[str, Any] = field(default_factory=dict)
    
    # Partial results (agents complete as they finish)
    completed_agents: int = 0
    total_agents: int = 0
    partial_reactions: List[Dict[str, Any]] = field(default_factory=list)
    partial_zones: List[Dict[str, Any]] = field(default_factory=list)
    
    # Final results (set on completion)
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    
    # Timing
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to JSON-serializable dict."""
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SimulationJob":
        """Create from dict (from Redis)."""
        return cls(**data)
    
    def get_status_response(self) -> Dict[str, Any]:
        """Get status response for API."""
        response = {
            "job_id": self.job_id,
            "status": self.status,
            "progress": round(self.progress, 1),
            "phase": self.phase,
            "message": self.message,
            "completed_agents": self.completed_agents,
            "total_agents": self.total_agents,
        }
        
        # Include partial results if available
        if self.partial_reactions:
            response["partial_reactions"] = self.partial_reactions
        if self.partial_zones:
            response["partial_zones"] = self.partial_zones
        
        # Include full result on completion
        if self.status == "complete" and self.result:
            response["result"] = self.result
        
        # Include error on failure
        if self.status == "error" and self.error:
            response["error"] = self.error
        
        return response


class JobStore:
    """
    Redis-backed job store with in-memory fallback.
    
    Uses Redis for persistence and cross-worker access.
    Falls back to in-memory dict if Redis unavailable.
    """
    
    def __init__(self):
        self._redis = None
        self._memory_store: Dict[str, SimulationJob] = {}
        self._redis_available = False
        self._prefix = "civicsim:job:"
        self._ttl = 3600  # 1 hour TTL for jobs
    
    async def connect(self):
        """Initialize Redis connection."""
        try:
            import redis.asyncio as redis
            from app.config import get_settings
            
            settings = get_settings()
            redis_url = getattr(settings, 'redis_url', None) or "redis://localhost:6379"
            
            self._redis = redis.from_url(redis_url, decode_responses=True)
            await self._redis.ping()
            self._redis_available = True
            logger.info(f"✓ Redis connected: {redis_url}")
        except Exception as e:
            logger.warning(f"Redis unavailable, using in-memory store: {e}")
            self._redis_available = False
    
    async def create_job(self, session_id: str, request_payload: Dict[str, Any]) -> SimulationJob:
        """Create a new simulation job."""
        job = SimulationJob(
            job_id=str(uuid.uuid4()),
            session_id=session_id,
            request_payload=request_payload,
            status="pending",
        )
        await self._save_job(job)
        logger.info(f"[JOB] Created job {job.job_id} for session {session_id}")
        return job
    
    async def get_job(self, job_id: str) -> Optional[SimulationJob]:
        """Get job by ID."""
        if self._redis_available:
            try:
                data = await self._redis.get(f"{self._prefix}{job_id}")
                if data:
                    return SimulationJob.from_dict(json.loads(data))
            except Exception as e:
                logger.error(f"Redis get error: {e}")
        
        return self._memory_store.get(job_id)
    
    async def update_job(self, job: SimulationJob):
        """Update job in store."""
        await self._save_job(job)
    
    async def _save_job(self, job: SimulationJob):
        """Save job to Redis or memory."""
        if self._redis_available:
            try:
                await self._redis.setex(
                    f"{self._prefix}{job.job_id}",
                    self._ttl,
                    json.dumps(job.to_dict())
                )
                return
            except Exception as e:
                logger.error(f"Redis save error: {e}")
        
        self._memory_store[job.job_id] = job
    
    async def delete_job(self, job_id: str):
        """Delete job from store."""
        if self._redis_available:
            try:
                await self._redis.delete(f"{self._prefix}{job_id}")
            except Exception:
                pass
        
        self._memory_store.pop(job_id, None)


# Global job store singleton
_job_store: Optional[JobStore] = None


async def get_job_store() -> JobStore:
    """Get or create the global job store."""
    global _job_store
    if _job_store is None:
        _job_store = JobStore()
        await _job_store.connect()
    return _job_store


class SimulationProgress:
    """
    Helper class to update job progress during simulation.
    
    Usage:
        progress = SimulationProgress(job, job_store)
        await progress.set_phase(SimulationPhase.INTERPRETING, "Parsing your proposal...")
        await progress.agent_completed(agent_reaction, zone_sentiment)
        await progress.complete(full_result)
    """
    
    def __init__(self, job: SimulationJob, store: JobStore):
        self.job = job
        self.store = store
    
    async def start(self, total_agents: int):
        """Mark simulation as started."""
        self.job.status = "running"
        self.job.started_at = time.time()
        self.job.total_agents = total_agents
        self.job.phase = SimulationPhase.INITIALIZING.value
        self.job.message = "Initializing simulation..."
        self.job.progress = 0
        await self.store.update_job(self.job)
    
    async def set_phase(self, phase: SimulationPhase, message: str):
        """Update to a new phase."""
        self.job.phase = phase.value
        self.job.message = message
        self.job.progress = PHASE_START_PROGRESS.get(phase, self.job.progress)
        await self.store.update_job(self.job)
        logger.info(f"[JOB {self.job.job_id[:8]}] Phase: {phase.value} ({self.job.progress}%) - {message}")
    
    async def agent_completed(
        self, 
        agent_reaction: Dict[str, Any],
        zone_sentiment: Optional[Dict[str, Any]] = None
    ):
        """Record an agent completion and update progress."""
        # Track completion timestamp for active-call polling
        agent_reaction = dict(agent_reaction)
        agent_reaction["completed_at"] = time.time()
        self.job.completed_agents += 1
        self.job.partial_reactions.append(agent_reaction)
        
        if zone_sentiment:
            # Update or add zone sentiment
            existing = next(
                (z for z in self.job.partial_zones if z.get("zone_id") == zone_sentiment.get("zone_id")),
                None
            )
            if existing:
                existing.update(zone_sentiment)
            else:
                self.job.partial_zones.append(zone_sentiment)
        
        # Calculate progress within agent phase
        agent_base = PHASE_START_PROGRESS[SimulationPhase.AGENT_REACTIONS]
        agent_weight = PHASE_WEIGHTS[SimulationPhase.AGENT_REACTIONS]
        
        if self.job.total_agents > 0:
            agent_progress = (self.job.completed_agents / self.job.total_agents) * agent_weight
            self.job.progress = agent_base + agent_progress
        
        self.job.message = f"Evaluating stakeholder reactions... {self.job.completed_agents}/{self.job.total_agents}"
        
        await self.store.update_job(self.job)
        logger.debug(f"[JOB {self.job.job_id[:8]}] Agent {self.job.completed_agents}/{self.job.total_agents} complete")
    
    async def complete(self, result: Dict[str, Any]):
        """Mark simulation as complete with full results."""
        self.job.status = "complete"
        self.job.phase = SimulationPhase.COMPLETE.value
        self.job.progress = 100
        self.job.message = "Simulation complete"
        self.job.result = result
        self.job.completed_at = time.time()
        await self.store.update_job(self.job)
        
        duration = self.job.completed_at - (self.job.started_at or self.job.created_at)
        logger.info(f"[JOB {self.job.job_id[:8]}] Complete in {duration:.2f}s")
    
    async def fail(self, error: str):
        """Mark simulation as failed."""
        self.job.status = "error"
        self.job.phase = SimulationPhase.ERROR.value
        self.job.message = f"Simulation failed: {error}"
        self.job.error = error
        self.job.completed_at = time.time()
        await self.store.update_job(self.job)
        logger.error(f"[JOB {self.job.job_id[:8]}] Failed: {error}")


# Phase message templates
PHASE_MESSAGES = {
    SimulationPhase.INITIALIZING: "Setting up simulation environment...",
    SimulationPhase.INTERPRETING: "Analyzing your proposal...",
    SimulationPhase.ANALYZING_IMPACT: "Evaluating regional impacts...",
    SimulationPhase.AGENT_REACTIONS: "Gathering stakeholder reactions...",
    SimulationPhase.COALITION_SYNTHESIS: "Identifying coalitions and conflicts...",
    SimulationPhase.GENERATING_TOWNHALL: "Generating town hall debate...",
    SimulationPhase.FINALIZING: "Preparing results...",
}
