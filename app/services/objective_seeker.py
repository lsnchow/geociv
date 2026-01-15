"""Objective Seeker - iteratively searches for proposals meeting goal constraints."""

import json
import uuid
from typing import Optional, Union
from copy import deepcopy

import httpx

from app.config import get_settings
from app.schemas.proposal import SpatialProposal, CitywideProposal
from app.schemas.ai import (
    ObjectiveGoal,
    SeekResult,
    SeekIteration,
    Constraint,
)
from app.engine.simulator import CivicSimulator, ScenarioData

Proposal = Union[SpatialProposal, CitywideProposal]


# Tweakable parameters for spatial proposals
SPATIAL_TWEAKS = [
    ("scale", 0.5, 2.0, 0.1),
    ("radius_km", 0.2, 3.0, 0.2),
    ("includes_affordable_housing", None, None, None),
    ("includes_green_space", None, None, None),
    ("includes_transit_access", None, None, None),
]

# Tweakable parameters for citywide proposals
CITYWIDE_TWEAKS = [
    ("amount", 10, 500, 20),
    ("percentage", 1, 50, 5),
    ("income_targeted", None, None, None),
]


class ObjectiveSeeker:
    """
    Searches proposal space to find one meeting objective constraints.
    
    Algorithm:
    1. Start with base proposal
    2. Evaluate against constraints
    3. If not met, tweak parameters toward improvement
    4. Use LLM for creative suggestions when stuck
    5. Return best found solution
    """

    def __init__(self, api_key: Optional[str] = None):
        settings = get_settings()
        self.api_key = api_key or settings.backboard_api_key
        self.base_url = settings.backboard_base_url
        self.headers = {
            "X-API-Key": self.api_key,
            "Accept": "application/json",
        }

    async def seek_objective(
        self,
        goal: ObjectiveGoal,
        starting_proposal: Proposal,
        scenario_data: ScenarioData,
        max_iterations: int = 15,
    ) -> SeekResult:
        """
        Search for a proposal meeting the objective.
        
        Args:
            goal: Constraints and priorities
            starting_proposal: Where to start
            scenario_data: Scenario for simulation
            max_iterations: Max search iterations
            
        Returns:
            SeekResult with best found proposal
        """
        simulator = CivicSimulator(scenario_data)
        
        best_proposal = starting_proposal
        best_approval = float("-inf")
        best_constraints_met = 0
        
        history = []
        current_proposal = deepcopy(starting_proposal)
        
        for iteration in range(max_iterations):
            # Simulate current proposal
            result = simulator.simulate(current_proposal, include_debug=False)
            
            # Evaluate constraints
            constraints_met = self._evaluate_constraints(goal.constraints, result)
            
            # Record iteration
            iter_record = SeekIteration(
                iteration=iteration,
                proposal=current_proposal,
                approval=result.overall_approval,
                constraints_met=constraints_met,
                constraints_total=len(goal.constraints),
                change_made="initial" if iteration == 0 else history[-1].change_made if history else "",
            )
            history.append(iter_record)
            
            # Check if goal achieved
            if constraints_met == len(goal.constraints):
                return SeekResult(
                    success=True,
                    goal_achieved=True,
                    best_proposal=current_proposal,
                    best_approval=result.overall_approval,
                    constraints_met=constraints_met,
                    constraints_total=len(goal.constraints),
                    iterations_used=iteration + 1,
                    iteration_history=history,
                    explanation=f"Goal achieved in {iteration + 1} iterations!",
                )
            
            # Track best
            if constraints_met > best_constraints_met or (
                constraints_met == best_constraints_met and result.overall_approval > best_approval
            ):
                best_proposal = deepcopy(current_proposal)
                best_approval = result.overall_approval
                best_constraints_met = constraints_met
            
            # Generate next proposal
            next_proposal, change = await self._generate_next_proposal(
                current_proposal,
                result,
                goal,
                constraints_met,
                iteration,
            )
            
            if next_proposal is None:
                break
            
            current_proposal = next_proposal
            if history:
                history[-1] = SeekIteration(
                    iteration=iteration,
                    proposal=current_proposal,
                    approval=result.overall_approval,
                    constraints_met=constraints_met,
                    constraints_total=len(goal.constraints),
                    change_made=change,
                )
        
        # Return best found
        return SeekResult(
            success=True,
            goal_achieved=False,
            best_proposal=best_proposal,
            best_approval=best_approval,
            constraints_met=best_constraints_met,
            constraints_total=len(goal.constraints),
            iterations_used=len(history),
            iteration_history=history,
            explanation=f"Could not fully achieve goal. Best: {best_constraints_met}/{len(goal.constraints)} constraints met.",
            suggestions_if_failed=self._generate_failure_suggestions(goal, best_proposal),
        )

    def _evaluate_constraints(self, constraints: list[Constraint], result) -> int:
        """Count how many constraints are met."""
        met = 0
        for c in constraints:
            if c.metric == "approval":
                actual = result.overall_approval
            else:
                actual = result.metric_deltas.get(c.metric, 0)
            
            if c.evaluate(actual):
                met += 1
        
        return met

    async def _generate_next_proposal(
        self,
        current: Proposal,
        result,
        goal: ObjectiveGoal,
        constraints_met: int,
        iteration: int,
    ) -> tuple[Optional[Proposal], str]:
        """Generate next proposal to try."""
        # Determine which constraints are failing
        failing_constraints = []
        for c in goal.constraints:
            if c.metric == "approval":
                actual = result.overall_approval
            else:
                actual = result.metric_deltas.get(c.metric, 0)
            
            if not c.evaluate(actual):
                failing_constraints.append((c, actual))
        
        if not failing_constraints:
            return None, "all constraints met"
        
        # Try deterministic tweaks first
        if iteration < 10:
            return self._deterministic_tweak(current, failing_constraints, iteration)
        
        # Use LLM for creative suggestions
        try:
            if self.api_key:
                return await self._llm_suggest_tweak(current, failing_constraints, goal)
        except Exception:
            pass
        
        # More deterministic tweaks
        return self._deterministic_tweak(current, failing_constraints, iteration)

    def _deterministic_tweak(
        self,
        current: Proposal,
        failing_constraints: list[tuple[Constraint, float]],
        iteration: int,
    ) -> tuple[Optional[Proposal], str]:
        """Make a deterministic tweak based on failing constraints."""
        data = current.model_dump()
        change = ""
        
        # Choose tweak based on iteration
        tweaks = SPATIAL_TWEAKS if current.type == "spatial" else CITYWIDE_TWEAKS
        tweak_idx = iteration % len(tweaks)
        param, min_val, max_val, step = tweaks[tweak_idx]
        
        if param in data:
            if min_val is not None:  # Numeric parameter
                current_val = data.get(param) or (min_val + max_val) / 2
                
                # Decide direction based on failing constraint
                if failing_constraints:
                    c, actual = failing_constraints[0]
                    # If we need higher value, increase; if lower, decrease
                    if c.operator in (">", ">=") and actual < c.value:
                        new_val = min(max_val, current_val + step)
                        change = f"increased {param}"
                    else:
                        new_val = max(min_val, current_val - step)
                        change = f"decreased {param}"
                    
                    data[param] = new_val
                else:
                    data[param] = min(max_val, current_val + step)
                    change = f"increased {param}"
            else:  # Boolean parameter
                data[param] = not data.get(param, False)
                change = f"toggled {param}"
        
        if current.type == "spatial":
            return SpatialProposal(**data), change
        else:
            return CitywideProposal(**data), change

    async def _llm_suggest_tweak(
        self,
        current: Proposal,
        failing_constraints: list[tuple[Constraint, float]],
        goal: ObjectiveGoal,
    ) -> tuple[Optional[Proposal], str]:
        """Use LLM to suggest a creative tweak."""
        constraint_desc = []
        for c, actual in failing_constraints:
            constraint_desc.append(f"{c.metric} {c.operator} {c.value} (current: {actual:.2f})")
        
        prompt = f"""Suggest ONE parameter change to help meet these constraints:
{chr(10).join(constraint_desc)}

Current proposal:
{json.dumps(current.model_dump(), indent=2)}

Respond with JSON: {{"parameter": "name", "new_value": value, "reason": "why"}}"""
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            asst_response = await client.post(
                f"{self.base_url}/assistants",
                headers=self.headers,
                json={
                    "name": "CivicSim Optimizer",
                    "system_prompt": "Suggest parameter changes to meet constraints. JSON only.",
                },
            )
            
            asst_id = asst_response.json().get("assistant_id") or asst_response.json().get("id")
            
            thread_response = await client.post(
                f"{self.base_url}/assistants/{asst_id}/threads",
                headers=self.headers,
            )
            thread_id = thread_response.json().get("thread_id") or thread_response.json().get("id")
            
            msg_response = await client.post(
                f"{self.base_url}/threads/{thread_id}/messages",
                headers=self.headers,
                data={
                    "content": prompt,
                    "memory": "off",
                    "web_search": "off",
                    "llm_provider": "openai",
                    "model_name": "gpt-4o",
                    "stream": "false",
                },
            )
            
            content = msg_response.json().get("content", "")
            
            if "```json" in content:
                json_str = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                json_str = content.split("```")[1].split("```")[0]
            else:
                json_str = content
            
            suggestion = json.loads(json_str.strip())
            
            data = current.model_dump()
            param = suggestion.get("parameter")
            new_val = suggestion.get("new_value")
            
            if param in data:
                data[param] = new_val
                
                if current.type == "spatial":
                    return SpatialProposal(**data), f"AI: {suggestion.get('reason', 'optimized')}"
                else:
                    return CitywideProposal(**data), f"AI: {suggestion.get('reason', 'optimized')}"
        
        return None, "no suggestion"

    def _generate_failure_suggestions(
        self,
        goal: ObjectiveGoal,
        best_proposal: Proposal,
    ) -> list[str]:
        """Generate suggestions when goal cannot be achieved."""
        suggestions = [
            "Try relaxing some constraints",
            "Consider a different proposal type",
            "The constraints may be mutually exclusive",
        ]
        
        # Add specific suggestions based on constraints
        for c in goal.constraints:
            if c.metric == "approval" and c.value > 50:
                suggestions.append("High approval targets (>50) are difficult - try a lower threshold")
            elif c.metric == "equity":
                suggestions.append("Add affordable housing or income targeting to improve equity")
            elif c.metric == "environmental_quality":
                suggestions.append("Include green space requirements")
        
        return suggestions[:3]

