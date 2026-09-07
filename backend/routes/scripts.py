"""Script management routes — CRUD for scripts (F1) + PATCH, submit, progress, feedback."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import store
from config import SCRIPTS_DIR, SCENES_DIR, VIDEOS_DIR, AUDIO_DIR, FEEDBACK_DIR

router = APIRouter(prefix="/api/scripts", tags=["scripts"])


class ScriptCreate(BaseModel):
    title: str
    content: str = ""
    tags: list[str] = []


class ScriptUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    tags: list[str] | None = None
    status: str | None = None


@router.get("")
async def list_scripts():
    return {"scripts": store.list_scripts()}


# Platform presets — graded against this machine's hardware + model.
# Needed at project CREATION time (before any script exists).
@router.get("/render-presets")
async def render_presets():
    return store.get_graded_presets()


@router.get("/search")
async def search_scripts(q: str):
    return {"results": store.search_scripts(q)}


@router.post("")
async def create_script(body: ScriptCreate):
    entry = store.create_script(body.title, body.content, body.tags)
    # F9: best-effort archive sync
    try:
        store.sync_script_to_archive(entry["script_id"])
    except Exception:
        pass
    return entry


@router.get("/{script_id}")
async def get_script(script_id: str):
    meta = store.get_script(script_id)
    if not meta:
        raise HTTPException(404, "Script not found")
    content = store.get_script_content(script_id) or ""
    return {**meta, "content": content}


@router.put("/{script_id}")
async def update_script(script_id: str, body: ScriptUpdate):
    updated = store.update_script(
        script_id,
        title=body.title,
        content=body.content,
        tags=body.tags,
        status=body.status,
    )
    if not updated:
        raise HTTPException(404, "Script not found")
    # F9: best-effort archive sync
    try:
        store.sync_script_to_archive(script_id)
    except Exception:
        pass
    return updated


# #1: PATCH alias — frontend sends PATCH for partial updates
@router.patch("/{script_id}")
async def patch_script(script_id: str, body: ScriptUpdate):
    """PATCH alias for partial script updates (same logic as PUT)."""
    updated = store.update_script(
        script_id,
        title=body.title,
        content=body.content,
        tags=body.tags,
        status=body.status,
    )
    if not updated:
        raise HTTPException(404, "Script not found")
    try:
        store.sync_script_to_archive(script_id)
    except Exception:
        pass
    return updated


# ── Project render settings (resolution + FPS are PROJECT-level, Gui 2026-09-07) ──

class RenderSettingsBody(BaseModel):
    preset: str  # key from PLATFORM_PRESETS
    width: int | None = None   # only for preset=custom
    height: int | None = None
    fps: int | None = None


@router.get("/{script_id}/render-settings")
async def get_render_settings(script_id: str):
    """Effective render geometry for the project (project preset > template)."""
    if not store.get_script(script_id):
        raise HTTPException(404, "Script not found")
    return {
        "presets": store.PLATFORM_PRESETS,
        "current": store.get_project_render_settings(script_id),
    }


@router.put("/{script_id}/render-settings")
async def set_render_settings(script_id: str, body: RenderSettingsBody):
    """Set the project's resolution + FPS from a platform preset (or custom)."""
    updated = store.set_project_render_settings(
        script_id, body.preset, body.width, body.height, body.fps,
    )
    if updated is None:
        raise HTTPException(404, "Script not found or unknown preset")
    return {
        "render_settings": updated.get("render_settings"),
        "current": store.get_project_render_settings(script_id),
    }


