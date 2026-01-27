"""Backboard API client for chat and LLM integration."""

import json
import logging
from typing import Optional, Union

import httpx

from app.config import get_settings
from app.schemas.llm import (
    ParsedProposalResult,
    Assumption,
    ClarificationQuestion,
    ClarificationPriority,
)
from app.schemas.proposal import (
    SpatialProposal,
    CitywideProposal,
    SpatialProposalType,
    CitywideProposalType,
)
from app.services.clarifier import clarifier, LOCATION_HINTS

logger = logging.getLogger(__name__)


class BackboardError(Exception):
    """Raised when Backboard API call fails."""
    def __init__(self, message: str, recoverable: bool = False):
        super().__init__(message)
        self.recoverable = recoverable


# Enhanced system prompt for conversational agent
# NOTE: Braces are NOT escaped here - this is sent directly to Backboard, not through LangChain
AGENT_SYSTEM_PROMPT = """You are CivicSim, an AI assistant that helps users explore civic proposals in Kingston, Ontario.

You can:
1. Parse user proposals into structured plans
2. Run simulations to predict community reactions
3. Generate variants/alternatives for proposals
4. Run town hall debates with stakeholder perspectives
5. Explain simulation results grounded in data

CONVERSATION STYLE:
- Be conversational and helpful
- When users describe proposals, parse them and explain what you understood
- When asked for variants, generate multiple alternatives
- When asked about town halls or debates, create stakeholder dialogues
- Always ground your explanations in the deterministic simulation data

For PROPOSAL PARSING, extract:
- type: "spatial" (building something) or "citywide" (policy change)
- For spatial: spatial_type, location (lat/lng or hint like "downtown"), scale
- For citywide: citywide_type, amount or percentage, targeting

Kingston locations:
- Queen's University: 44.2253, -76.4951
- Downtown: 44.2312, -76.4800  
- West suburbs: 44.2350, -76.5200
- North suburbs: 44.2600, -76.4900
- Industrial East: 44.2300, -76.4500

When you parse a proposal, respond conversationally but include a JSON block with these fields:
- type: "spatial" or "citywide"
- spatial_type: park, upzone, transit_line, housing_development, etc.
- citywide_type: tax_increase, subsidy, regulation, etc.
- title: Short descriptive title
- latitude, longitude: coordinates or null
- scale: 1.0
- confidence: 0.0 to 1.0
- assumptions: list of field/value/reason objects

If you need clarification, ask naturally (max 2 questions). Always express confidence in your interpretation."""


