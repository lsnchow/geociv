"""Proposal interpreter - converts user text to structured proposal."""

import json
import logging
from typing import Optional

from app.services.backboard_client import BackboardClient, BackboardError
from app.schemas.multi_agent import InterpretResult, InterpretedProposal, ProposalLocation, ProposalParameters
from app.agents.definitions import ZONES
from app.agents.session_manager import get_session_manager

logger = logging.getLogger(__name__)

# Interpretation prompt - no JSON braces in examples
INTERPRET_PROMPT = """You are interpreting a civic proposal for Kingston, Ontario.

Convert the user's message into a structured proposal. Determine if it's a BUILD action (spatial: parks, housing, transit, etc.) or a POLICY action (citywide: taxes, subsidies, regulations, etc.).

Known Kingston zones: North End, University District, West Kingston, Downtown Core, Industrial Zone, Waterfront West, Sydenham Ward.

Respond with ONLY valid JSON in this exact format:
- ok: true if interpretation succeeded, false if unclear
- proposal.type: "build" or "policy"
- proposal.title: short title (5-10 words)
- proposal.summary: one sentence description
- proposal.location.kind: "none", "zone", "point", or "polygon"
- proposal.location.zone_ids: list of affected zone IDs if kind="zone" (use: north_end, university, west_kingston, downtown, industrial, waterfront_west, sydenham)
- proposal.parameters.scale: 1.0 default, adjust for "double" (2.0), "small" (0.5), etc.
- proposal.parameters.budget_millions: if mentioned
- proposal.parameters.target_group: if targeting specific group (low-income, students, etc.)
- assumptions: list of assumptions you made
- clarifying_questions: questions if input is ambiguous (max 2)
- confidence: 0-1 how confident in interpretation

USER MESSAGE: {message}

Respond with JSON only, no other text."""


class ProposalInterpreter:
    """Interprets user proposals via Backboard LLM."""
    
    def __init__(self, client: BackboardClient):
        self.client = client
        self.session_mgr = get_session_manager()
    
    async def interpret(self, message: str, session_id: str) -> InterpretResult:
        """
        Interpret a user message into a structured proposal.
        
        Uses session_id to maintain thread continuity across calls.
        Returns InterpretResult with parsed proposal or error.
        """
        session = self.session_mgr.get_or_create_session(session_id)
        prompt = INTERPRET_PROMPT.format(message=message)
        
        try:
            # Get or create interpreter thread for THIS SESSION
            if not session.interpreter_thread_id:
                if not session.interpreter_assistant_id:
                    session.interpreter_assistant_id = await self.client.create_assistant(
                        name="CivicSim Interpreter",
                        system_prompt="You interpret civic proposals into structured JSON. Always respond with valid JSON only."
                    )
                    logger.info(f"[INTERPRETER] Created assistant={session.interpreter_assistant_id}")
                session.interpreter_thread_id = await self.client.create_thread(
                    session.interpreter_assistant_id,
                    caller_context="interpreter.interpret"
                )
                logger.info(f"[INTERPRETER] Created thread={session.interpreter_thread_id} for session={session_id}")
            
            logger.info(f"[INTERPRETER] session={session_id} thread={session.interpreter_thread_id} content_len={len(prompt)}")
            
            # Send to Backboard (returns string directly)
            response_text = await self.client.send_message(
                session.interpreter_thread_id, 
                prompt,
                caller_context="interpreter.interpret",
                request_type="interpreter"
            )
            
            logger.info(f"[INTERPRETER] session={session_id} response_len={len(response_text)}")
            
            # Parse JSON response
            result = self._parse_response(response_text)
            return result
            
        except BackboardError as e:
            logger.error(f"[INTERPRETER] session={session_id} Backboard error: {e}")
            return InterpretResult(
                ok=False,
                error=f"Interpretation failed: {e.body}"
            )
        except Exception as e:
            logger.error(f"[INTERPRETER] session={session_id} Unexpected error: {e}")
            return InterpretResult(
                ok=False,
                error=f"Interpretation failed: {str(e)}"            )
    
    def _parse_response(self, response_text: str) -> InterpretResult:
        """Parse LLM response into InterpretResult."""
        # Try to extract JSON from response
        text = response_text.strip()
        
        # Handle markdown code blocks
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()
        
        try:
            data = json.loads(text)
        except json.JSONDecodeError as e:
            logger.warning(f"[INTERPRETER] JSON parse failed: {e}")
            # Return a basic interpretation on parse failure
            return InterpretResult(
                ok=False,
                error=f"Failed to parse LLM response as JSON: {str(e)[:100]}"
            )
        
        # Some LLMs occasionally return a top-level list; normalize to a dict if possible
        if isinstance(data, list):
            logger.warning("[INTERPRETER] LLM returned list; attempting to use first element")
            if data and isinstance(data[0], dict):
                data = data[0]
            else:
                return InterpretResult(
                    ok=False,
                    error="Failed to construct result: LLM returned a list without an object payload"
                )
        
        # Build result
        try:
            proposal = None
            if data.get("ok", True) and data.get("proposal"):
                p = data["proposal"]
                loc = p.get("location", {})
                params = p.get("parameters", {})
                
                # Coerce target_group to string if LLM returned wrong type
                target_group = params.get("target_group")
                if target_group is not None and not isinstance(target_group, str):
                    if isinstance(target_group, list):
                        target_group = ", ".join(str(g) for g in target_group) if target_group else None
                    else:
                        target_group = str(target_group)
                
                proposal = InterpretedProposal(
                    type=p.get("type", "policy"),
                    title=p.get("title", "Untitled Proposal"),
                    summary=p.get("summary", ""),
                    location=ProposalLocation(
                        kind=loc.get("kind", "none"),
                        zone_ids=loc.get("zone_ids", []),
                        point=loc.get("point"),
                        polygon=loc.get("polygon"),
                    ),
                    parameters=ProposalParameters(
                        scale=params.get("scale", 1.0),
                        budget_millions=params.get("budget_millions"),
                        target_group=target_group,
                    ),
                )
            
            return InterpretResult(
                ok=data.get("ok", True),
                proposal=proposal,
                assumptions=data.get("assumptions", []),
                clarifying_questions=data.get("clarifying_questions", []),
                confidence=data.get("confidence", 0.8),
                error=data.get("error"),
            )
            
        except Exception as e:
            logger.warning(f"[INTERPRETER] Result construction failed: {e}")
            return InterpretResult(
                ok=False,
                error=f"Failed to construct result: {str(e)[:100]}"
            )