@router.delete("/{script_id}")
async def delete_script(script_id: str):
    """Delete a script and all associated files (sent to Recycle Bin)."""
    from file_hygiene import send_to_trash, send_dir_to_trash, get_project_size, format_file_size

    meta = store.get_script(script_id)
    if not meta:
        raise HTTPException(404, "Script not found")

    # Calculate project size before deletion
    size_info = get_project_size(script_id)
    total_files = size_info["file_count"]
    total_bytes = size_info["total_bytes"]

    # Clean up all associated files — send to recycle bin
    deleted_files = 0
    trash_results = []

    # Videos directory
    vid_dir = VIDEOS_DIR / script_id
    if vid_dir.exists():
        result = send_dir_to_trash(vid_dir)
        trash_results.append({"path": str(vid_dir), **result})
        if result["success"]:
            deleted_files += result.get("file_count", 0)

    # Audio directory
    aud_dir = AUDIO_DIR / script_id
    if aud_dir.exists():
        result = send_dir_to_trash(aud_dir)
        trash_results.append({"path": str(aud_dir), **result})
        if result["success"]:
            deleted_files += result.get("file_count", 0)

    # Scenes JSON file
    scenes_file = SCENES_DIR / f"{script_id}.json"
    if scenes_file.exists():
        result = send_to_trash(scenes_file)
        trash_results.append({"path": str(scenes_file), **result})
        if result["success"]:
            deleted_files += 1

    # Script markdown file
    md_file = SCRIPTS_DIR / f"{script_id}.md"
    if md_file.exists():
        result = send_to_trash(md_file)
        trash_results.append({"path": str(md_file), **result})
        if result["success"]:
            deleted_files += 1

    # Also delete feedback log if exists
    feedback_file = FEEDBACK_DIR / f"{script_id}.jsonl"
    if feedback_file.exists():
        result = send_to_trash(feedback_file)
        trash_results.append({"path": str(feedback_file), **result})
        if result["success"]:
            deleted_files += 1

    # Remove from catalog (in-memory store update)
    store.delete_script(script_id)

    return {
        "deleted": True,
        "script_id": script_id,
        "title": meta.get("title", script_id),
        "files_moved": deleted_files,
        "size_freed": total_bytes,
        "size_freed_formatted": format_file_size(total_bytes),
        "trash_results": trash_results,
    }


# #4: POST /scripts/{id}/submit — trigger pipeline
@router.post("/{script_id}/submit")
async def submit_script(script_id: str):
    """Submit a script to the pipeline. Runs the full LTX pipeline asynchronously."""
    if not store.get_script(script_id):
        raise HTTPException(404, "Script not found")

    job_id = uuid.uuid4().hex[:12]

    # Launch pipeline in background
    from pipeline import run_pipeline_for_script
    from ws_manager import manager

    async def progress_cb(msg):
        store.set_pipeline_progress(
            script_id,
            stage=msg.get("stage", "processing"),
            message=msg.get("message", ""),
            percent=msg.get("percent", 0),
        )
        await manager.broadcast({"type": "pipeline_progress", "script_id": script_id, **msg})

    async def run_bg():
        try:
            store.set_pipeline_progress(script_id, "starting", "Pipeline started", 0)
            result = await run_pipeline_for_script(script_id, progress_callback=progress_cb)
            if result.get("success"):
                store.set_pipeline_progress(script_id, "complete", "Pipeline complete", 100)
            else:
                store.set_pipeline_progress(script_id, "error", result.get("error", "Pipeline failed"), 0)
        except Exception as e:
            store.set_pipeline_progress(script_id, "error", str(e), 0)

    import asyncio
    asyncio.create_task(run_bg())

    return {
        "script_id": script_id,
        "job_id": job_id,
        "status": "processing",
        "message": "Pipeline started",
    }


# #5: GET /scripts/{id}/progress — HTTP fallback for pipeline progress
@router.get("/{script_id}/progress")
async def get_progress(script_id: str):
    """Return the current pipeline progress for a script."""
    return store.get_pipeline_progress(script_id)


# F10: GET /scripts/{id}/feedback — return all feedback for a script
@router.get("/{script_id}/feedback")
async def get_feedback(script_id: str):
    """Return all feedback entries for a script."""
    return {"feedback": store.get_feedback_log(script_id)}