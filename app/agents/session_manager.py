"""Session manager - global registry for thread IDs per session.

Design decisions:
- PER-SESSION threads for Interpreter/TownHall (prevents context leaks between sessions)
- Separate thread per agent per session (7 agent threads)
- DM pair threads for agent-to-agent conversations (isolated from main threads)
- Relationship tracking for tether visualization
- In-memory storage (acceptable for hackathon; uvicorn reload resets)
- Future: persist to DB for production
"""

import logging
from dataclasses import dataclass, field
from typing import Optional
import uuid

logger = logging.getLogger(__name__)


@dataclass
class RelationshipEdge:
    """Relationship between two agents."""
    from_agent: str
    to_agent: str
    score: float  # -1 to +1
    last_reason: str = ""


@dataclass
class SessionThreads:
    """Thread IDs associated with a session."""
    session_id: str
    interpreter_assistant_id: Optional[str] = None
    interpreter_thread_id: Optional[str] = None
    reactor_assistant_id: Optional[str] = None
    agent_threads: dict[str, str] = field(default_factory=dict)  # agent_key -> thread_id
    townhall_assistant_id: Optional[str] = None
    townhall_thread_id: Optional[str] = None
    # DM pair threads: "(agentA, agentB)" -> thread_id
    dm_threads: dict[str, str] = field(default_factory=dict)
    dm_assistant_id: Optional[str] = None
    # Relationship edges: "(agentA, agentB)" -> RelationshipEdge
    relationships: dict[str, RelationshipEdge] = field(default_factory=dict)
    
    def get_dm_thread_key(self, agent_a: str, agent_b: str) -> str:
        """Get consistent key for DM pair (alphabetically sorted)."""
        return f"({min(agent_a, agent_b)},{max(agent_a, agent_b)})"
    
    def get_relationship_key(self, from_agent: str, to_agent: str) -> str:
        """Get key for directed relationship."""
        return f"{from_agent}->{to_agent}"
    
    def update_relationship(self, from_agent: str, to_agent: str, delta: float, reason: str = "") -> float:
        """Update relationship score and return new value."""
        key = self.get_relationship_key(from_agent, to_agent)
        if key not in self.relationships:
            self.relationships[key] = RelationshipEdge(from_agent=from_agent, to_agent=to_agent, score=0.0)
        
        edge = self.relationships[key]
        edge.score = max(-1.0, min(1.0, edge.score + delta))  # Clamp to [-1, 1]
        if reason:
            edge.last_reason = reason
        
        logger.info(f"[RELATIONSHIP] {from_agent} -> {to_agent}: {edge.score:.2f} ({reason})")
        return edge.score
    
    def get_top_relationships(self, n: int = 6) -> list[RelationshipEdge]:
        """Get top N relationships by absolute score."""
        edges = list(self.relationships.values())
        edges.sort(key=lambda e: abs(e.score), reverse=True)
        return edges[:n]


class SessionManager:
    """Global registry for session thread mappings.
    
    Singleton pattern - one instance per process.
    Thread-safe for asyncio (not thread-safe for multi-threading).
    """
    
    _instance: Optional['SessionManager'] = None
    _sessions: dict[str, SessionThreads]
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._sessions = {}
            logger.info("[SESSION] SessionManager initialized")
        return cls._instance
    
    def get_or_create_session(self, session_id: Optional[str] = None) -> SessionThreads:
        """Get existing session or create new one."""
        if not session_id:
            session_id = str(uuid.uuid4())
            logger.info(f"[SESSION] Created new session_id={session_id}")
        
        if session_id not in self._sessions:
            self._sessions[session_id] = SessionThreads(session_id=session_id)
            logger.info(f"[SESSION] Registered session_id={session_id}")
        else:
            logger.debug(f"[SESSION] Reusing existing session_id={session_id}")
        
        return self._sessions[session_id]
    
    def get_session(self, session_id: str) -> Optional[SessionThreads]:
        """Get session if exists."""
        return self._sessions.get(session_id)
    
    def debug_info(self, session_id: str) -> dict:
        """Return debug info for a session."""
        session = self._sessions.get(session_id)
        if not session:
            return {"error": f"Session {session_id} not found", "active_sessions": list(self._sessions.keys())}
        
        return {
            "session_id": session.session_id,
            "interpreter_thread_id": session.interpreter_thread_id,
            "interpreter_assistant_id": session.interpreter_assistant_id,
            "reactor_assistant_id": session.reactor_assistant_id,
            "townhall_thread_id": session.townhall_thread_id,
            "townhall_assistant_id": session.townhall_assistant_id,
            "agent_threads": session.agent_threads,
            "dm_threads": session.dm_threads,
            "relationships": {
                k: {"from": v.from_agent, "to": v.to_agent, "score": v.score, "reason": v.last_reason}
                for k, v in session.relationships.items()
            },
            "total_threads": (1 if session.interpreter_thread_id else 0) + 
                            (1 if session.townhall_thread_id else 0) + 
                            len(session.agent_threads) +
                            len(session.dm_threads),
        }
    
    def list_sessions(self) -> list[str]:
        """List all active session IDs."""
        return list(self._sessions.keys())
    
    def clear(self) -> None:
        """Clear all sessions (for testing)."""
        self._sessions.clear()
        logger.info("[SESSION] Cleared all sessions")


# Global instance
def get_session_manager() -> SessionManager:
    """Get the global session manager."""
    return SessionManager()
