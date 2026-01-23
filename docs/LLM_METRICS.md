# LLM Latency & Concurrency Logging

Lightweight, production-safe logging to understand where time is spent during GeoCiv LLM execution.

## Location

All metrics are logged to: `logs/llm_metrics.jsonl`

This is a JSON Lines file (one JSON object per line).

## Per-Call Metrics

Each LLM call emits one JSON object with the following fields:

### Timing (Core)
- `t_start_ms` - Timestamp when function was invoked (ms since epoch)
- `t_send_ms` - Timestamp when HTTP request was sent (ms since epoch)
- `t_done_ms` - Timestamp when full response was received (ms since epoch)
- `latency_total_ms` - Total latency (t_done - t_start)
- `latency_network_ms` - Network latency (t_done - t_send)

### Concurrency / Scheduling
- `inflight_at_start` - Number of LLM calls in flight when this call started
- `worker_pool_size` - Max concurrency cap (default: 10)
- `queue_wait_ms` - Time waiting for a worker slot (0 if no queue)
- `wave_index` - Execution wave number (0=interpreter, 1=agents, 2=reducer)

### Prompt / Size
- `prompt_chars` - Number of characters in the prompt
- `prompt_tokens_est` - Estimated tokens (chars / 4)
- `output_tokens_est` - Estimated output tokens (chars / 4)
- `max_tokens` - Max tokens parameter sent to LLM

### Model Metadata
- `provider` - Provider name (e.g., "google", "amazon")
- `model` - Model name (e.g., "gemini-2.0-flash-exp")
- `wrapper` - Always "backboard"
- `request_type` - One of: "interpreter", "agent", "reducer"
- `caller_context` - Detailed context string for debugging

### Outcome
- `status` - "success" or "error"
- `error_code` - Error type if status="error", null otherwise
- `retry_count` - Number of retries (currently always 0)

### Example Per-Call Log
```json
{
    "t_start_ms": 791,
    "t_send_ms": 791,
    "t_done_ms": 872,
    "latency_total_ms": 81.29,
    "latency_network_ms": 81.28,
    "inflight_at_start": 0,
    "worker_pool_size": 10,
    "queue_wait_ms": 0.0,
    "wave_index": 1,
    "prompt_chars": 1500,
    "prompt_tokens_est": 375,
    "output_tokens_est": 4,
    "max_tokens": 2048,
    "provider": "google",
    "model": "gemini-2.0-flash-exp",
    "wrapper": "backboard",
    "request_type": "agent",
    "caller_context": "reactor.react[developer]",
    "status": "success",
    "error_code": null,
    "retry_count": 0
}
```

## Per-Action Summary

After each complete user action (policy proposal), one summary log is emitted:

### Summary Fields
- `summary_type` - Always "action"
- `action_type` - Type of action (e.g., "proposal", "query")
- `num_agents` - Number of agents involved
- `max_concurrency` - Max concurrent calls
- `total_wall_ms` - Total wall clock time for the action
- `slowest_call_ms` - Latency of slowest LLM call
- `p95_call_ms` - 95th percentile call latency
- `num_waves` - Number of execution waves (typically 3)
- `reducer_latency_ms` - Latency of the reducer (townhall) call
- `total_calls` - Total number of LLM calls
- `success_count` - Number of successful calls
- `error_count` - Number of failed calls
- `timestamp_ms` - Action completion timestamp

### Example Summary Log
```json
{
    "summary_type": "action",
    "action_type": "proposal",
    "num_agents": 6,
    "max_concurrency": 6,
    "total_wall_ms": 2456.78,
    "slowest_call_ms": 982.34,
    "p95_call_ms": 876.23,
    "num_waves": 3,
    "reducer_latency_ms": 234.56,
    "total_calls": 8,
    "success_count": 8,
    "error_count": 0,
    "timestamp_ms": 1769127674538
}
```

## Analysis Questions (Success Criteria)

With these logs, you can answer:

### 1. Is latency dominated by agent calls or reducer?
```bash
# Average latency by request type
grep '"status": "success"' logs/llm_metrics.jsonl | \
  jq -r '[.request_type, .latency_total_ms] | @tsv' | \
  awk '{sum[$1]+=$2; count[$1]++} END {for (t in sum) print t, sum[t]/count[t]}'
```

### 2. Does latency scale linearly with number of agents?
```bash
# Extract summary data
grep '"summary_type": "action"' logs/llm_metrics.jsonl | \
  jq -r '[.num_agents, .total_wall_ms] | @tsv'
```

### 3. At what concurrency does wall time stop improving?
```bash
# Check inflight counts vs latencies
grep '"request_type": "agent"' logs/llm_metrics.jsonl | \
  jq -r '[.inflight_at_start, .latency_total_ms] | @tsv'
```

### 4. Model comparison (Amazon Nova vs Gemini)
```bash
# Average latency by provider
jq -r 'select(.status=="success") | [.provider, .model, .latency_total_ms] | @tsv' \
  logs/llm_metrics.jsonl | \
  awk '{sum[$1" "$2]+=$3; count[$1" "$2]++} END {for (m in sum) print m, sum[m]/count[m]}'
```

## Testing

Run the test suite to verify metrics are being collected:

```bash
python3 scripts/test_llm_metrics.py
```

## Implementation Notes

- **Overhead**: <2ms per call (non-blocking file I/O)
- **Thread-safe**: Uses asyncio locks for inflight tracking
- **Fail-safe**: Logging failures never crash the application
- **No PII**: Only sizes and timing, never raw prompts or responses
- **Production-ready**: Always-on, no configuration needed

## Architecture

1. **LLMCallLogger** (llm_metrics.py) - Context manager that wraps each LLM call
2. **BackboardClient** (backboard_client.py) - Uses LLMCallLogger for send_message
3. **Orchestration Layer** (ai_chat.py) - Sets wave indices and logs summaries
4. **Wave Tracking**:
   - Wave 0: Interpreter (1 call)
   - Wave 1: Agent reactions (N parallel calls)
   - Wave 2: Reducer/townhall (1 call)

## Future Enhancements (Non-goals for v1)

- Cost tracking (requires token usage from API)
- Streaming metrics (TTFB, TTFT)
- Model quality evaluation
- UI analytics dashboard
