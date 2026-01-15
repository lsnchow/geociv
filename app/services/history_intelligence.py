"""History Intelligence - analyzes simulation history for patterns and insights."""

import json
import uuid
from typing import Optional
from collections import defaultdict

import httpx

from app.config import get_settings
from app.schemas.ai import (
    HistoryAnalysis,
    HistoryInsight,
    FindBestRunResponse,
)


class HistoryIntelligence:
    """
    Analyzes simulation history to find patterns, best practices, and insights.
    
    Features:
    - Lever effect detection (what consistently helps/hurts)
    - Archetype trend analysis
    - Best/worst run identification
    - Playbook recommendations
    """

    def __init__(self, api_key: Optional[str] = None):
        settings = get_settings()
        self.api_key = api_key or settings.backboard_api_key
        self.base_url = settings.backboard_base_url
        self.headers = {
            "X-API-Key": self.api_key,
            "Accept": "application/json",
        }

    async def analyze_history(
        self,
        history: list[dict],
        focus_metric: Optional[str] = None,
    ) -> HistoryAnalysis:
        """
        Analyze simulation history for patterns.
        
        Args:
            history: List of history entries with proposal and result
            focus_metric: Optional metric to focus analysis on
            
        Returns:
            HistoryAnalysis with insights and recommendations
        """
        if not history:
            return HistoryAnalysis(
                total_runs=0,
                insights=[],
                summary="No history to analyze.",
            )
        
        insights = []
        
        # Find best/worst runs
        best_run = max(history, key=lambda h: h.get("result", {}).get("overall_approval", 0))
        worst_run = min(history, key=lambda h: h.get("result", {}).get("overall_approval", 0))
        
        best_id = best_run.get("id")
        best_approval = best_run.get("result", {}).get("overall_approval", 0)
        worst_id = worst_run.get("id")
        worst_approval = worst_run.get("result", {}).get("overall_approval", 0)
        
        # Analyze lever effects
        lever_insights = self._analyze_lever_effects(history)
        insights.extend(lever_insights)
        
        # Analyze archetype trends
        archetype_insights = self._analyze_archetype_trends(history)
        insights.extend(archetype_insights)
        
        # Analyze metric correlations
        if focus_metric:
            metric_insights = self._analyze_metric_focus(history, focus_metric)
            insights.extend(metric_insights)
        
        # Generate playbook
        playbook = self._generate_playbook(history, insights)
        
        # Generate summary
        summary = self._generate_summary(history, insights, best_approval, worst_approval)
        
        return HistoryAnalysis(
            total_runs=len(history),
            insights=insights,
            best_run_id=best_id,
            best_run_approval=best_approval,
            worst_run_id=worst_id,
            worst_run_approval=worst_approval,
            playbook_recommendations=playbook,
            summary=summary,
        )

    def _analyze_lever_effects(self, history: list[dict]) -> list[HistoryInsight]:
        """Analyze which levers consistently affect outcomes."""
        insights = []
        
        # Group by lever value
        lever_effects = defaultdict(list)
        
        for entry in history:
            proposal = entry.get("proposal", {})
            result = entry.get("result", {})
            approval = result.get("overall_approval", 0)
            
            # Track boolean levers
            for lever in ["includes_affordable_housing", "includes_green_space", "includes_transit_access", "income_targeted"]:
                if lever in proposal:
                    lever_effects[lever].append((proposal[lever], approval))
            
            # Track scale
            if "scale" in proposal:
                scale = proposal.get("scale", 1.0) or 1.0
                lever_effects["high_scale"].append((scale > 1.2, approval))
                lever_effects["low_scale"].append((scale < 0.8, approval))
        
        # Analyze each lever
        for lever, data in lever_effects.items():
            if len(data) < 3:
                continue
            
            true_approvals = [a for v, a in data if v]
            false_approvals = [a for v, a in data if not v]
            
            if not true_approvals or not false_approvals:
                continue
            
            true_avg = sum(true_approvals) / len(true_approvals)
            false_avg = sum(false_approvals) / len(false_approvals)
            
            diff = true_avg - false_avg
            
            if abs(diff) > 10:
                lever_name = lever.replace("_", " ").replace("includes ", "")
                if diff > 0:
                    description = f"Enabling '{lever_name}' improves approval by ~{diff:.0f} points on average"
                    advice = f"Consider adding {lever_name} to boost support"
                else:
                    description = f"Enabling '{lever_name}' decreases approval by ~{abs(diff):.0f} points on average"
                    advice = f"Be cautious with {lever_name} - it may hurt support"
                
                insights.append(HistoryInsight(
                    id=str(uuid.uuid4()),
                    pattern_type="lever_effect",
                    title=f"Lever: {lever_name.title()}",
                    description=description,
                    confidence=min(0.9, len(data) / 20),
                    evidence_count=len(data),
                    actionable_advice=advice,
                ))
        
        return insights

    def _analyze_archetype_trends(self, history: list[dict]) -> list[HistoryInsight]:
        """Analyze archetype reaction patterns."""
        insights = []
        
        # Track archetype scores
        archetype_scores = defaultdict(list)
        
        for entry in history:
            result = entry.get("result", {})
            for arch in result.get("approval_by_archetype", []):
                archetype_scores[arch.get("archetype_key")].append(arch.get("score", 0))
        
        # Find consistently positive/negative archetypes
        for arch_key, scores in archetype_scores.items():
            if len(scores) < 3:
                continue
            
            avg = sum(scores) / len(scores)
            
            if avg > 20:
                insights.append(HistoryInsight(
                    id=str(uuid.uuid4()),
                    pattern_type="archetype_trend",
                    title=f"Reliable Supporter: {arch_key.replace('_', ' ').title()}",
                    description=f"This group consistently supports proposals (avg: {avg:.0f})",
                    confidence=min(0.85, len(scores) / 15),
                    evidence_count=len(scores),
                    actionable_advice=f"You can generally count on {arch_key.replace('_', ' ')} support",
                ))
            elif avg < -20:
                insights.append(HistoryInsight(
                    id=str(uuid.uuid4()),
                    pattern_type="archetype_trend",
                    title=f"Frequent Opponent: {arch_key.replace('_', ' ').title()}",
                    description=f"This group consistently opposes proposals (avg: {avg:.0f})",
                    confidence=min(0.85, len(scores) / 15),
                    evidence_count=len(scores),
                    actionable_advice=f"Focus on addressing {arch_key.replace('_', ' ')} concerns to reduce opposition",
                ))
        
        return insights

    def _analyze_metric_focus(self, history: list[dict], metric: str) -> list[HistoryInsight]:
        """Analyze patterns for a specific metric."""
        insights = []
        
        metric_values = []
        for entry in history:
            result = entry.get("result", {})
            deltas = result.get("metric_deltas", {})
            if metric in deltas:
                metric_values.append((deltas[metric], result.get("overall_approval", 0)))
        
        if len(metric_values) >= 3:
            # Check correlation with approval
            metric_vals = [m for m, a in metric_values]
            approval_vals = [a for m, a in metric_values]
            
            # Simple correlation check
            high_metric = [a for m, a in metric_values if m > 0]
            low_metric = [a for m, a in metric_values if m <= 0]
            
            if high_metric and low_metric:
                high_avg = sum(high_metric) / len(high_metric)
                low_avg = sum(low_metric) / len(low_metric)
                
                if high_avg - low_avg > 15:
                    insights.append(HistoryInsight(
                        id=str(uuid.uuid4()),
                        pattern_type="metric_correlation",
                        title=f"Positive {metric.replace('_', ' ').title()} = Higher Approval",
                        description=f"When {metric.replace('_', ' ')} improves, approval is ~{high_avg - low_avg:.0f} points higher",
                        confidence=0.75,
                        evidence_count=len(metric_values),
                        actionable_advice=f"Prioritize {metric.replace('_', ' ')} improvements",
                    ))
        
        return insights

    def _generate_playbook(self, history: list[dict], insights: list[HistoryInsight]) -> list[str]:
        """Generate playbook recommendations from insights."""
        playbook = []
        
        # Add recommendations from insights
        for insight in insights:
            if insight.actionable_advice:
                playbook.append(insight.actionable_advice)
        
        # Add general recommendations based on history
        if len(history) >= 5:
            avg_approval = sum(h.get("result", {}).get("overall_approval", 0) for h in history) / len(history)
            
            if avg_approval < 0:
                playbook.append("Overall approval has been negative - consider more compromise variants")
            elif avg_approval > 30:
                playbook.append("Strong approval track record - consider bolder proposals")
        
        return playbook[:5]  # Limit to 5 recommendations

    def _generate_summary(
        self,
        history: list[dict],
        insights: list[HistoryInsight],
        best_approval: float,
        worst_approval: float,
    ) -> str:
        """Generate a summary of the analysis."""
        parts = [
            f"Analyzed {len(history)} simulation runs.",
            f"Approval range: {worst_approval:.0f} to {best_approval:.0f}.",
        ]
        
        if insights:
            parts.append(f"Found {len(insights)} patterns.")
            
            # Highlight key insights
            lever_insights = [i for i in insights if i.pattern_type == "lever_effect"]
            if lever_insights:
                parts.append(f"Key lever: {lever_insights[0].title}")
        
        return " ".join(parts)

    async def find_best_run(
        self,
        history: list[dict],
        criteria: str,
    ) -> FindBestRunResponse:
        """Find the best run matching criteria."""
        if not history:
            return FindBestRunResponse(
                success=False,
                explanation="No history to search",
            )
        
        criteria_lower = criteria.lower()
        
        # Parse criteria
        if "approval" in criteria_lower or "support" in criteria_lower:
            key = lambda h: h.get("result", {}).get("overall_approval", 0)
            maximize = "maximize" in criteria_lower or "best" in criteria_lower or "highest" in criteria_lower
        elif "equity" in criteria_lower:
            key = lambda h: h.get("result", {}).get("metric_deltas", {}).get("equity", 0)
            maximize = True
        elif "environment" in criteria_lower:
            key = lambda h: h.get("result", {}).get("metric_deltas", {}).get("environmental_quality", 0)
            maximize = True
        elif "affordable" in criteria_lower or "affordability" in criteria_lower:
            key = lambda h: h.get("result", {}).get("metric_deltas", {}).get("affordability", 0)
            maximize = True
        else:
            # Default to approval
            key = lambda h: h.get("result", {}).get("overall_approval", 0)
            maximize = True
        
        if maximize:
            best = max(history, key=key)
        else:
            best = min(history, key=key)
        
        return FindBestRunResponse(
            success=True,
            run_id=best.get("id"),
            run=best,
            explanation=f"Found best match for '{criteria}'",
        )

