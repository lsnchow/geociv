"""Zone sentiment aggregator - computes zone-level sentiment from agent reactions."""

from app.schemas.multi_agent import (
    AgentReaction,
    ZoneSentiment,
    QuoteAttribution,
)
from app.agents.definitions import ZONES


class SentimentAggregator:
    """Aggregates agent reactions into zone-level sentiment."""
    
    def aggregate(self, reactions: list[AgentReaction]) -> list[ZoneSentiment]:
        """
        Aggregate agent reactions into per-zone sentiment.
        
        Algorithm:
        1. For each zone, collect relevant agent opinions
        2. Compute weighted average sentiment score
        3. Extract top supporting and opposing quotes
        """
        zone_sentiments = []
        
        for zone in ZONES:
            zone_id = zone["id"]
            zone_name = zone["name"]
            
            # Collect scores and quotes for this zone
            scores = []
            support_quotes = []
            oppose_quotes = []
            
            for reaction in reactions:
                # Check if agent mentioned this zone
                zone_effect = None
                for ze in reaction.zones_most_affected:
                    if ze.zone_id == zone_id:
                        zone_effect = ze
                        break
                
                if zone_effect:
                    # Agent specifically mentioned this zone
                    if zone_effect.effect == "support":
                        score = zone_effect.intensity
                    elif zone_effect.effect == "oppose":
                        score = -zone_effect.intensity
                    else:
                        score = 0
                    scores.append(score)
                    
                    # Collect quotes
                    if reaction.quote:
                        if zone_effect.effect == "support":
                            support_quotes.append((reaction, zone_effect.intensity))
                        elif zone_effect.effect == "oppose":
                            oppose_quotes.append((reaction, zone_effect.intensity))
                else:
                    # Use agent's overall stance as fallback
                    if reaction.stance == "support":
                        score = reaction.intensity * 0.5  # Weaker since not zone-specific
                    elif reaction.stance == "oppose":
                        score = -reaction.intensity * 0.5
                    else:
                        score = 0
                    scores.append(score)
                    
                    # Still collect quotes based on overall stance
                    if reaction.quote:
                        if reaction.stance == "support":
                            support_quotes.append((reaction, reaction.intensity * 0.5))
                        elif reaction.stance == "oppose":
                            oppose_quotes.append((reaction, reaction.intensity * 0.5))
            
            # Compute average sentiment score
            if scores:
                avg_score = sum(scores) / len(scores)
            else:
                avg_score = 0.0
            
            # Clamp to [-1, 1]
            avg_score = max(-1.0, min(1.0, avg_score))
            
            # Determine overall sentiment
            if avg_score > 0.2:
                sentiment = "support"
            elif avg_score < -0.2:
                sentiment = "oppose"
            else:
                sentiment = "neutral"
            
            # Sort quotes by intensity and take top 2
            support_quotes.sort(key=lambda x: x[1], reverse=True)
            oppose_quotes.sort(key=lambda x: x[1], reverse=True)
            
            top_support = [
                QuoteAttribution(agent_name=r.agent_name, quote=r.quote)
                for r, _ in support_quotes[:2]
                if r.quote
            ]
            
            top_oppose = [
                QuoteAttribution(agent_name=r.agent_name, quote=r.quote)
                for r, _ in oppose_quotes[:2]
                if r.quote
            ]
            
            zone_sentiments.append(ZoneSentiment(
                zone_id=zone_id,
                zone_name=zone_name,
                sentiment=sentiment,
                score=round(avg_score, 3),
                top_support_quotes=top_support,
                top_oppose_quotes=top_oppose,
            ))
        
        return zone_sentiments

