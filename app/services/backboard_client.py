"""Minimal Backboard API client - boringly correct."""

import httpx
from typing import Optional
from app.config import get_settings


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
    
    async def create_assistant(self, name: str, system_prompt: str) -> str:
        """Create assistant. Returns assistant_id."""
        url = f"{self.base_url}/assistants"
        payload = {"name": name, "system_prompt": system_prompt}
        
        print(f"[BB] POST {url} | prompt_len={len(system_prompt)}")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, headers=self.headers, json=payload)
        
        if resp.status_code not in (200, 201):
            print(f"[BB] ERROR {resp.status_code}: {resp.text[:200]}")
            raise BackboardError(resp.status_code, resp.text)
        
        data = resp.json()
        assistant_id = data.get("assistant_id") or data.get("id")
        print(f"[BB] OK assistant_id={assistant_id}")
        return assistant_id
    
    async def create_thread(self, assistant_id: str) -> str:
        """Create thread for assistant. Returns thread_id."""
        url = f"{self.base_url}/assistants/{assistant_id}/threads"
        
        print(f"[BB] POST {url}")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            # MUST send json={} - empty body causes 422
            resp = await client.post(url, headers=self.headers, json={})
        
        if resp.status_code not in (200, 201):
            print(f"[BB] ERROR {resp.status_code}: {resp.text[:200]}")
            raise BackboardError(resp.status_code, resp.text)
        
        data = resp.json()
        thread_id = data.get("thread_id") or data.get("id")
        print(f"[BB] OK thread_id={thread_id}")
        return thread_id
    
    async def send_message(
        self, 
        thread_id: str, 
        content: str,
        model: str = "gemini-2.5-flash",
        provider: str = "google",
    ) -> str:
        """Send message to thread. Returns assistant response text."""
        if not content or not content.strip():
            raise BackboardError(400, "Message content cannot be empty")
        
        url = f"{self.base_url}/threads/{thread_id}/messages"
        # FORM DATA - not JSON (non-negotiable)
        form_data = {
            "content": content,
            "stream": "false",
            "memory": "Auto",
            "model": model,
            "provider": provider,
        }
        
        print(f"[BB] POST {url} | model={model} provider={provider} content_len={len(content)}")
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, headers=self.headers, data=form_data)
        
        if resp.status_code != 200:
            print(f"[BB] ERROR {resp.status_code}: {resp.text[:200]}")
            raise BackboardError(resp.status_code, resp.text)
        
        data = resp.json()
        # Parse response: content || text else error
        message = data.get("content") or data.get("text")
        if not message:
            print(f"[BB] WARN no content/text in response: {list(data.keys())}")
            raise BackboardError(500, f"No content in response: {data}")
        
        print(f"[BB] OK response_len={len(message)}")
        return message

