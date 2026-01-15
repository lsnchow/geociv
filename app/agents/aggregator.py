"""Zone sentiment aggregator - computes zone-level sentiment from agent reactions.

CANONICAL RULE: zone sentiment = regional agent's stance.
Since agent_key == region_id, each zone's sentiment is simply its agent's reaction.
"""

from app.schemas.multi_agent import (
    AgentReaction,
    ZoneSentiment,
    QuoteAttribution,
)
from app.agents.definitions import ZONES


class SentimentAggregator:
    """Aggregates agent reactions into zone-level sentiment.
    
    With region-scoped agents (agent_key == region_id), this is a direct lookup:
    zone sentiment = zone's regional agent's stance.
    """
    
    def aggregate(self, reactions: list[AgentReaction]) -> list[ZoneSentiment]:
        """
        Aggregate agent reactions into per-zone sentiment.
        
        Algorithm (Region-Scoped):
        1. For each zone, find its regional agent (agent_key == zone_id)
        2. Zone sentiment = agent's stance/intensity directly
        3. Quote comes from that single agent
        """
        # Build agent lookup by key (key == region_id)
        agent_by_key = {r.agent_key: r for r in reactions}
        
        zone_sentiments = []
        
        for zone in ZONES:
            zone_id = zone["id"]
            zone_name = zone["name"]
            
            # Find the regional agent for this zone (agent_key == zone_id)
            reaction = agent_by_key.get(zone_id)
            
            if reaction:
                # Direct mapping: zone sentiment = agent's stance
                if reaction.stance == "support":
                    score = reaction.intensity
                elif reaction.stance == "oppose":
                    score = -reaction.intensity
                else:
                    score = 0.0
                
                sentiment = reaction.stance
                
                # Single quote from the regional agent
                top_support = []
                top_oppose = []
                if reaction.quote:
                    quote_attr = QuoteAttribution(
                        agent_name=reaction.agent_name,
                        quote=reaction.quote
                    )
                    if reaction.stance == "support":
                        top_support = [quote_attr]
                    elif reaction.stance == "oppose":
                        top_oppose = [quote_attr]
            else:
                # No agent found for this zone (shouldn't happen with proper setup)
                score = 0.0
                sentiment = "neutral"
                top_support = []
                top_oppose = []
            
            zone_sentiments.append(ZoneSentiment(
                zone_id=zone_id,
                zone_name=zone_name,
                sentiment=sentiment,
                score=round(score, 3),
                top_support_quotes=top_support,
                top_oppose_quotes=top_oppose,
            ))
        
        return zone_sentiments

