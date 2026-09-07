"""ComfyUI integration routes — submit scenes, poll status, queue (F5, F6) + /status, /poll."""

from __future__ import annotations

import uuid

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import store
from pipeline import (
   check_comfyui_health,
   check_prompt_status,
   compute_scene_timing,
   download_comfyui_output,
   get_average_render_time,
   get_comfyui_history,
   get_comfyui_logs,
   get_comfyui_queue,
   get_gpu_capabilities,
   get_render_timing,
   get_workflow_assets_status,
   list_workflow_slots,
   set_workflow_slot,
   submit_scene_to_comfyui,
)
from ws_manager import manager
from config import COMFYUI_URL

router = APIRouter(prefix="/api/comfyui", tags=["comfyui"])


class SubmitSceneBody(BaseModel):
    script_id: str
    scene_id: str


class SubmitAllBody(BaseModel):
    script_id: str
    only_status: str = "ready"


class PollBody(BaseModel):
    script_id: str


@router.get("/health")
async def health():
    return await check_comfyui_health()


@router.get("/capabilities")
async def capabilities():
    """GPU/VRAM info + long-scene warning threshold for this machine."""
    return await get_gpu_capabilities()


# #3: GET /comfyui/status — frontend-friendly status format
@router.get("/status")
async def status():
    """Return ComfyUI status in the format the frontend expects."""
    health_data = await check_comfyui_health()
    healthy = health_data.get("healthy", False)
    queue_info = health_data.get("queue", {"running": 0, "pending": 0})
    running = queue_info.get("running", 0)
    pending = queue_info.get("pending", 0)

    if not healthy:
        queue_status = "down"
    elif running > 0:
        queue_status = "busy"
    else:
        queue_status = "idle"

    return {
        "connected": healthy,
        "url": COMFYUI_URL,
        "queue_remaining": pending,
        "queue_running": running,
        "queue_status": queue_status,
    }


@router.get("/queue")
async def queue():
    return await get_comfyui_queue()


@router.post("/interrupt")
async def interrupt():
    """Cancel the currently running ComfyUI prompt."""
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.post(f"{COMFYUI_URL}/interrupt")
            return {"success": resp.status_code == 200}
        except Exception as e:
            return {"success": False, "error": str(e)}


@router.post("/cancel")
async def cancel_scene(script_id: str, scene_id: str):
    """Cancel a scene's render — interrupt the running prompt and reset scene status to draft."""
    import store
    scene = store.get_scene(script_id, scene_id)
    if not scene:
        raise HTTPException(404, "Scene not found")

    # Interrupt ComfyUI (cancels current running prompt)
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            await client.post(f"{COMFYUI_URL}/interrupt")
        except Exception:
            pass

    # Reset scene status
    prompt_id = scene.get("prompt_id")
    updated = store.update_scene(script_id, scene_id, {
        "status": "draft",
        "prompt_id": None,
    })
    from routes.scenes import _enrich_scene
    enriched = _enrich_scene(script_id, updated)
    await manager.broadcast({
        "type": "scene_update",
        "script_id": script_id,
        "scene": enriched,
    })
    return {"success": True, "scene": enriched}


@router.get("/history")
async def history(prompt_id: str | None = None):
    return await get_comfyui_history(prompt_id)


@router.get("/status/{prompt_id}")
async def prompt_status(prompt_id: str):
    return await check_prompt_status(prompt_id)


# Render timing endpoint — extract execution_start/success from history
@router.get("/timing/{prompt_id}")
async def render_timing(prompt_id: str):
    """Get render timing for a specific prompt_id from ComfyUI history."""
    return await get_render_timing(prompt_id)


# Average render time — based on historical data
@router.get("/render-stats")
async def render_stats():
    """Get average render time and historical data."""
    return await get_average_render_time()


# Backend log tail — for the frontend log drawer (shown on failure)
@router.get("/logs")
async def comfyui_logs(bytes: int = 20000):
    """Tail of the ComfyUI server log via /internal/logs."""
    return await get_comfyui_logs(tail_bytes=min(max(bytes, 1000), 200000))


# Workflow asset introspection — pre-submit missing-asset check
@router.get("/assets")
async def workflow_assets():
    """Check every model asset the video workflow loads against the live
    ComfyUI + shared model dirs. Frontend dims submit / warns before run."""
    return await get_workflow_assets_status()


# Event-stream health (roadmap #2) — is the native event socket connected?
@router.get("/events/health")
async def event_health():
    import time
    from comfy_events import comfy_events
    return {
        "connected": comfy_events.connected,
        "last_event_age_s": round(time.time() - comfy_events.last_event_ts, 1)
                             if comfy_events.last_event_ts > 0 else None,
    }


# ── Workflow slot editing (roadmap #1) ───────────────────────────────────────

@router.get("/slots")
async def workflow_slots():
    """List parameterizable workflow slots (named fields instead of raw JSON)."""
    return list_workflow_slots()


class SetSlotBody(BaseModel):
    node_id: str
    value: object  # int | float | bool | str — validated by pipeline


