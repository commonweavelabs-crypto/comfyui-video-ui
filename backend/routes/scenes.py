"""Scene management routes — CRUD for scenes (F2, F3, F4) + PATCH, insert, frame/audio upload, generate-audio, feedback."""

from __future__ import annotations

import math
import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel

import store
from config import FRAMES_DIR, AUDIO_DIR
from pipeline import generate_audio_for_scene
from ws_manager import manager

router = APIRouter(prefix="/api/scripts/{script_id}/scenes", tags=["scenes"])


class SceneCreate(BaseModel):
    scene_id: str | None = None
    prompt: str = ""
    duration: int = 14
    frame_filename: str = ""
    frame_id: str = ""
    audio_filename: str = ""
    audio_speaker: str = ""
    narration: str = ""
    status: str = "draft"
    feedback: str = ""
    insert_after: str | None = None


class SceneUpdate(BaseModel):
    scene_id: str | None = None
    prompt: str | None = None
    duration: int | None = None
    frame_filename: str | None = None
    frame_id: str | None = None
    audio_filename: str | None = None
    audio_speaker: str | None = None
    narration: str | None = None
    status: str | None = None
    feedback: str | None = None
    prompt_id: str | None = None
    video_path: str | None = None
    video_filename: str | None = None


class ReorderBody(BaseModel):
    scene_ids: list[str]


# #6: POST /scenes/insert
class InsertBody(BaseModel):
    after_scene_id: str | None = None


def _enrich_scene(script_id: str, scene: dict) -> dict:
    """Add URL fields the frontend expects, derived from backend filenames."""
    from config import FRAMES_DIR, AUDIO_DIR, VIDEOS_DIR
    s = dict(scene)
    # Frame URL
    frame_fn = s.get("frame_filename", "")
    if frame_fn:
        s["initial_frame_url"] = f"/api/frames/file/{frame_fn}"
    else:
        s["initial_frame_url"] = None
    # Audio URL
    audio_fn = s.get("audio_filename", "")
    if audio_fn:
        s["audio_url"] = f"/api/audio/file/{script_id}/{audio_fn}"
    else:
        s["audio_url"] = None
    # Video URL
    video_fn = s.get("video_filename", "") or (s.get("video_path", "") or "")
    if video_fn:
        # Extract just the filename from video_path if needed
        if "/" in video_fn or "\\" in video_fn:
            video_fn = video_fn.replace("\\", "/").split("/")[-1]
        s["video_filename"] = video_fn
        s["video_url"] = f"/api/videos/{script_id}/{video_fn}"
    else:
        s["video_url"] = None
        s["video_filename"] = None
    # B-roll URL
    broll_fn = s.get("broll_filename", "")
    if broll_fn:
        s["broll_url"] = f"/api/broll/file/{broll_fn}"
    else:
        s["broll_url"] = None
    # Ensure broll fields exist with defaults for older scenes
    s.setdefault("broll_filename", "")
    s.setdefault("broll_id", "")
    s.setdefault("broll_volume", 0.0)
    # Map prompt_id -> comfyui_prompt_id
    s["comfyui_prompt_id"] = s.get("prompt_id")
    # Scene number (display order, stored separately from scene_id)
    # scene_id is permanent, scene_number is the display position
    s["scene_number"] = s.get("scene_number", 0)
    if not s["scene_number"]:
        # Fallback: derive from scene_id if scene_number wasn't set
        try:
            s["scene_number"] = int(s.get("scene_id", "0"))
        except (ValueError, TypeError):
            s["scene_number"] = 0
    s["id"] = str(s.get("scene_id", ""))
    s["dialogue"] = s.get("narration", "")
    s["voice_id"] = s.get("audio_speaker", "")
    s["error_message"] = s.get("error", None)
    # Audio duration — probed once at upload, used by the frontend for the
    # "audio will be cropped" submit warning and duration display
    s["audio_duration"] = s.get("audio_duration", None)
    # Render timing fields — pass through if set by poll logic, default to 0/None
    s["render_progress"] = s.get("render_progress", 0)
    s["render_elapsed"] = s.get("render_elapsed", None)
    s["render_estimated_remaining"] = s.get("render_estimated_remaining", None)
    s["render_estimated_total"] = s.get("render_estimated_total", None)
    s["created_at"] = s.get("created", "")
    s["updated_at"] = s.get("updated", "")

    # Render version history — enrich each render with video_url
    renders = s.get("renders", [])
    enriched_renders = []
    for r in renders:
        er = dict(r)
        r_video_fn = r.get("video_filename", "") or (r.get("video_path", "") or "")
        if r_video_fn:
            if "/" in r_video_fn or "\\" in r_video_fn:
                r_video_fn = r_video_fn.replace("\\", "/").split("/")[-1]
            er["video_url"] = f"/api/videos/{script_id}/{r_video_fn}"
        else:
            er["video_url"] = None
        enriched_renders.append(er)
    s["renders"] = enriched_renders
    s["active_render_id"] = s.get("active_render_id", None)

    return s