class BackboardClient:
    """
    Client for Backboard API.
    
    Enhanced with:
    - NO silent fallbacks - Backboard is required
    - Explicit assumption tracking
    - Confidence scoring
    - Conversation continuity via thread_id
    """

    def __init__(self, api_key: Optional[str] = None, allow_fallback: bool = False):
        """Initialize client with API key."""
        settings = get_settings()
        self.api_key = api_key or settings.backboard_api_key
        self.base_url = settings.backboard_base_url
        self.allow_fallback = allow_fallback  # Only for explicit debug mode
        
        if not self.api_key:
            raise BackboardError("BACKBOARD_API_KEY not configured", recoverable=False)
        
        self.headers = {
            "X-API-Key": self.api_key,
            "Accept": "application/json",
        }
        self._assistant_id: Optional[str] = None
        self._thread_cache: dict[str, str] = {}

    async def _ensure_assistant(self) -> str:
        """Ensure the CivicSim assistant exists."""
        if self._assistant_id:
            return self._assistant_id
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                payload = {
                    "name": "CivicSim Agent v4",
                    "system_prompt": AGENT_SYSTEM_PROMPT,
                }
                response = await client.post(
                    f"{self.base_url}/assistants",
                    headers=self.headers,
                    json=payload,
                )
                
                if response.status_code in (200, 201):
                    data = response.json()
                    self._assistant_id = data.get("assistant_id") or data.get("id")
                    logger.info(f"[BACKBOARD] Created assistant: {self._assistant_id}")
                    return self._assistant_id
                else:
                    # Try to get existing assistant
                    list_response = await client.get(
                        f"{self.base_url}/assistants",
                        headers=self.headers,
                    )
                    if list_response.status_code == 200:
                        assistants = list_response.json()
                        for asst in assistants.get("assistants", assistants):
                            if isinstance(asst, dict) and "CivicSim" in asst.get("name", ""):
                                self._assistant_id = asst.get("assistant_id") or asst.get("id")
                                logger.info(f"[BACKBOARD] Found existing assistant: {self._assistant_id}")
                                return self._assistant_id
                    
                    raise BackboardError(f"Failed to create assistant: {response.status_code} - {response.text}")
        except httpx.RequestError as e:
            raise BackboardError(f"Backboard connection failed: {e}", recoverable=False)

    async def get_or_create_thread(self, session_key: str) -> str:
        """Get or create a thread for conversation continuity."""
        if session_key in self._thread_cache:
            logger.info(f"[BACKBOARD] Reusing thread for session: {session_key}")
            return self._thread_cache[session_key]
        
        assistant_id = await self._ensure_assistant()
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # MUST send JSON body - Backboard requires it
                thread_payload = {}  # Empty object is valid, or add metadata if needed
                
                logger.info(f"[BACKBOARD] Creating thread for assistant {assistant_id}")
                
                response = await client.post(
                    f"{self.base_url}/assistants/{assistant_id}/threads",
                    headers={**self.headers, "Content-Type": "application/json"},
                    json=thread_payload,  # FIX: Must send JSON body
                )
                
                if response.status_code in (200, 201):
                    data = response.json()
                    thread_id = data.get("thread_id") or data.get("id")
                    self._thread_cache[session_key] = thread_id
                    logger.info(f"[BACKBOARD] Created thread {thread_id} for session {session_key}")
                    return thread_id
                else:
                    # More accurate error message - not an API key issue
                    raise BackboardError(f"Thread creation failed ({response.status_code}): {response.text}")
        except httpx.RequestError as e:
            raise BackboardError(f"Backboard connection failed: {e}", recoverable=False)

    async def send_message(
        self,
        thread_id: str,
        content: str,
        memory: str = "Auto",
    ) -> dict:
        """Send a message and get a response."""
        # Validation: reject empty messages
        if not content or not content.strip():
            raise BackboardError("Cannot send empty message to Backboard", recoverable=False)

        print(f"[BACKBOARD] === send_message ===")
        print(f"[BACKBOARD] Inbound message length: {len(content)} chars")
        print(f"[BACKBOARD] Message preview: {repr(content[:100])}")
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                # Form data per Backboard API:
                # POST /threads/{thread_id}/messages with data={content, stream, memory}
                form_data = {
                    "content": content,
                    "stream": "false",  # String, not boolean
                    "memory": memory,
                }
                
                url = f"{self.base_url}/threads/{thread_id}/messages"
                print(f"[BACKBOARD] POST {url}")
                print(f"[BACKBOARD] Outbound payload keys: {list(form_data.keys())}")
                print(f"[BACKBOARD] Outbound content length: {len(form_data['content'])} chars")
                
                response = await client.post(
                    url,
                    headers=self.headers,
                    data=form_data,  # Form data, not JSON
                )
                
                print(f"[BACKBOARD] Response status: {response.status_code}")
                print(f"[BACKBOARD] Response body: {response.text[:500]}")

                if response.status_code == 200:
                    result = response.json()
                    return result
                else:
                    raise BackboardError(f"Backboard message failed ({response.status_code}): {response.text}")
        except httpx.RequestError as e:
            raise BackboardError(f"Backboard connection failed: {e}", recoverable=False)

    async def chat(
        self,
        session_key: str,
        message: str,
        context: Optional[dict] = None,
    ) -> dict:
        """
        Send a chat message with full conversation continuity.
        
        Args:
            session_key: Unique key for thread reuse (e.g., scenario_id or user_id)
            message: User message
            context: Optional context (simulation results, scenario info)
            
        Returns:
            Dict with 'content', 'parsed_proposal', 'intent' etc.
        """
        thread_id = await self.get_or_create_thread(session_key)
        
        # Build message with context if provided
        full_message = message
        if context:
            if context.get("simulation_result"):
                full_message += f"\n\n[SIMULATION CONTEXT: approval={context['simulation_result'].get('overall_approval')}, sentiment={context['simulation_result'].get('overall_sentiment')}]"
            if context.get("scenario_name"):
                full_message += f"\n[SCENARIO: {context['scenario_name']}]"
        
        result = await self.send_message(thread_id, full_message, memory="Auto")
        
        # Parse response content - Backboard may use 'text' or 'content'
        content = (
            result.get("text") or
            result.get("content") or 
            result.get("message", {}).get("text") or
            result.get("message", {}).get("content", "")
        )
        
        # Try to extract JSON proposal from response
        parsed_proposal = None
        if "```json" in content:
            try:
                json_str = content.split("```json")[1].split("```")[0]
                parsed_proposal = json.loads(json_str.strip())
            except (IndexError, json.JSONDecodeError):
                pass
        elif "{" in content and "}" in content:
            # Try to find inline JSON
            try:
                start = content.index("{")
                end = content.rindex("}") + 1
                json_str = content[start:end]
                parsed_proposal = json.loads(json_str)
            except (ValueError, json.JSONDecodeError):
                pass
        
        return {
            "thread_id": thread_id,
            "content": content,
            "parsed_proposal": parsed_proposal,
            "raw_response": result,
        }

    async def parse_proposal_enhanced(self, text: str) -> ParsedProposalResult:
        """
        Parse natural language into a structured proposal with full metadata.
        
        IMPORTANT: NO silent fallbacks. Backboard is required.
        
        Returns ParsedProposalResult with:
        - success: whether parsing succeeded
        - proposal: structured proposal object
        - confidence: how confident we are in the interpretation
        - assumptions: list of assumptions made
        - clarification_needed: questions to ask if ambiguous
        
        Args:
            text: Natural language proposal description
            
        Returns:
            ParsedProposalResult with full metadata
            
        Raises:
            BackboardError: If Backboard call fails (no silent fallback)
        """
        try:
            # LLM parsing via Backboard - REQUIRED
            raw_parsed = await self._llm_parse(text)
            
            # Process the raw parsed result
            return self._process_parsed_result(raw_parsed, text)
            
        except BackboardError:
            # Re-raise Backboard errors - no silent fallback
            raise
        except Exception as e:
            # Only allow fallback if explicitly enabled (debug mode)
            if self.allow_fallback:
                logger.warning(f"[BACKBOARD] Fallback enabled, using local parse: {e}")
                return self._local_parse(text)
            else:
                raise BackboardError(f"LLM parsing failed: {e}", recoverable=False)

    async def _llm_parse(self, text: str) -> dict:
        """Parse using the LLM via Backboard API."""
        assistant_id = await self._ensure_assistant()
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                # Create thread - MUST send JSON body
                thread_response = await client.post(
                    f"{self.base_url}/assistants/{assistant_id}/threads",
                    headers={**self.headers, "Content-Type": "application/json"},
                    json={},  # FIX: Empty JSON body required
                )
                
                if thread_response.status_code not in (200, 201):
                    raise BackboardError(f"Thread creation failed ({thread_response.status_code}): {thread_response.text}")
                
                thread_data = thread_response.json()
                thread_id = thread_data.get("thread_id") or thread_data.get("id")
                
                print(f"[BACKBOARD] === _llm_parse ===")
                print(f"[BACKBOARD] Inbound text length: {len(text)} chars")
                
                # Send parsing request
                parse_prompt = f"""Parse this civic proposal and respond with JSON only:

"{text}"

Remember to include confidence score and list all assumptions."""
                
                # Form data per Backboard API
                form_data = {
                    "content": parse_prompt,
                    "stream": "false",
                    "memory": "off",
                }
                
                print(f"[BACKBOARD] Outbound payload keys: {list(form_data.keys())}")
                print(f"[BACKBOARD] Outbound content length: {len(form_data['content'])} chars")
                
                response = await client.post(
                    f"{self.base_url}/threads/{thread_id}/messages",
                    headers=self.headers,
                    data=form_data,  # Form data, not JSON
                    timeout=60.0,
                )
                
                print(f"[BACKBOARD] Response status: {response.status_code}")
                print(f"[BACKBOARD] Response body: {response.text[:500]}")
                
                if response.status_code == 200:
                    result = response.json()
                    logger.info(f"[BACKBOARD] Response keys: {list(result.keys())}")
                    
                    # Backboard may return 'text' or 'content' - try both
                    content = (
                        result.get("text") or 
                        result.get("content") or 
                        result.get("message", {}).get("text") or
                        result.get("message", {}).get("content", "")
                    )
                    
                    logger.info(f"[BACKBOARD] LLM response ({len(content)} chars): {content[:200]}...")
                    
                    # Extract JSON from response
                    if "```json" in content:
                        json_str = content.split("```json")[1].split("```")[0]
                    elif "```" in content:
                        json_str = content.split("```")[1].split("```")[0]
                    else:
                        json_str = content
                    
                    return json.loads(json_str.strip())
                else:
                    raise BackboardError(f"Backboard message failed: {response.status_code} - {response.text}")
        except httpx.RequestError as e:
            raise BackboardError(f"Backboard connection failed: {e}", recoverable=False)
        except json.JSONDecodeError as e:
            raise BackboardError(f"Failed to parse LLM response as JSON: {e}", recoverable=True)

    def _process_parsed_result(self, raw: dict, original_text: str) -> ParsedProposalResult:
        """Process raw LLM output into ParsedProposalResult."""
        # Check for errors
        if raw.get("error"):
            return ParsedProposalResult(
                success=False,
                confidence=0.0,
                clarification_needed=[ClarificationQuestion(
                    priority=ClarificationPriority.PROPOSAL_TYPE,
                    question="Could you describe your proposal more clearly?",
                    field="general",
                    default_if_skipped=None,
                )],
            )
        
        # Extract LLM-provided assumptions
        llm_assumptions = []
        for a in raw.get("assumptions", []):
            if isinstance(a, dict):
                llm_assumptions.append(Assumption(
                    field=a.get("field", "unknown"),
                    value=str(a.get("value", "")),
                    reason=a.get("reason", "LLM assumption"),
                ))
        
        # Run through local clarifier to fill gaps
        questions, local_assumptions = clarifier.analyze_gaps(raw, original_text)
        all_assumptions = llm_assumptions + local_assumptions
        
        # Check if clarification is needed
        if questions:
            return ParsedProposalResult(
                success=False,
                confidence=raw.get("confidence", 0.5),
                assumptions=all_assumptions,
                clarification_needed=questions[:2],  # Max 2 questions
                raw_interpretation=raw.get("title") or raw.get("description"),
            )
        
        # Build the proposal object
        proposal = self._build_proposal(raw)
        
        if proposal is None:
            # Apply defaults and try again
            completed, default_assumptions = clarifier.apply_defaults(raw, original_text)
            all_assumptions.extend(default_assumptions)
            proposal = self._build_proposal(completed)
        
        if proposal is None:
            return ParsedProposalResult(
                success=False,
                confidence=0.3,
                assumptions=all_assumptions,
                clarification_needed=[ClarificationQuestion(
                    priority=ClarificationPriority.PROPOSAL_TYPE,
                    question="I couldn't build a valid proposal. What type of proposal is this?",
                    field="type",
                    options=["Build something (spatial)", "Change a policy (citywide)"],
                    default_if_skipped="spatial",
                )],
            )
        
        return ParsedProposalResult(
            success=True,
            proposal=proposal,
            confidence=raw.get("confidence", 0.8),
            assumptions=all_assumptions,
            clarification_needed=None,
            raw_interpretation=raw.get("title"),
        )

    def _build_proposal(self, data: dict) -> Optional[Union[SpatialProposal, CitywideProposal]]:
        """Build a proposal object from parsed data."""
        proposal_type = data.get("type", "").lower()
        
        if proposal_type == "spatial":
            spatial_type_str = data.get("spatial_type", "").lower()
            
            # Map string to enum
            type_map = {
                "park": SpatialProposalType.PARK,
                "upzone": SpatialProposalType.UPZONE,
                "transit_line": SpatialProposalType.TRANSIT_LINE,
                "transit": SpatialProposalType.TRANSIT_LINE,
                "factory": SpatialProposalType.FACTORY,
                "housing_development": SpatialProposalType.HOUSING_DEVELOPMENT,
                "housing": SpatialProposalType.HOUSING_DEVELOPMENT,
                "commercial_development": SpatialProposalType.COMMERCIAL_DEVELOPMENT,
                "commercial": SpatialProposalType.COMMERCIAL_DEVELOPMENT,
                "bike_lane": SpatialProposalType.BIKE_LANE,
                "bike": SpatialProposalType.BIKE_LANE,
                "community_center": SpatialProposalType.COMMUNITY_CENTER,
                "community": SpatialProposalType.COMMUNITY_CENTER,
            }
            
            spatial_type = type_map.get(spatial_type_str)
            if not spatial_type:
                return None
            
            lat = data.get("latitude")
            lng = data.get("longitude")
            
            if not lat or not lng:
                return None
            
            return SpatialProposal(
                title=data.get("title", "Untitled Proposal"),
                description=data.get("description"),
                spatial_type=spatial_type,
                latitude=float(lat),
                longitude=float(lng),
                radius_km=float(data.get("radius_km", 0.5)),
                scale=float(data.get("scale", 1.0)),
                includes_affordable_housing=bool(data.get("includes_affordable_housing", False)),
                includes_green_space=bool(data.get("includes_green_space", False)),
                includes_transit_access=bool(data.get("includes_transit_access", False)),
            )
            
        elif proposal_type == "citywide":
            citywide_type_str = data.get("citywide_type", "").lower()
            
            type_map = {
                "tax_increase": CitywideProposalType.TAX_INCREASE,
                "tax": CitywideProposalType.TAX_INCREASE,
                "tax_decrease": CitywideProposalType.TAX_DECREASE,
                "subsidy": CitywideProposalType.SUBSIDY,
                "rebate": CitywideProposalType.SUBSIDY,
                "regulation": CitywideProposalType.REGULATION,
                "transit_funding": CitywideProposalType.TRANSIT_FUNDING,
                "transit": CitywideProposalType.TRANSIT_FUNDING,
                "housing_policy": CitywideProposalType.HOUSING_POLICY,
                "environmental_policy": CitywideProposalType.ENVIRONMENTAL_POLICY,
                "environmental": CitywideProposalType.ENVIRONMENTAL_POLICY,
            }
            
            citywide_type = type_map.get(citywide_type_str)
            if not citywide_type:
                return None
            
            return CitywideProposal(
                title=data.get("title", "Untitled Policy"),
                description=data.get("description"),
                citywide_type=citywide_type,
                amount=float(data["amount"]) if data.get("amount") else None,
                percentage=float(data["percentage"]) if data.get("percentage") else None,
                income_targeted=bool(data.get("income_targeted", False)),
                target_income_level=data.get("target_income_level"),
                affects_renters=bool(data.get("affects_renters", True)),
                affects_homeowners=bool(data.get("affects_homeowners", True)),
                affects_businesses=bool(data.get("affects_businesses", True)),
            )
        
        return None

    def _local_parse(self, text: str) -> ParsedProposalResult:
        """Fallback local parsing without LLM."""
        text_lower = text.lower()
        assumptions = []
        
        # Detect proposal type
        proposal_type = None
        spatial_type = None
        citywide_type = None
        
        # Spatial keywords
        if any(w in text_lower for w in ["park", "green space", "garden"]):
            proposal_type = "spatial"
            spatial_type = SpatialProposalType.PARK
        elif any(w in text_lower for w in ["upzone", "density", "rezone"]):
            proposal_type = "spatial"
            spatial_type = SpatialProposalType.UPZONE
        elif any(w in text_lower for w in ["transit", "bus", "train"]) and "funding" not in text_lower:
            proposal_type = "spatial"
            spatial_type = SpatialProposalType.TRANSIT_LINE
        elif any(w in text_lower for w in ["housing", "apartment", "condo"]) and "policy" not in text_lower:
            proposal_type = "spatial"
            spatial_type = SpatialProposalType.HOUSING_DEVELOPMENT
        # Citywide keywords
        elif "tax" in text_lower:
            proposal_type = "citywide"
            citywide_type = CitywideProposalType.TAX_INCREASE if "increase" in text_lower else CitywideProposalType.TAX_DECREASE
        elif any(w in text_lower for w in ["subsidy", "rebate", "credit"]):
            proposal_type = "citywide"
            citywide_type = CitywideProposalType.SUBSIDY
        elif "funding" in text_lower:
            proposal_type = "citywide"
            citywide_type = CitywideProposalType.TRANSIT_FUNDING
        
        if not proposal_type:
            return ParsedProposalResult(
                success=False,
                confidence=0.2,
                clarification_needed=[ClarificationQuestion(
                    priority=ClarificationPriority.PROPOSAL_TYPE,
                    question="Is this a spatial proposal (building something) or a citywide policy?",
                    field="type",
                    options=["Spatial", "Citywide"],
                    default_if_skipped="spatial",
                )],
            )
        
        # Extract location for spatial
        lat, lng = None, None
        if proposal_type == "spatial":
            for hint, (h_lat, h_lng, name) in LOCATION_HINTS.items():
                if hint in text_lower:
                    lat, lng = h_lat, h_lng
                    assumptions.append(Assumption(
                        field="location",
                        value=f"{lat}, {lng}",
                        reason=f"Inferred location: {name}",
                    ))
                    break
            
            if not lat:
                return ParsedProposalResult(
                    success=False,
                    confidence=0.4,
                    assumptions=assumptions,
                    clarification_needed=[ClarificationQuestion(
                        priority=ClarificationPriority.LOCATION,
                        question="Where in Kingston should this be located?",
                        field="location",
                        options=["Near Queen's", "Downtown", "West suburbs", "North suburbs", "Industrial East"],
                        default_if_skipped="downtown",
                    )],
                )
        
        # Build proposal
        if proposal_type == "spatial":
            proposal = SpatialProposal(
                title=f"New {spatial_type.value.replace('_', ' ').title()}",
                spatial_type=spatial_type,
                latitude=lat,
                longitude=lng,
            )
        else:
            proposal = CitywideProposal(
                title=f"New {citywide_type.value.replace('_', ' ').title()}",
                citywide_type=citywide_type,
            )
        
        assumptions.append(Assumption(
            field="scale",
            value="1.0",
            reason="Using default scale",
        ))
        
        return ParsedProposalResult(
            success=True,
            proposal=proposal,
            confidence=0.6,
            assumptions=assumptions,
        )

    # Keep old method for backward compatibility
    async def parse_proposal(self, text: str) -> dict:
        """Legacy method - use parse_proposal_enhanced for new code."""
        result = await self.parse_proposal_enhanced(text)
        if result.success and result.proposal:
            return result.proposal.model_dump()
        return {
            "error": "Could not parse proposal",
            "needs_clarification": result.clarification_needed[0].question if result.clarification_needed else None,
        }

    async def delete_thread(self, thread_id: str) -> bool:
        """Delete a thread."""
        async with httpx.AsyncClient() as client:
            response = await client.delete(
                f"{self.base_url}/threads/{thread_id}",
                headers=self.headers,
            )
            return response.status_code in (200, 204)
