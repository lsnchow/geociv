"""Minimal Backboard API client - boringly correct."""

import httpx
import time
from typing import Optional
from app.config import get_settings
from app.logging_config import get_logger

logger = get_logger('backboard')


class BackboardError(Exception):
    """Raised when Backboard API returns non-2xx."""
    def __init__(self, status: int, body: str):
        self.status = status
        self.body = body
        super().__init__(f"Backboard error ({status}): {body}")


class BackboardClient:
    """
    Minimal Backboard client with exactly 3 operations.
    
    Encoding contract (non-negotiable):
    1. POST /assistants         -> json={"name", "system_prompt"}
    2. POST /assistants/{id}/threads -> json={}
    3. POST /threads/{id}/messages   -> data={"content", "stream", "memory"}
    """
    
    def __init__(self, api_key: Optional[str] = None):
        settings = get_settings()
        self.api_key = api_key or settings.backboard_api_key
        self.base_url = settings.backboard_base_url.rstrip("/")
        
        if not self.api_key:
            raise BackboardError(0, "BACKBOARD_API_KEY not configured")
        
        self.headers = {
            "X-API-Key": self.api_key,
            "Accept": "application/json",
        }
    
    async def create_assistant(self, name: str, system_prompt: str, caller_context: str = "unknown") -> str:
        """Create assistant. Returns assistant_id."""
        start_time = time.time()
        url = f"{self.base_url}/assistants"
        payload = {"name": name, "system_prompt": system_prompt}
        
        logger.info(f"→ BACKBOARD_CREATE_ASSISTANT | caller={caller_context} | name={name} | prompt_length={len(system_prompt)} chars")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, headers=self.headers, json=payload)
        
        duration = time.time() - start_time
        
        if resp.status_code not in (200, 201):
            logger.error(f"✗ BACKBOARD_CREATE_ASSISTANT_FAILED | status={resp.status_code} | error={resp.text[:200]} | duration={duration:.3f}s")
            raise BackboardError(resp.status_code, resp.text)
        
        data = resp.json()
        assistant_id = data.get("assistant_id") or data.get("id")
        logger.info(f"✓ BACKBOARD_CREATE_ASSISTANT_SUCCESS | caller={caller_context} | assistant_id={assistant_id} | duration={duration:.3f}s")
        return assistant_id
    
    async def create_thread(self, assistant_id: str, caller_context: str = "unknown") -> str:
        """Create thread for assistant. Returns thread_id."""
        start_time = time.time()
        url = f"{self.base_url}/assistants/{assistant_id}/threads"
        
        logger.info(f"→ BACKBOARD_CREATE_THREAD | caller={caller_context} | assistant_id={assistant_id}")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            # MUST send json={} - empty body causes 422
            resp = await client.post(url, headers=self.headers, json={})
        
        duration = time.time() - start_time
        
        if resp.status_code not in (200, 201):
            logger.error(f"✗ BACKBOARD_CREATE_THREAD_FAILED | status={resp.status_code} | error={resp.text[:200]} | duration={duration:.3f}s")
            raise BackboardError(resp.status_code, resp.text)
        
        data = resp.json()
        thread_id = data.get("thread_id") or data.get("id")
        logger.info(f"✓ BACKBOARD_CREATE_THREAD_SUCCESS | caller={caller_context} | thread_id={thread_id} | duration={duration:.3f}s")
        return thread_id
    
    async def send_message(
        self, 
        thread_id: str, 
        content: str,
        model: str = "gemini-2.0-flash-exp",
        provider: str = "google",
        caller_context: str = "unknown",
    ) -> str:
        """Send message to thread. Returns assistant response text.
        
        Default model: gemini-2.0-flash-exp (fastest experimental model from Google)
        """
        if not content or not content.strip():
            raise BackboardError(400, "Message content cannot be empty")
        
        start_time = time.time()
        url = f"{self.base_url}/threads/{thread_id}/messages"
        
        # Calculate approximate token count (rough estimate: 1 token ≈ 4 chars)
        input_tokens_estimate = len(content) // 4
        
        # FORM DATA - not JSON (non-negotiable)
        form_data = {
            "content": content,
            "stream": "false",
            "memory": "Auto",
            "model": model,
            "provider": provider,
        }
        
        logger.info(
            f"→ BACKBOARD_SEND_MESSAGE | caller={caller_context} | thread_id={thread_id} | model={model} | provider={provider} | "
            f"input_length={len(content)} chars | input_tokens_est={input_tokens_estimate}"
        )
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, headers=self.headers, data=form_data)
        
        ttft = time.time() - start_time  # Time to first token (response received)
        
        if resp.status_code != 200:
            logger.error(
                f"✗ BACKBOARD_SEND_MESSAGE_FAILED | status={resp.status_code} | error={resp.text[:200]} | ttft={ttft:.3f}s"
            )
            raise BackboardError(resp.status_code, resp.text)
        
        data = resp.json()
        # Parse response: content || text else error
        message = data.get("content") or data.get("text")
        if not message:
            logger.error(f"✗ BACKBOARD_SEND_MESSAGE_NO_CONTENT | keys={list(data.keys())} | ttft={ttft:.3f}s")
            raise BackboardError(500, f"No content in response: {data}")
        
        total_time = time.time() - start_time
        output_tokens_estimate = len(message) // 4
        total_tokens = input_tokens_estimate + output_tokens_estimate
        
        logger.info(
            f"✓ BACKBOARD_SEND_MESSAGE_SUCCESS | caller={caller_context} | thread_id={thread_id} | "
            f"output_length={len(message)} chars | output_tokens_est={output_tokens_estimate} | "
            f"ttft={ttft:.3f}s (time to first token) | total={total_time:.3f}s | "
            f"tokens_per_sec={total_tokens / total_time:.0f}"
        )
        
        return message