@router.get("")
async def list_scenes(script_id: str):
    scenes = store.get_scenes(script_id)
    return {"scenes": [_enrich_scene(script_id, s) for s in scenes]}


@router.post("")
async def create_scene(script_id: str, body: SceneCreate):
    if not store.get_script(script_id):
        raise HTTPException(404, "Script not found")
    scene = store.create_scene(script_id, body.model_dump(), insert_after=body.insert_after)
    return _enrich_scene(script_id, scene)


# #6: POST /scenes/insert — insert a new empty scene after the given scene (or at end)
@router.post("/insert")
async def insert_scene(script_id: str, body: InsertBody):
    """Create a new empty scene after ``after_scene_id`` (or at the end if null)."""
    if not store.get_script(script_id):
        raise HTTPException(404, "Script not found")
    scene = store.create_scene(
        script_id,
        {"prompt": "", "narration": "", "status": "draft"},
        insert_after=body.after_scene_id,
    )
    enriched = _enrich_scene(script_id, scene)
    await manager.broadcast({
        "type": "scene_update",
        "script_id": script_id,
        "scene": enriched,
    })
    return enriched


@router.get("/{scene_id}")
async def get_scene(script_id: str, scene_id: str):
    scene = store.get_scene(script_id, scene_id)
    if not scene:
        raise HTTPException(404, "Scene not found")
    return _enrich_scene(script_id, scene)


