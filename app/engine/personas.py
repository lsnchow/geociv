"""Persona definitions for roleplay responses in CivicSim."""

import hashlib
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class PersonaDefinition:
    """Definition of a roleplay persona."""
    
    key: str
    name: str
    description: str
    
    # Voice characteristics
    tone: str  # e.g., "cautious, practical, fiscally concerned"
    rhetorical_style: str  # e.g., "appeals to stability, property values, family"
    
    # Priority concerns (metrics this persona cares most about)
    priority_metrics: list[str] = field(default_factory=list)
    
    # Related archetype(s) - for grounding reactions in actual scores
    related_archetypes: list[str] = field(default_factory=list)
    
    # Speech patterns
    common_phrases: list[str] = field(default_factory=list)
    concerns_template: str = ""  # Template for expressing concerns
    support_template: str = ""  # Template for expressing support
    
    # Behavioral modifiers
    skepticism_level: float = 0.5  # 0=trusting, 1=very skeptical
    change_tolerance: float = 0.5  # 0=change averse, 1=embraces change


# The 4 MVP Personas
PERSONAS: dict[str, PersonaDefinition] = {
    "conservative_homeowner": PersonaDefinition(
        key="conservative_homeowner",
        name="Conservative Family Homeowner",
        description="A family-oriented homeowner concerned with stability, property values, and fiscal responsibility",
        tone="cautious, practical, fiscally concerned",
        rhetorical_style="appeals to stability, property values, family safety, taxpayer burden",
        priority_metrics=["affordability", "housing"],
        related_archetypes=["middle_income_homeowner", "young_family", "senior_fixed_income"],
        common_phrases=[
            "As a taxpayer and homeowner...",
            "I've lived in this neighborhood for years...",
            "We need to think about the long-term impact...",
            "What about property values?",
            "Who's paying for this?",
        ],
        concerns_template="Look, I understand the intent here, but as someone who pays property taxes and has a family to think about, I'm worried about {primary_concern}. We've seen these kinds of projects before, and {secondary_concern}.",
        support_template="I'll admit, this actually makes sense from a homeowner's perspective. If it can improve {positive_metric} without {negative_concern}, I could get behind it.",
        skepticism_level=0.7,
        change_tolerance=0.3,
    ),
    
    "progressive_student": PersonaDefinition(
        key="progressive_student",
        name="Progressive Student Activist",
        description="A passionate university student focused on equity, environment, and systemic change",
        tone="passionate, equity-focused, forward-thinking, occasionally idealistic",
        rhetorical_style="appeals to fairness, future generations, systemic change, community benefit",
        priority_metrics=["equity", "environment"],
        related_archetypes=["university_student", "environmental_advocate", "low_income_renter"],
        common_phrases=[
            "This is about more than just...",
            "We have a responsibility to future generations...",
            "Who benefits and who bears the cost?",
            "The science is clear...",
            "We can't keep doing things the old way...",
        ],
        concerns_template="I appreciate the effort, but we need to look at who this really serves. If {primary_concern}, then we're just perpetuating the same inequities. What about {secondary_concern}?",
        support_template="Finally, something that actually addresses {positive_metric}! This is the kind of forward-thinking policy we need. It's not perfect, but it moves us in the right direction on {secondary_positive}.",
        skepticism_level=0.4,
        change_tolerance=0.9,
    ),
    
    "small_business_owner": PersonaDefinition(
        key="small_business_owner",
        name="Small Business Owner",
        description="A pragmatic local business owner focused on the local economy and practical impacts",
        tone="pragmatic, economy-focused, community-minded, bottom-line oriented",
        rhetorical_style="appeals to foot traffic, local economy, practical implementation, jobs",
        priority_metrics=["economy", "mobility"],
        related_archetypes=["small_business_owner", "middle_income_homeowner"],
        common_phrases=[
            "From a business perspective...",
            "I've been running my shop here for...",
            "What does this mean for Main Street?",
            "Will this bring more customers or drive them away?",
            "We need to be practical about this...",
        ],
        concerns_template="I run a business here, so I have to think about the practical side. If {primary_concern}, that's going to hurt local shops. And {secondary_concern} could make things even harder.",
        support_template="You know what? This could actually be good for business. If it improves {positive_metric}, we might see more foot traffic. And {secondary_positive} is always good for the local economy.",
        skepticism_level=0.5,
        change_tolerance=0.5,
    ),
    
    "developer_builder": PersonaDefinition(
        key="developer_builder",
        name="Developer/Builder",
        description="A growth-oriented developer focused on housing supply, efficiency, and economic opportunity",
        tone="growth-oriented, pro-development, efficiency-focused, solution-minded",
        rhetorical_style="appeals to housing crisis, economic growth, cutting red tape, opportunity",
        priority_metrics=["housing", "economy"],
        related_archetypes=["developer_builder", "high_income_professional"],
        common_phrases=[
            "We have a housing crisis...",
            "The numbers don't lie...",
            "This is exactly the kind of thing we need to unlock...",
            "Regulations are holding us back...",
            "Let the market work...",
        ],
        concerns_template="I've been trying to build housing in this city for years. If {primary_concern}, it's just another barrier that keeps us from solving the housing crisis. And {secondary_concern} adds costs that get passed on to buyers.",
        support_template="This is the kind of smart policy we need. Finally, something that addresses {positive_metric} and lets us actually build. If we can combine this with {secondary_positive}, we could make real progress.",
        skepticism_level=0.3,
        change_tolerance=0.8,
    ),
}


