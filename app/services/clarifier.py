"""Clarification engine for handling ambiguous proposal inputs."""

from typing import Optional
from app.schemas.llm import (
    ClarificationQuestion,
    ClarificationPriority,
    Assumption,
    ParsedProposalResult,
)
from app.schemas.proposal import SpatialProposalType, CitywideProposalType


# Default values for common fields
DEFAULTS = {
    "scale": ("1.0", "Using standard scale"),
    "radius_km": ("0.5", "Using 500m impact radius"),
    "latitude": (None, None),  # No default - must ask or infer
    "longitude": (None, None),
    "amount": ("50", "Using $50 as baseline amount"),
    "percentage": ("10", "Using 10% as baseline change"),
}

# Location inference from text
LOCATION_HINTS = {
    "queen's": (44.2253, -76.4951, "Queen's University area"),
    "queens": (44.2253, -76.4951, "Queen's University area"),
    "university": (44.2253, -76.4951, "University District"),
    "campus": (44.2253, -76.4951, "University campus area"),
    "downtown": (44.2312, -76.4800, "Downtown Kingston"),
    "city center": (44.2312, -76.4800, "City center"),
    "city centre": (44.2312, -76.4800, "City centre"),
    "west": (44.2350, -76.5200, "West suburbs"),
    "west end": (44.2350, -76.5200, "West end"),
    "north": (44.2600, -76.4900, "North suburbs"),
    "north end": (44.2600, -76.4900, "North end"),
    "industrial": (44.2300, -76.4500, "Industrial East"),
    "east": (44.2300, -76.4500, "East Kingston"),
    "east end": (44.2300, -76.4500, "East end"),
    "waterfront": (44.2280, -76.4780, "Waterfront area"),
    "main street": (44.2310, -76.4810, "Main Street corridor"),
}


