"""WebSocket connection manager for live status updates."""

from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    """Manages WebSocket connections and broadcasts status updates."""

    def __init__(self):
        self.active: list[WebSocket] = []
        self._poll_task: asyncio.Task | None = None
        self._polling = False

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket) -> None:
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, message: dict[str, Any]) -> None:
        """Send a message to all connected clients."""
        text = json.dumps(message, ensure_ascii=False)
        dead = []
        for ws in self.active:
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    async def send_to(self, ws: WebSocket, message: dict[str, Any]) -> None:
        """Send a message to a single client."""
        text = json.dumps(message, ensure_ascii=False)
        try:
            await ws.send_text(text)
        except Exception:
            self.disconnect(ws)

    async def start_polling(self) -> None:
        """Start background polling of ComfyUI queue + scene statuses."""
        if self._polling:
            return
        self._polling = True
        self._poll_task = asyncio.create_task(self._poll_loop())

    async def stop_polling(self) -> None:
        self._polling = False
        if self._poll_task:
            self._poll_task.cancel()
            self._poll_task = None

    async def _poll_loop(self) -> None:
        """Poll ComfyUI every 3 seconds and broadcast updates."""
        from pipeline import check_prompt_status, compute_scene_timing, get_comfyui_queue
        from store import get_scenes, load_catalog

        while self._polling:
            try:
                queue = await get_comfyui_queue()
                await self.broadcast({
                    "type": "queue_status",
                    "running": queue.get("running", 0),
                    "pending": queue.get("pending", 0),
                })

                # Check all scenes with prompt_ids for status updates
                catalog = load_catalog()
                for script_entry in catalog.get("scripts", []):
                    sid = script_entry.get("script_id")
                    if not sid:
                        continue
                    scenes = get_scenes(sid)
                    for scene in scenes:
                        pid = scene.get("prompt_id")
                        if pid and scene.get("status") in ("queued", "rendering"):
                            result = await check_prompt_status(pid)
                            new_status = result.get("status")
                            if new_status != scene.get("status"):
                                from store import update_scene
                                from routes.scenes import _enrich_scene
                                updated = update_scene(sid, str(scene["scene_id"]), {
                                    "status": new_status,
                                    "video_files": result.get("files", []),
                                })
                                # Compute timing data for the updated scene
                                timing = await compute_scene_timing(updated)
                                updated.update(timing)
                                await self.broadcast({
                                    "type": "scene_update",
                                    "script_id": sid,
                                    "scene": _enrich_scene(sid, updated),
                                })
                            elif scene.get("status") == "rendering":
                                # Still rendering — update timing data
                                from routes.scenes import _enrich_scene
                                timing = await compute_scene_timing(scene)
                                scene.update(timing)
                                await self.broadcast({
                                    "type": "scene_update",
                                    "script_id": sid,
                                    "scene": _enrich_scene(sid, scene),
                                })
            except Exception:
                pass

            await asyncio.sleep(3)


# Singleton
manager = ConnectionManager()