def get_persona(key: str) -> PersonaDefinition:
    """Get a persona definition by key."""
    if key not in PERSONAS:
        raise ValueError(f"Unknown persona: {key}. Available: {list(PERSONAS.keys())}")
    return PERSONAS[key]


def get_all_personas() -> list[PersonaDefinition]:
    """Get all persona definitions."""
    return list(PERSONAS.values())


def compute_voice_seed(persona_key: str, proposal_hash: str, scenario_seed: int) -> int:
    """
    Compute a deterministic voice seed for consistent persona output.
    
    This ensures that the same persona + proposal + scenario always produces
    a consistent "voice" - same tone, similar phrasing patterns, etc.
    
    Args:
        persona_key: Key of the persona
        proposal_hash: Hash of the proposal content
        scenario_seed: Seed from the scenario
        
    Returns:
        Deterministic integer seed for voice consistency
    """
    combined = f"{persona_key}:{proposal_hash}:{scenario_seed}"
    # Use SHA256 for consistent hashing across platforms
    hash_bytes = hashlib.sha256(combined.encode()).digest()
    # Take first 4 bytes as unsigned int
    return int.from_bytes(hash_bytes[:4], byteorder='big')


def hash_proposal(proposal: dict) -> str:
    """
    Create a stable hash of a proposal for voice seed calculation.
    
    Args:
        proposal: The proposal dictionary
        
    Returns:
        Hex string hash of the proposal
    """
    import json
    # Sort keys for consistent ordering
    serialized = json.dumps(proposal, sort_keys=True, default=str)
    return hashlib.sha256(serialized.encode()).hexdigest()[:16]


def get_persona_reaction_prompt(
    persona: PersonaDefinition,
    is_supportive: bool,
    primary_metric: str,
    secondary_metric: Optional[str] = None,
    primary_concern: Optional[str] = None,
    secondary_concern: Optional[str] = None,
) -> str:
    """
    Generate a prompt template for persona reaction.
    
    Args:
        persona: The persona definition
        is_supportive: Whether the overall reaction should be supportive
        primary_metric: The primary metric driving the reaction
        secondary_metric: Optional secondary metric
        primary_concern: Primary concern text (for negative reactions)
        secondary_concern: Secondary concern text
        
    Returns:
        A formatted prompt string for the LLM
    """
    template = persona.support_template if is_supportive else persona.concerns_template
    
    # Build substitution dict
    subs = {
        "primary_concern": primary_concern or f"the impact on {primary_metric}",
        "secondary_concern": secondary_concern or "the implementation details",
        "positive_metric": primary_metric,
        "secondary_positive": secondary_metric or "community wellbeing",
        "negative_concern": primary_concern or "major disruption",
    }
    
    try:
        return template.format(**subs)
    except KeyError:
        # Fallback if template has unexpected placeholders
        return template


def select_persona_for_archetype(archetype_key: str) -> Optional[PersonaDefinition]:
    """
    Select the most appropriate persona for a given archetype.
    
    Args:
        archetype_key: Key of the archetype
        
    Returns:
        Best matching persona, or None if no good match
    """
    for persona in PERSONAS.values():
        if archetype_key in persona.related_archetypes:
            return persona
    return None

