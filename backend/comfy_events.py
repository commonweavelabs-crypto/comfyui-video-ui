"""ComfyUI native WebSocket event client (roadmap #2).

Subscribes to ComfyUI's /ws event socket and turns live events into
scene-status updates, replacing latency-sensitive polling. The 3s poll loop
in ws_manager stays as a fallback/reconciler but backs off to 15s when the
event stream is healthy.

Event contract (ComfyUI):
  {"type": "status",       "data": {"status": {...}, "sid": ...}}
  {"type": "executing",    "data": {"node": "<id>|null", "prompt_id": "..."}}
  {"type": "executed",     "data": {"node": ..., "prompt_id": ..., "output": {...}}}
  {"type": "execution_error", "data": {"prompt_id": ..., "exception_message": ...}}
  {"type": "execution_success", "data": {"prompt_id": ..., ...}}

`executing` with node=null means the prompt finished executing.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
from typing import Any, Callable, Awaitable

import httpx

from config import COMFYUI_URL


class ComfyEventClient:
    """Maintains a persistent event socket to ComfyUI and dispatches callbacks."""

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._running = False
        self.connected = False
        # Handlers: (event_type) -> async fn(data: dict) -> None
        self._handlers: dict[str, list[Callable[[dict], Awaitable[None]]]] = {}
        # Bumped when any event arrives; lets the poll loop see stream health.
        self.last_event_ts: float = 0.0

    def on(self, event_type: str, handler: Callable[[dict], Awaitable[None]]) -> None:
        self._handlers.setdefault(event_type, []).append(handler)

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._run_loop())

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None
        self.connected = False

    async def _run_loop(self) -> None:
        """Reconnecting receiver loop. Exponential backoff when ComfyUI is down."""
        import time
        backoff = 1.0
        while self._running:
            ws_url = COMFYUI_URL.replace("http", "ws", 1) + "/ws?clientId=video-ui-backend"
            try:
                # ComfyUI's /ws speaks standard WebSocket. websockets is present
                # in the ComfyUI venv (verified 17.0.1).
                import websockets

                async with websockets.connect(ws_url, max_size=20 * 1024 * 1024) as ws:
                    self.connected = True
                    backoff = 1.0
                    async for raw in ws:
                        if not self._running:
                            break
                        self.last_event_ts = time.time()
                        try:
                            msg = json.loads(raw)
                        except (TypeError, json.JSONDecodeError):
                            continue  # binary preview frames etc.
                        etype = msg.get("type", "")
                        data = msg.get("data") or {}
                        for handler in self._handlers.get(etype, []):
                            with contextlib.suppress(Exception):
                                await handler(data)
            except asyncio.CancelledError:
                raise
            except Exception:
                self.connected = False
            if not self._running:
                break
            self.connected = False
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30.0)


comfy_events = ComfyEventClient()