class Clarifier:
    """
    Handles clarification of ambiguous proposal inputs.
    
    Implements a priority-based question system:
    1. Proposal type (spatial vs citywide) - highest priority
    2. Location (for spatial proposals)
    3. Magnitude/scale
    4. Funding/tradeoffs
    
    Max 2 questions per turn. Uses safe defaults when possible.
    """

    def __init__(self, max_questions_per_turn: int = 2):
        self.max_questions = max_questions_per_turn

    def analyze_gaps(
        self,
        parsed: dict,
        original_text: str,
    ) -> tuple[list[ClarificationQuestion], list[Assumption]]:
        """
        Analyze a parsed proposal for gaps and generate questions.
        
        Args:
            parsed: The partially parsed proposal dict
            original_text: Original user input text
            
        Returns:
            Tuple of (questions to ask, assumptions made)
        """
        questions: list[ClarificationQuestion] = []
        assumptions: list[Assumption] = []
        
        proposal_type = parsed.get("type", "").lower()
        
        # Priority 1: Proposal type ambiguity
        if not proposal_type or proposal_type not in ("spatial", "citywide"):
            questions.append(self._make_type_question(original_text))
        
        # Priority 2: Location (for spatial)
        if proposal_type == "spatial":
            lat = parsed.get("latitude")
            lng = parsed.get("longitude")
            
            if not lat or not lng:
                # Try to infer from text
                inferred = self._infer_location(original_text)
                if inferred:
                    lat, lng, location_name = inferred
                    parsed["latitude"] = lat
                    parsed["longitude"] = lng
                    assumptions.append(Assumption(
                        field="location",
                        value=f"{lat}, {lng}",
                        reason=f"Inferred location: {location_name}",
                    ))
                else:
                    questions.append(self._make_location_question())
        
        # Priority 3: Magnitude/scale
        if proposal_type == "spatial":
            if not parsed.get("scale"):
                default_val, reason = DEFAULTS["scale"]
                parsed["scale"] = float(default_val)
                assumptions.append(Assumption(
                    field="scale",
                    value=default_val,
                    reason=reason,
                ))
        
        if proposal_type == "citywide":
            if not parsed.get("amount") and not parsed.get("percentage"):
                # Check what type of citywide proposal
                citywide_type = parsed.get("citywide_type", "")
                if citywide_type in ("tax_increase", "tax_decrease", "transit_funding"):
                    default_val, reason = DEFAULTS["percentage"]
                    parsed["percentage"] = float(default_val)
                    assumptions.append(Assumption(
                        field="percentage",
                        value=f"{default_val}%",
                        reason=reason,
                    ))
                elif citywide_type in ("subsidy",):
                    default_val, reason = DEFAULTS["amount"]
                    parsed["amount"] = float(default_val)
                    assumptions.append(Assumption(
                        field="amount",
                        value=f"${default_val}",
                        reason=reason,
                    ))
                else:
                    # Ask about magnitude
                    questions.append(self._make_magnitude_question(citywide_type))
        
        # Priority 4: Funding/tradeoffs (only if we have room)
        if len(questions) < self.max_questions:
            if proposal_type == "citywide":
                citywide_type = parsed.get("citywide_type", "")
                if citywide_type == "subsidy" and not parsed.get("income_targeted"):
                    # Default to targeted for subsidies
                    parsed["income_targeted"] = True
                    parsed["target_income_level"] = "low"
                    assumptions.append(Assumption(
                        field="targeting",
                        value="low-income targeted",
                        reason="Subsidies typically target low-income residents",
                    ))
        
        # Limit to max questions
        questions = sorted(questions, key=lambda q: q.priority)[:self.max_questions]
        
        return questions, assumptions

    def apply_defaults(
        self,
        parsed: dict,
        original_text: str,
    ) -> tuple[dict, list[Assumption]]:
        """
        Apply safe defaults to fill remaining gaps.
        
        Called when user skips clarification or we want to proceed anyway.
        
        Args:
            parsed: The partially parsed proposal
            original_text: Original input text
            
        Returns:
            Tuple of (completed proposal dict, assumptions made)
        """
        assumptions: list[Assumption] = []
        proposal_type = parsed.get("type", "").lower()
        
        # Apply spatial defaults
        if proposal_type == "spatial":
            if not parsed.get("scale"):
                parsed["scale"] = 1.0
                assumptions.append(Assumption(
                    field="scale",
                    value="1.0",
                    reason="Using default scale",
                ))
            
            if not parsed.get("radius_km"):
                parsed["radius_km"] = 0.5
                assumptions.append(Assumption(
                    field="radius_km",
                    value="0.5km",
                    reason="Using default impact radius",
                ))
            
            # Location is required - try harder to infer
            if not parsed.get("latitude") or not parsed.get("longitude"):
                inferred = self._infer_location(original_text)
                if inferred:
                    lat, lng, name = inferred
                    parsed["latitude"] = lat
                    parsed["longitude"] = lng
                    assumptions.append(Assumption(
                        field="location",
                        value=f"{lat}, {lng}",
                        reason=f"Inferred: {name}",
                    ))
                else:
                    # Default to downtown if we must proceed
                    parsed["latitude"] = 44.2312
                    parsed["longitude"] = -76.4800
                    assumptions.append(Assumption(
                        field="location",
                        value="44.2312, -76.4800",
                        reason="Defaulting to downtown Kingston (no location specified)",
                    ))
        
        # Apply citywide defaults
        if proposal_type == "citywide":
            if not parsed.get("amount") and not parsed.get("percentage"):
                parsed["percentage"] = 10.0
                assumptions.append(Assumption(
                    field="percentage",
                    value="10%",
                    reason="Using default percentage change",
                ))
        
        return parsed, assumptions

    def process_answer(
        self,
        question: ClarificationQuestion,
        answer: str,
        parsed: dict,
    ) -> tuple[dict, Optional[Assumption]]:
        """
        Process a user's answer to a clarification question.
        
        Args:
            question: The question that was asked
            answer: User's answer
            parsed: Current parsed proposal
            
        Returns:
            Tuple of (updated proposal, assumption if answer was interpreted)
        """
        field = question.field
        assumption = None
        
        if field == "type":
            # Determine proposal type from answer
            answer_lower = answer.lower()
            if any(w in answer_lower for w in ["build", "spatial", "location", "place", "where"]):
                parsed["type"] = "spatial"
            elif any(w in answer_lower for w in ["policy", "citywide", "tax", "subsidy", "regulation"]):
                parsed["type"] = "citywide"
            else:
                # Try to interpret
                parsed["type"] = "spatial" if "build" in answer_lower else "citywide"
                assumption = Assumption(
                    field="type",
                    value=parsed["type"],
                    reason=f"Interpreted '{answer}' as {parsed['type']}",
                )
        
        elif field == "location":
            # Try to extract location from answer
            inferred = self._infer_location(answer)
            if inferred:
                lat, lng, name = inferred
                parsed["latitude"] = lat
                parsed["longitude"] = lng
                assumption = Assumption(
                    field="location",
                    value=f"{lat}, {lng}",
                    reason=f"Interpreted as: {name}",
                )
            else:
                # Default to downtown
                parsed["latitude"] = 44.2312
                parsed["longitude"] = -76.4800
                assumption = Assumption(
                    field="location",
                    value="44.2312, -76.4800",
                    reason=f"Could not parse '{answer}', using downtown",
                )
        
        elif field == "magnitude":
            # Extract number from answer
            import re
            numbers = re.findall(r"[\d.]+", answer)
            if numbers:
                value = float(numbers[0])
                if "%" in answer or value <= 100:
                    parsed["percentage"] = value
                else:
                    parsed["amount"] = value
        
        return parsed, assumption

    def _infer_location(self, text: str) -> Optional[tuple[float, float, str]]:
        """Try to infer location from text."""
        text_lower = text.lower()
        for hint, (lat, lng, name) in LOCATION_HINTS.items():
            if hint in text_lower:
                return (lat, lng, name)
        return None

    def _make_type_question(self, text: str) -> ClarificationQuestion:
        """Create question about proposal type."""
        return ClarificationQuestion(
            priority=ClarificationPriority.PROPOSAL_TYPE,
            question="Is this a spatial proposal (building something in a specific location) or a citywide policy (affecting the whole city)?",
            field="type",
            options=["Spatial (e.g., build a park)", "Citywide (e.g., change a tax)"],
            default_if_skipped="spatial",
        )

    def _make_location_question(self) -> ClarificationQuestion:
        """Create question about location."""
        return ClarificationQuestion(
            priority=ClarificationPriority.LOCATION,
            question="Where in Kingston should this be located?",
            field="location",
            options=[
                "Near Queen's/University",
                "Downtown",
                "West suburbs",
                "North suburbs",
                "Industrial East",
            ],
            default_if_skipped="downtown",
        )

    def _make_magnitude_question(self, citywide_type: str) -> ClarificationQuestion:
        """Create question about magnitude/scale."""
        if citywide_type in ("tax_increase", "tax_decrease"):
            return ClarificationQuestion(
                priority=ClarificationPriority.MAGNITUDE,
                question="What percentage change are you considering?",
                field="magnitude",
                options=["5%", "10%", "15%", "20%"],
                default_if_skipped="10%",
            )
        elif citywide_type == "subsidy":
            return ClarificationQuestion(
                priority=ClarificationPriority.MAGNITUDE,
                question="What amount per month are you considering?",
                field="magnitude",
                options=["$25/month", "$50/month", "$100/month"],
                default_if_skipped="$50/month",
            )
        else:
            return ClarificationQuestion(
                priority=ClarificationPriority.MAGNITUDE,
                question="What scale or intensity for this policy?",
                field="magnitude",
                options=["Low", "Medium", "High"],
                default_if_skipped="Medium",
            )


# Singleton instance
clarifier = Clarifier()