@router.post("/slots/set")
async def workflow_set_slot(body: SetSlotBody):
    """Set one workflow slot value (persists to the workflow JSON)."""
    result = set_workflow_slot(body.node_id, body.value)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Slot set failed"))
    return result


# ── ComfyUI output cleanup (file hygiene) ────────────────────────────────────

class CleanupOutputsBody(BaseModel):
    older_than_days: int = 0


@router.post("/cleanup-outputs")
async def cleanup_outputs(body: CleanupOutputsBody | None = None):
    """Clean up files in ComfyUI's output directory.

    Optionally filters by age (older than N days). Sends old outputs to Recycle Bin.
    Returns count and size freed.
    """
    from file_hygiene import cleanup_comfyui_outputs, format_file_size

    days = body.older_than_days if body else 0
    result = cleanup_comfyui_outputs(older_than_days=days)
    return {
        "success": True,
        "total_files": result["total_files"],
        "total_bytes": result["total_bytes"],
        "total_size_formatted": format_file_size(result["total_bytes"]),
        "freed_count": result["freed_count"],
        "freed_bytes": result["freed_bytes"],
        "freed_size_formatted": format_file_size(result["freed_bytes"]),
        "deleted": result["deleted"],
        "error": result.get("error"),
    }


@router.post("/submit")
async def submit_scene(body: SubmitSceneBody):
    """Submit a single scene to ComfyUI."""
    scene = store.get_scene(body.script_id, body.scene_id)
    if not scene:
        raise HTTPException(404, "Scene not found")

    # Save current video to renders array before starting new render
    old_video_filename = scene.get("video_filename")
    old_video_path = scene.get("video_path", "")
    old_prompt_id = scene.get("prompt_id")
    if old_video_filename:
        old_render_entry = {
            "render_id": uuid.uuid4().hex[:12],
            "prompt_id": old_prompt_id,
            "video_filename": old_video_filename,
            "video_path": old_video_path,
            "created": store._now(),
            "duration": scene.get("duration", 0),
            "render_time_seconds": scene.get("render_elapsed"),
        }
        store.add_render_to_scene(body.script_id, body.scene_id, old_render_entry)

    # Update status to queued
    store.update_scene(body.script_id, body.scene_id, {"status": "queued"})

    result = await submit_scene_to_comfyui(scene, body.script_id)

    if result.get("success"):
        # Register for ComfyUI event routing (roadmap #2)
        manager.index_prompt(result["prompt_id"], body.script_id, body.scene_id)
        scene = store.update_scene(body.script_id, body.scene_id, {
            "status": "queued",
            "prompt_id": result["prompt_id"],
        })
        from routes.scenes import _enrich_scene
        await manager.broadcast({
            "type": "scene_update",
            "script_id": body.script_id,
            "scene": _enrich_scene(body.script_id, scene),
        })
    else:
        scene = store.update_scene(body.script_id, body.scene_id, {
            "status": "error",
            "error": result.get("error", "Unknown error"),
        })
        from routes.scenes import _enrich_scene
        await manager.broadcast({
            "type": "scene_update",
            "script_id": body.script_id,
            "scene": _enrich_scene(body.script_id, scene),
        })

    return result


@router.post("/submit-all")
async def submit_all_scenes(body: SubmitAllBody):
    """Submit all scenes with matching status to ComfyUI (one at a time)."""
    scenes = store.get_scenes(body.script_id)
    to_submit = [s for s in scenes if s.get("status") == body.only_status]

    results = []
    for scene in to_submit:
        sid = str(scene["scene_id"])
        # Save current video to renders array before starting new render
        old_video_filename = scene.get("video_filename")
        old_video_path = scene.get("video_path", "")
        old_prompt_id = scene.get("prompt_id")
        if old_video_filename:
            old_render_entry = {
                "render_id": uuid.uuid4().hex[:12],
                "prompt_id": old_prompt_id,
                "video_filename": old_video_filename,
                "video_path": old_video_path,
                "created": store._now(),
                "duration": scene.get("duration", 0),
                "render_time_seconds": scene.get("render_elapsed"),
            }
            store.add_render_to_scene(body.script_id, sid, old_render_entry)

        store.update_scene(body.script_id, sid, {"status": "queued"})
        result = await submit_scene_to_comfyui(scene, body.script_id)

        if result.get("success"):
            # Register for ComfyUI event routing (roadmap #2)
            manager.index_prompt(result["prompt_id"], body.script_id, sid)
            scene = store.update_scene(body.script_id, sid, {
                "status": "queued",
                "prompt_id": result["prompt_id"],
            })
            from routes.scenes import _enrich_scene
            await manager.broadcast({
                "type": "scene_update",
                "script_id": body.script_id,
                "scene": _enrich_scene(body.script_id, scene),
            })
        else:
            scene = store.update_scene(body.script_id, sid, {
                "status": "error",
                "error": result.get("error", "Unknown error"),
            })
            from routes.scenes import _enrich_scene
            await manager.broadcast({
                "type": "scene_update",
                "script_id": body.script_id,
                "scene": _enrich_scene(body.script_id, scene),
            })

        results.append({"scene_id": sid, **result})

    return {"submitted": len(results), "results": results}


