"""Session ledger service - caches world events per session.

Provides fast read/write of world facts (policies, builds, DM shifts)
without requiring Backboard thread writes.

LEDGER_ENABLED=false disables all operations (graceful fallback).
"""

import logging
from datetime import datetime
from typing import Optional, Literal

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import async_session_maker
from app.models.simulation import SessionLedgerEntry
from app.schemas.proposal import (
    WorldStateSummary,
    PlacedItemSummary,
    AdoptedPolicySummary,
    RelationshipShift,
)

logger = logging.getLogger(__name__)

EventType = Literal["policy_adopted", "build_adopted", "dm_shift"]


async def write_event(
    session_id: str,
    event_type: EventType,
    payload: dict,
) -> Optional[str]:
    """Write an event to the session ledger.
    
    Returns event_id on success, None on failure or if disabled.
    Failures are logged but never raised - ledger is best-effort.
    """
    settings = get_settings()
    if not settings.ledger_enabled:
        logger.debug("[LEDGER] Disabled, skipping write")
        return None
    
    try:
        async with async_session_maker() as db:
            entry = SessionLedgerEntry(
                session_id=session_id,
                event_type=event_type,
                payload=payload,
            )
            db.add(entry)
            await db.commit()
            await db.refresh(entry)
            logger.info(f"[LEDGER] Wrote {event_type} for session={session_id[:8]}")
            return str(entry.id)
    except Exception as e:
        logger.warning(f"[LEDGER] Failed to write {event_type}: {e}")
        return None


async def get_session_events(
    session_id: str,
    event_type: Optional[EventType] = None,
) -> list[dict]:
    """Get all events for a session, optionally filtered by type.
    
    Returns empty list on failure or if disabled.
    """
    settings = get_settings()
    if not settings.ledger_enabled:
        return []
    
    try:
        async with async_session_maker() as db:
            query = select(SessionLedgerEntry).where(
                SessionLedgerEntry.session_id == session_id
            ).order_by(SessionLedgerEntry.created_at.asc())
            
            if event_type:
                query = query.where(SessionLedgerEntry.event_type == event_type)
            
            result = await db.execute(query)
            entries = result.scalars().all()
            
            return [
                {
                    "id": str(e.id),
                    "event_type": e.event_type,
                    "payload": e.payload,
                    "created_at": e.created_at.isoformat(),
                }
                for e in entries
            ]
    except Exception as e:
        logger.warning(f"[LEDGER] Failed to read events: {e}")
        return []


async def build_world_state_from_ledger(
    session_id: str,
) -> Optional[WorldStateSummary]:
    """Build WorldStateSummary from ledger events.
    
    Returns None if ledger is disabled or empty (caller should use fallback).
    """
    settings = get_settings()
    if not settings.ledger_enabled:
        return None
    
    try:
        events = await get_session_events(session_id)
        if not events:
            return None
        
        placed_items: list[PlacedItemSummary] = []
        adopted_policies: list[AdoptedPolicySummary] = []
        dm_shifts: list[RelationshipShift] = []
        
        for event in events:
            payload = event["payload"]
            event_type = event["event_type"]
            
            if event_type == "build_adopted":
                placed_items.append(PlacedItemSummary(
                    id=payload.get("id", event["id"]),
                    type=payload.get("type", "unknown"),
                    title=payload.get("title", "Untitled Build"),
                    region_id=payload.get("region_id"),
                    region_name=payload.get("region_name"),
                    radius_km=payload.get("radius_km", 0.5),
                    emoji=payload.get("emoji", "📍"),
                ))
            
            elif event_type == "policy_adopted":
                adopted_policies.append(AdoptedPolicySummary(
                    id=payload.get("id", event["id"]),
                    title=payload.get("title", "Untitled Policy"),
                    summary=payload.get("summary", ""),
                    outcome=payload.get("outcome", "adopted"),
                    vote_pct=payload.get("vote_pct", 0),
                    timestamp=payload.get("timestamp", event["created_at"]),
                ))
            
            elif event_type == "dm_shift":
                dm_shifts.append(RelationshipShift(
                    from_agent=payload.get("from_agent", "user"),
                    to_agent=payload.get("to_agent", "unknown"),
                    score=payload.get("score", 0),
                    reason=payload.get("reason", "DM conversation"),
                ))
        
        # Take top 3 DM shifts by absolute score
        top_shifts = sorted(dm_shifts, key=lambda s: abs(s.score), reverse=True)[:3]
        
        return WorldStateSummary(
            version=len(events),  # Version = number of events
            placed_items=placed_items,
            adopted_policies=adopted_policies,
            top_relationship_shifts=top_shifts,
        )
    
    except Exception as e:
        logger.warning(f"[LEDGER] Failed to build world state: {e}")
        return None


async def clear_session(session_id: str) -> bool:
    """Clear all events for a session (optional, for manual reset).
    
    Returns True on success.
    """
    settings = get_settings()
    if not settings.ledger_enabled:
        return False
    
    try:
        async with async_session_maker() as db:
            await db.execute(
                delete(SessionLedgerEntry).where(
                    SessionLedgerEntry.session_id == session_id
                )
            )
            await db.commit()
            logger.info(f"[LEDGER] Cleared session={session_id[:8]}")
            return True
    except Exception as e:
        logger.warning(f"[LEDGER] Failed to clear session: {e}")
        return False