@router.put("/{scene_id}")
async def update_scene(script_id: str, scene_id: str, body: SceneUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    scene = store.update_scene(script_id, scene_id, updates)
    if not scene:
        raise HTTPException(404, "Scene not found")
    return _enrich_scene(script_id, scene)


# #2: PATCH alias for partial scene updates
@router.patch("/{scene_id}")
async def patch_scene(script_id: str, scene_id: str, body: SceneUpdate):
    """PATCH alias for partial scene updates (same logic as PUT)."""
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    scene = store.update_scene(script_id, scene_id, updates)
    if not scene:
        raise HTTPException(404, "Scene not found")
    return _enrich_scene(script_id, scene)


@router.delete("/{scene_id}")
async def delete_scene(script_id: str, scene_id: str):
    if not store.delete_scene(script_id, scene_id):
        raise HTTPException(404, "Scene not found")
    return {"deleted": True}


@router.post("/reorder")
async def reorder_scenes(script_id: str, body: ReorderBody):
    scenes = store.reorder_scenes(script_id, body.scene_ids)
    return {"scenes": [_enrich_scene(script_id, s) for s in scenes]}


# #7: POST /scenes/{scene_id}/frame — upload initial frame image
@router.post("/{scene_id}/frame")
async def upload_scene_frame(script_id: str, scene_id: str, file: UploadFile = File(...)):
    """Upload an initial frame image for a scene. Saves to data/frames/ and updates scene."""
    scene = store.get_scene(script_id, scene_id)
    if not scene:
        raise HTTPException(404, "Scene not found")
    if not file.filename:
        raise HTTPException(400, "No filename provided")

    FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    dest = FRAMES_DIR / file.filename
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    updated = store.update_scene(script_id, scene_id, {"frame_filename": file.filename})
    enriched = _enrich_scene(script_id, updated)
    await manager.broadcast({
        "type": "scene_update",
        "script_id": script_id,
        "scene": enriched,
    })
    return enriched


# #8: POST /scenes/{scene_id}/audio — upload audio file
@router.post("/{scene_id}/audio")
async def upload_scene_audio(script_id: str, scene_id: str, file: UploadFile = File(...)):
    """Upload an audio file for a scene. Saves to data/audio/{script_id}/ and updates scene."""
    scene = store.get_scene(script_id, scene_id)
    if not scene:
        raise HTTPException(404, "Scene not found")
    if not file.filename:
        raise HTTPException(400, "No filename provided")

    dest_dir = AUDIO_DIR / script_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / file.filename
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Probe real audio duration (audio drives the video length by default)
    audio_duration = None
    try:
        from pipeline import _get_audio_duration
        audio_duration = _get_audio_duration(str(dest))
    except Exception:
        audio_duration = None

    # Auto-adjust duration to the audio length: round UP to the whole second
    # so the video always covers the full audio (e.g. 20.83s -> 21s).
    duration_update = {}
    if audio_duration and audio_duration > 0:
        duration_update = {"duration": max(5, math.ceil(audio_duration))}

    updated = store.update_scene(script_id, scene_id, {
        "audio_filename": file.filename,
        "audio_duration": audio_duration,
        **duration_update,
    })
    enriched = _enrich_scene(script_id, updated)
    await manager.broadcast({
        "type": "scene_update",
        "script_id": script_id,
        "scene": enriched,
    })
    return enriched


# #9: POST /scenes/{scene_id}/generate-audio — generate audio via VoxCPM2
class GenerateAudioBody(BaseModel):
    voice_id: str | None = None


@router.post("/{scene_id}/generate-audio")
async def generate_audio(script_id: str, scene_id: str, body: GenerateAudioBody):
    """Generate audio for a scene via VoxCPM2. Accepts optional voice_id."""
    scene = store.get_scene(script_id, scene_id)
    if not scene:
        raise HTTPException(404, "Scene not found")

    # If voice_id is provided, update the scene's audio_speaker
    if body.voice_id:
        scene = store.update_scene(script_id, scene_id, {"audio_speaker": body.voice_id})
        # Re-fetch updated scene
        scene = store.get_scene(script_id, scene_id)

    # Map stage to SceneStatus for the frontend
    stage_to_status = {"generating": "rendering", "complete": "ready", "error": "error"}
    ws_status = stage_to_status.get("generating", "rendering")

    await manager.broadcast({
        "type": "audio_progress",
        "script_id": script_id,
        "scene_id": scene_id,
        "status": ws_status,
        "message": "Generating audio via VoxCPM2...",
    })

    result = await generate_audio_for_scene(script_id, scene)

    if result.get("success"):
        updated = store.update_scene(script_id, scene_id, {
            "audio_filename": result.get("audio_filename", ""),
            "status": "ready" if scene.get("prompt") else "draft",
        })
        enriched = _enrich_scene(script_id, updated)
        await manager.broadcast({
            "type": "audio_progress",
            "script_id": script_id,
            "scene_id": scene_id,
            "status": "ready",
            "audio_url": enriched.get("audio_url"),
        })
        return enriched
    else:
        await manager.broadcast({
            "type": "audio_progress",
            "script_id": script_id,
            "scene_id": scene_id,
            "status": "error",
            "error": result.get("error"),
        })
        raise HTTPException(500, result.get("error", "Audio generation failed"))


# #10: POST /scenes/{scene_id}/feedback — store feedback
class FeedbackBody(BaseModel):
    feedback: str


@router.post("/{scene_id}/feedback")
async def submit_feedback(script_id: str, scene_id: str, body: FeedbackBody):
    """Store feedback text on the scene and append to the feedback log."""
    scene = store.get_scene(script_id, scene_id)
    if not scene:
        raise HTTPException(404, "Scene not found")

    # Update the scene's feedback field
    updated = store.update_scene(script_id, scene_id, {"feedback": body.feedback})

    # Append to feedback log (F10) — include current prompt
    current_prompt = scene.get("prompt", "")
    store.append_feedback(script_id, scene_id, body.feedback, prompt=current_prompt)

    enriched = _enrich_scene(script_id, updated)
    await manager.broadcast({
        "type": "scene_update",
        "script_id": script_id,
        "scene": enriched,
    })

    return {"success": True}


# ── Render version history endpoints ─────────────────────────────────────────

@router.get("/{scene_id}/renders")
async def list_renders(script_id: str, scene_id: str):
    """List all render versions for a scene."""
    scene = store.get_scene(script_id, scene_id)
    if not scene:
        raise HTTPException(404, "Scene not found")
    enriched = _enrich_scene(script_id, scene)
    return {"renders": enriched.get("renders", []), "active_render_id": enriched.get("active_render_id")}


class SetActiveRenderBody(BaseModel):
    render_id: str


@router.patch("/{scene_id}/active-render")
async def set_active_render(script_id: str, scene_id: str, body: SetActiveRenderBody):
    """Set which render is the active one. Updates video_filename/video_path."""
    scene = store.set_active_render(script_id, scene_id, body.render_id)
    if not scene:
        raise HTTPException(404, "Scene or render not found")
    enriched = _enrich_scene(script_id, scene)
    await manager.broadcast({
        "type": "scene_update",
        "script_id": script_id,
        "scene": enriched,
    })
    return enriched


# ── Render deletion (file hygiene) ──────────────────────────────────────────

@router.delete("/{scene_id}/renders/{render_id}")
async def delete_render(script_id: str, scene_id: str, render_id: str):
    """Delete a specific render version from a scene.

    - Removes the render entry from the scene's renders array.
    - Sends the video file to the Recycle Bin (not permanent delete).
    - If the deleted render was active, switch to the most recent remaining.
    - If no renders remain, set status to "draft" and clear video fields.
    """
    from file_hygiene import send_to_trash
    from config import VIDEOS_DIR

    scenes = store.get_scenes(script_id)
    scene = None
    scene_idx = -1
    for i, s in enumerate(scenes):
        if str(s.get("scene_id")) == str(scene_id):
            scene = s
            scene_idx = i
            break

    if scene is None:
        raise HTTPException(404, "Scene not found")

    renders = scene.get("renders", [])
    target_render = None
    remaining_renders = []
    for r in renders:
        if str(r.get("render_id")) == str(render_id):
            target_render = r
        else:
            remaining_renders.append(r)

    if target_render is None:
        raise HTTPException(404, "Render not found")

    # Send the video file to recycle bin
    video_filename = target_render.get("video_filename", "")
    video_path = target_render.get("video_path", "")
    trash_result = {"skipped": True}
    if video_filename:
        # Try video_path first (may be a full path), then fall back to videos dir
        candidate = None
        if video_path:
            vp = Path(video_path)
            if vp.exists():
                candidate = vp
        if not candidate:
            candidate = VIDEOS_DIR / script_id / video_filename
        if candidate and candidate.exists():
            trash_result = send_to_trash(candidate)

    # Update the scene
    was_active = str(scene.get("active_render_id", "")) == str(render_id)
    updates = {"renders": remaining_renders}

    if len(remaining_renders) == 0:
        # No renders left — reset to draft
        updates["active_render_id"] = None
        updates["video_filename"] = None
        updates["video_path"] = None
        updates["status"] = "draft"
    elif was_active:
        # Switch to the most recent remaining render
        newest = remaining_renders[-1]
        updates["active_render_id"] = newest.get("render_id")
        updates["video_filename"] = newest.get("video_filename", "")
        updates["video_path"] = newest.get("video_path", "")

    updated = store.update_scene(script_id, scene_id, updates)
    enriched = _enrich_scene(script_id, updated)
    await manager.broadcast({
        "type": "scene_update",
        "script_id": script_id,
        "scene": enriched,
    })

    return {
        "success": True,
        "deleted_render_id": render_id,
        "trash_result": trash_result,
        "scene": enriched,
    }