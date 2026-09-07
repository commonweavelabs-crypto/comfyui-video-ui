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
        # prompt_id -> (script_id, scene_id) map maintained by scene submissions,
        # so ComfyUI events can be routed to the owning scene without scanning.
        self._prompt_index: dict[str, tuple[str, str]] = {}

    def index_prompt(self, prompt_id: str, script_id: str, scene_id: str) -> None:
        """Register a submitted prompt so events can route to its scene."""
        self._prompt_index[prompt_id] = (script_id, str(scene_id))

    def _find_scene_by_prompt(self, prompt_id: str) -> tuple[str, str] | None:
        """Resolve a prompt_id to (script_id, scene_id). Uses the in-memory index
        first, then falls back to a catalog scan (survives backend restarts)."""
        hit = self._prompt_index.get(prompt_id)
        if hit:
            return hit
        from store import get_scenes, load_catalog
        try:
            for entry in load_catalog().get("scripts", []):
                sid = entry.get("script_id")
                if not sid:
                    continue
                for scene in get_scenes(sid):
                    if scene.get("prompt_id") == prompt_id:
                        self._prompt_index[prompt_id] = (sid, str(scene["scene_id"]))
                        return (sid, str(scene["scene_id"]))
        except Exception:
            pass
        return None

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
        await self._start_event_client()

    async def _start_event_client(self) -> None:
        """Subscribe to ComfyUI's native event socket (roadmap #2).

        Events drive latency-sensitive updates (queue counts, render start/finish,
        errors); the poll loop remains as a reconciler/fallback at a slower cadence.
        """
        from comfy_events import comfy_events
        from routes.scenes import _enrich_scene
        from store import update_scene

        if not comfy_events._handlers:  # register once
            async def on_status(data: dict) -> None:
                st = (data or {}).get("status") or {}
                q = st.get("exec_info", {}).get("queue_remaining", "")
                running = pending = 0
                try:
                    # queue_remaining is a single count in status events; the
                    # authoritative split comes from /queue on transitions.
                    pending = int(q or 0)
                except (TypeError, ValueError):
                    pass
                await self.broadcast({"type": "queue_status", "running": running, "pending": pending})

            async def on_executing(data: dict) -> None:
                pid = (data or {}).get("prompt_id")
                if not pid:
                    return
                hit = self._find_scene_by_prompt(str(pid))
                if not hit:
                    return
                sid, scene_id = hit
                node = (data or {}).get("node")
                scene = next((s for s in __import__("store").get_scenes(sid)
                              if str(s["scene_id"]) == scene_id), None)
                if scene is None:
                    return
                if node is None:
                    # Prompt finished executing — poll once for outputs
                    from pipeline import check_prompt_status
                    result = await check_prompt_status(str(pid))
                    new_status = result.get("status")
                    if new_status in ("complete", "error", "lost"):
                        updated = update_scene(sid, scene_id, {
                            "status": "complete" if new_status == "complete" else "error",
                            **({"error": result.get("error", "Render failed")} if new_status != "complete" else {}),
                            "video_files": result.get("files", []) if new_status == "complete" else [],
                        })
                        await self.broadcast({
                            "type": "scene_update",
                            "script_id": sid,
                            "scene": _enrich_scene(sid, updated),
                        })
                elif scene.get("status") == "queued":
                    # First node started executing -> rendering
                    updated = update_scene(sid, scene_id, {"status": "rendering"})
                    await self.broadcast({
                        "type": "scene_update",
                        "script_id": sid,
                        "scene": _enrich_scene(sid, updated),
                    })

            async def on_execution_error(data: dict) -> None:
                pid = (data or {}).get("prompt_id")
                if not pid:
                    return
                hit = self._find_scene_by_prompt(str(pid))
                if not hit:
                    return
                sid, scene_id = hit
                err = str((data or {}).get("exception_message") or "Execution error")[:300]
                updated = update_scene(sid, scene_id, {"status": "error", "error": err})
                await self.broadcast({
                    "type": "scene_update",
                    "script_id": sid,
                    "scene": _enrich_scene(sid, updated),
                })

            comfy_events.on("status", on_status)
            comfy_events.on("executing", on_executing)
            comfy_events.on("execution_error", on_execution_error)
        await comfy_events.start()

    async def stop_polling(self) -> None:
        self._polling = False
        if self._poll_task:
            self._poll_task.cancel()
            self._poll_task = None
        from comfy_events import comfy_events
        await comfy_events.stop()

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
                            if new_status in ("error", "lost") and new_status != scene.get("status"):
                                # Terminal failure — resolve the scene instead of
                                # polling forever (pollable-handle contract).
                                from store import update_scene
                                from routes.scenes import _enrich_scene
                                updated = update_scene(sid, str(scene["scene_id"]), {
                                    "status": "error",
                                    "error": result.get("error", "Render failed"),
                                })
                                await self.broadcast({
                                    "type": "scene_update",
                                    "script_id": sid,
                                    "scene": _enrich_scene(sid, updated),
                                })
                            elif new_status != scene.get("status"):
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
                                # Still rendering — push timing DELTA only when
                                # values actually changed (roadmap #3: event->UI
                                # push deltas instead of full-state spam).
                                from routes.scenes import _enrich_scene
                                timing = await compute_scene_timing(scene)
                                changed = {
                                    k: v for k, v in timing.items()
                                    if scene.get(k) != v
                                }
                                if changed:
                                    scene.update(timing)
                                    await self.broadcast({
                                        "type": "scene_update",
                                        "script_id": sid,
                                        "scene": _enrich_scene(sid, scene),
                                    })
            except Exception:
                pass

            # Roadmap #2: when the ComfyUI event stream is healthy, events drive
            # updates and the poll loop only reconciles — back off to 15s.
            # When events are down, poll fast (3s) as the fallback path.
            from comfy_events import comfy_events
            await asyncio.sleep(15 if comfy_events.connected else 3)


# Singleton
manager = ConnectionManager()