# #11: POST /comfyui/poll — poll all scene statuses, download completed videos
@router.post("/poll")
async def poll_scenes(body: PollBody):
    """Poll all scenes for a script. For queued/rendering scenes, check ComfyUI status.
    If complete, download the output video and update the scene."""
    return await _do_poll(body.script_id)


# #11 (frontend variant): GET /comfyui/poll/{script_id} — same as POST /poll
@router.get("/poll/{script_id}")
async def poll_scenes_get(script_id: str):
    """GET variant of /poll for the frontend's pollStatus() call."""
    return await _do_poll(script_id)


async def _do_poll(script_id: str) -> dict:
    """Shared poll logic — check all scenes, download completed videos."""
    scenes = store.get_scenes(script_id)
    updated_scenes = []

    for scene in scenes:
        sid = str(scene.get("scene_id", ""))
        prompt_id = scene.get("prompt_id") or scene.get("comfyui_prompt_id")
        current_status = scene.get("status")

        if prompt_id and current_status in ("queued", "rendering", "unknown"):
            status_result = await check_prompt_status(prompt_id)
            new_status = status_result.get("status", "unknown")

            if new_status == "complete":
                # Download output video(s)
                files = status_result.get("files", [])
                video_filename = None
                video_path = None

                for f in files:
                    # Prefer video extensions
                    fname = f.get("filename", "").lower()
                    if fname.endswith((".mp4", ".webm", ".mov", ".avi", ".mkv", ".gif")) or not video_filename:
                        dl_result = await download_comfyui_output(f, script_id, sid)
                        if dl_result.get("success"):
                            video_filename = dl_result["video_filename"]
                            video_path = dl_result["video_path"]
                            if fname.endswith((".mp4", ".webm", ".mov", ".avi", ".mkv")):
                                break  # Prefer first video file

                # Add new render to renders array
                new_render_id = uuid.uuid4().hex[:12]
                new_render_entry = {
                    "render_id": new_render_id,
                    "prompt_id": prompt_id,
                    "video_filename": video_filename or "",
                    "video_path": video_path or "",
                    "created": store._now(),
                    "duration": scene.get("duration", 0),
                    "render_time_seconds": scene.get("render_elapsed"),
                }
                store.add_render_to_scene(script_id, sid, new_render_entry)

                updates = {
                    "status": "complete",
                    "video_path": video_path or "",
                    "video_filename": video_filename or "",
                    "active_render_id": new_render_id,
                }
                scene = store.update_scene(script_id, sid, updates)
                from routes.scenes import _enrich_scene
                await manager.broadcast({
                    "type": "scene_update",
                    "script_id": script_id,
                    "scene": _enrich_scene(script_id, scene),
                })
            elif new_status == "rendering":
                scene = store.update_scene(script_id, sid, {"status": "rendering"})
                # Compute timing data for rendering scene
                timing = await compute_scene_timing(scene)
                scene.update(timing)
                from routes.scenes import _enrich_scene
                await manager.broadcast({
                    "type": "scene_update",
                    "script_id": script_id,
                    "scene": _enrich_scene(script_id, scene),
                })
            elif new_status in ("error", "lost"):
                # Terminal failure states — mark error so the scene can be
                # resubmitted instead of polling forever (pollable-handle contract).
                scene = store.update_scene(script_id, sid, {
                    "status": "error",
                    "error": status_result.get("error", "Render failed"),
                })
                from routes.scenes import _enrich_scene
                await manager.broadcast({
                    "type": "scene_update",
                    "script_id": script_id,
                    "scene": _enrich_scene(script_id, scene),
                })

        updated_scenes.append(scene or store.get_scene(script_id, sid))

    # Compute timing data for all queued/rendering scenes that weren't already computed above
    for i, s in enumerate(updated_scenes):
        s_status = s.get("status") if s else None
        if s and s_status in ("queued", "rendering") and "render_progress" not in s:
            timing = await compute_scene_timing(s)
            s.update(timing)
            updated_scenes[i] = s

    # Include ComfyUI health in response
    health_data = await check_comfyui_health()
    healthy = health_data.get("healthy", False)
    queue_info = health_data.get("queue", {"running": 0, "pending": 0})
    running = queue_info.get("running", 0)
    pending = queue_info.get("pending", 0)

    if not healthy:
        queue_status = "down"
    elif running > 0:
        queue_status = "busy"
    else:
        queue_status = "idle"

    comfyui_status = {
        "connected": healthy,
        "url": COMFYUI_URL,
        "queue_remaining": pending,
        "queue_running": running,
        "queue_status": queue_status,
    }

    # Enrich scenes with URL fields for frontend
    from routes.scenes import _enrich_scene
    enriched = [_enrich_scene(script_id, s) for s in updated_scenes]
    return {"scenes": enriched, "comfyui": comfyui_status}