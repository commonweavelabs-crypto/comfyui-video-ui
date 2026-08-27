"""B-roll management routes -- list, serve, upload, delete, update for scenes."""

from __future__ import annotations

import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel

import store
from config import BROLL_DIR
from ws_manager import manager

router = APIRouter(tags=["broll"])


# ── B-roll clip listing and serving ─────────────────────────────────────────

@router.get("/api/broll")
async def list_broll():
    """List all B-roll clips by scanning BROLL_DIR recursively."""
    clips = []
    if BROLL_DIR.exists():
        for path in sorted(BROLL_DIR.rglob("*")):
            if path.is_file() and path.suffix.lower() in (".mp4", ".webm", ".mov", ".avi", ".mkv"):
                clips.append({
                    "filename": path.name,
                    "path": str(path.relative_to(BROLL_DIR)).replace("\\", "/"),
                    "size": path.stat().st_size,
                    "broll_url": f"/api/broll/file/{path.name}",
                })
    return {"clips": clips}


@router.get("/api/broll/file/{filename}")
async def serve_broll(filename: str):
    """Serve a B-roll video file by filename."""
    if not BROLL_DIR.exists():
        raise HTTPException(404, "B-roll file not found")
    # Search by filename in all subdirectories
    for path in BROLL_DIR.rglob(filename):
        if path.is_file():
            return FileResponse(str(path), media_type="video/mp4")
    raise HTTPException(404, "B-roll file not found")


# ── Scene B-roll management ─────────────────────────────────────────────────

class BrollUpdate(BaseModel):
    broll_volume: float | None = None
    broll_id: str | None = None
    broll_filename: str | None = None


def _enrich_broll(scene: dict) -> dict:
    """Add broll_url to a scene dict based on broll_filename."""
    s = dict(scene)
    broll_fn = s.get("broll_filename", "")
    if broll_fn:
        s["broll_url"] = f"/api/broll/file/{broll_fn}"
    else:
        s["broll_url"] = None
    # Ensure broll fields exist with defaults for older scenes
    s.setdefault("broll_filename", "")
    s.setdefault("broll_id", "")
    s.setdefault("broll_volume", 0.0)
    return s


@router.post("/api/scripts/{script_id}/scenes/{scene_id}/broll")
async def upload_scene_broll(script_id: str, scene_id: str, file: UploadFile = File(...)):
    """Upload a B-roll video clip for a scene. Saves to BROLL_DIR/{script_id}/ and updates scene."""
    scene = store.get_scene(script_id, scene_id)
    if not scene:
        raise HTTPException(404, "Scene not found")
    if not file.filename:
        raise HTTPException(400, "No filename provided")

    dest_dir = BROLL_DIR / script_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / file.filename
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    updated = store.update_scene(script_id, scene_id, {"broll_filename": file.filename})

    # Use scenes._enrich_scene for full enrichment (same shape as all other WS messages)
    from routes.scenes import _enrich_scene
    enriched = _enrich_scene(script_id, updated)
    await manager.broadcast({
        "type": "scene_update",
        "script_id": script_id,
        "scene": enriched,
    })

    return _enrich_broll(updated)


@router.delete("/api/scripts/{script_id}/scenes/{scene_id}/broll")
async def remove_scene_broll(script_id: str, scene_id: str):
    """Remove B-roll from a scene (does not delete the file)."""
    scene = store.get_scene(script_id, scene_id)
    if not scene:
        raise HTTPException(404, "Scene not found")

    updated = store.update_scene(script_id, scene_id, {
        "broll_filename": "",
        "broll_id": "",
        "broll_volume": 0.0,
    })

    from routes.scenes import _enrich_scene
    enriched = _enrich_scene(script_id, updated)
    await manager.broadcast({
        "type": "scene_update",
        "script_id": script_id,
        "scene": enriched,
    })

    return _enrich_broll(updated)


@router.patch("/api/scripts/{script_id}/scenes/{scene_id}/broll")
async def update_scene_broll(script_id: str, scene_id: str, body: BrollUpdate):
    """Update B-roll settings on a scene (e.g. volume, broll_id)."""
    scene = store.get_scene(script_id, scene_id)
    if not scene:
        raise HTTPException(404, "Scene not found")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updated = store.update_scene(script_id, scene_id, updates)
    return _enrich_broll(updated)