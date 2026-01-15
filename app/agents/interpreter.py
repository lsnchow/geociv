"""Proposal interpreter - converts user text to structured proposal."""

import json
import logging
from typing import Optional

from app.services.backboard_client import BackboardClient, BackboardError
from app.schemas.multi_agent import InterpretResult, InterpretedProposal, ProposalLocation, ProposalParameters
from app.agents.definitions import ZONES

logger = logging.getLogger(__name__)

# Interpretation prompt - no JSON braces in examples
INTERPRET_PROMPT = """You are interpreting a civic proposal for Kingston, Ontario.

Convert the user's message into a structured proposal. Determine if it's a BUILD action (spatial: parks, housing, transit, etc.) or a POLICY action (citywide: taxes, subsidies, regulations, etc.).

Known Kingston zones: University District, North End, West Kingston, Downtown Core.

Respond with ONLY valid JSON in this exact format:
- ok: true if interpretation succeeded, false if unclear
- proposal.type: "build" or "policy"
- proposal.title: short title (5-10 words)
- proposal.summary: one sentence description
- proposal.location.kind: "none", "zone", "point", or "polygon"
- proposal.location.zone_ids: list of affected zone IDs if kind="zone" (use: university, north_end, west_kingston, downtown)
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
        self._thread_id: Optional[str] = None
    
    async def interpret(self, message: str, session_id: str) -> InterpretResult:
        """
        Interpret a user message into a structured proposal.
        
        Returns InterpretResult with parsed proposal or error.
        """
        prompt = INTERPRET_PROMPT.format(message=message)
        
        try:
            # Get or create interpreter thread
            if not self._thread_id:
                self._thread_id = await self.client.create_thread(
                    await self._ensure_assistant()
                )
            
            # Send to Backboard
            response_text = await self.client.send_message(self._thread_id, prompt)
            
            # Parse JSON response
            result = self._parse_response(response_text)
            return result
            
        except BackboardError as e:
            logger.error(f"[INTERPRETER] Backboard error: {e}")
            return InterpretResult(
                ok=False,
                error=f"Interpretation failed: {e.body}"
            )
        except Exception as e:
            logger.error(f"[INTERPRETER] Unexpected error: {e}")
            return InterpretResult(
                ok=False,
                error=f"Interpretation failed: {str(e)}"
            )
    
    async def _ensure_assistant(self) -> str:
        """Get or create the interpreter assistant."""
        return await self.client.create_assistant(
            name="CivicSim Interpreter",
            system_prompt="You interpret civic proposals into structured JSON. Always respond with valid JSON only."
        )
    
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
        
        # Build result
        try:
            proposal = None
            if data.get("ok", True) and data.get("proposal"):
                p = data["proposal"]
                loc = p.get("location", {})
                params = p.get("parameters", {})
                
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
                        target_group=params.get("target_group"),
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

