"""
Test script to verify LLM metrics logging is working correctly.

This simulates the metrics collection without actually calling the LLM.
"""

import json
import time
from pathlib import Path

# Add parent directory to path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.llm_metrics import (
    LLMCallLogger,
    reset_metrics,
    set_wave_index,
    log_action_summary,
    get_call_metrics,
    LOGS_DIR,
    LLM_METRICS_LOG,
)


async def test_single_call():
    """Test a single LLM call logging."""
    print("Testing single call logging...")
    
    async with LLMCallLogger(
        request_type="interpreter",
        model="gemini-2.0-flash-exp",
        provider="google",
        prompt_chars=1234,
        max_tokens=2048,
        caller_context="test.interpreter"
    ) as logger:
        # Simulate work
        logger.mark_send()
        await asyncio.sleep(0.1)  # Simulate network delay
        logger.set_output("This is a test response", status="success")
    
    print("✓ Single call logged")


async def test_multi_agent_flow():
    """Test full multi-agent flow with waves."""
    print("\nTesting multi-agent flow with waves...")
    
    reset_metrics()
    start_time = time.time()
    
    # Wave 0: Interpreter
    set_wave_index(0)
    async with LLMCallLogger(
        request_type="interpreter",
        model="gemini-2.0-flash-exp",
        provider="google",
        prompt_chars=2000,
        max_tokens=2048,
        caller_context="test.interpreter"
    ) as logger:
        logger.mark_send()
        await asyncio.sleep(0.05)
        logger.set_output("Interpreted proposal", status="success")
    
    # Wave 1: Agent reactions (parallel simulation)
    set_wave_index(1)
    tasks = []
    for i in range(6):  # 6 agents
        async def agent_call(agent_num):
            async with LLMCallLogger(
                request_type="agent",
                model="gemini-2.0-flash-exp",
                provider="google",
                prompt_chars=1500,
                max_tokens=2048,
                caller_context=f"test.agent_{agent_num}"
            ) as logger:
                logger.mark_send()
                await asyncio.sleep(0.08)  # Simulate agent processing
                logger.set_output(f"Agent {agent_num} reaction", status="success")
        
        tasks.append(agent_call(i))
    
    await asyncio.gather(*tasks)
    
    # Wave 2: Reducer (townhall)
    set_wave_index(2)
    async with LLMCallLogger(
        request_type="reducer",
        model="gemini-2.0-flash-exp",
        provider="google",
        prompt_chars=3000,
        max_tokens=2048,
        caller_context="test.townhall"
    ) as logger:
        logger.mark_send()
        await asyncio.sleep(0.06)
        logger.set_output("Town hall transcript", status="success")
    
    total_wall_ms = (time.time() - start_time) * 1000
    
    # Log summary
    log_action_summary(
        num_agents=6,
        max_concurrency=6,
        total_wall_ms=total_wall_ms,
        action_type="test_proposal"
    )
    
    print("✓ Multi-agent flow logged")
    
    # Verify metrics
    metrics = get_call_metrics()
    print(f"\n✓ Collected {len(metrics)} call metrics")
    
    # Print summary stats
    interpreter_calls = [m for m in metrics if m["request_type"] == "interpreter"]
    agent_calls = [m for m in metrics if m["request_type"] == "agent"]
    reducer_calls = [m for m in metrics if m["request_type"] == "reducer"]
    
    print(f"  - Interpreter calls: {len(interpreter_calls)}")
    print(f"  - Agent calls: {len(agent_calls)}")
    print(f"  - Reducer calls: {len(reducer_calls)}")
    
    if agent_calls:
        avg_agent_latency = sum(m["latency_total_ms"] for m in agent_calls) / len(agent_calls)
        print(f"  - Average agent latency: {avg_agent_latency:.2f}ms")


async def test_error_handling():
    """Test error logging."""
    print("\nTesting error handling...")
    
    try:
        async with LLMCallLogger(
            request_type="agent",
            model="gemini-2.0-flash-exp",
            provider="google",
            prompt_chars=1000,
            max_tokens=2048,
            caller_context="test.error"
        ) as logger:
            logger.mark_send()
            await asyncio.sleep(0.01)
            # Simulate an error
            raise ValueError("Simulated error")
    except ValueError:
        pass  # Expected
    
    print("✓ Error handling logged")


def verify_log_file():
    """Verify the log file exists and contains valid JSON."""
    print("\nVerifying log file...")
    
    if not LLM_METRICS_LOG.exists():
        print("✗ Log file does not exist!")
        return False
    
    with open(LLM_METRICS_LOG, "r") as f:
        lines = f.readlines()
    
    print(f"✓ Log file contains {len(lines)} entries")
    
    # Parse last few entries
    print("\nLast 3 entries:")
    for line in lines[-3:]:
        try:
            entry = json.loads(line)
            entry_type = entry.get("summary_type", "call")
            if entry_type == "call":
                print(f"  - CALL: {entry['request_type']} | {entry['latency_total_ms']:.2f}ms | {entry['status']}")
            else:
                print(f"  - SUMMARY: {entry['action_type']} | {entry['total_wall_ms']:.2f}ms | {entry['num_waves']} waves")
        except json.JSONDecodeError:
            print(f"  - Invalid JSON: {line[:50]}")
    
    return True


async def main():
    """Run all tests."""
    print("="*60)
    print("LLM Metrics Logging Test")
    print("="*60)
    
    # Ensure logs directory exists
    LOGS_DIR.mkdir(exist_ok=True)
    
    # Run tests
    await test_single_call()
    await test_multi_agent_flow()
    await test_error_handling()
    
    # Verify log file
    verify_log_file()
    
    print("\n" + "="*60)
    print("All tests completed!")
    print(f"Log file: {LLM_METRICS_LOG}")
    print("="*60)


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
