"""Audio management routes — VoxCPM2 generation, serving files (F8)."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel

import store
from config import AUDIO_DIR
from pipeline import generate_audio_for_scene
from ws_manager import manager

router = APIRouter(prefix="/api/audio", tags=["audio"])


class GenerateAudioBody(BaseModel):
    script_id: str
    scene_id: str


@router.post("/generate")
async def generate_audio(body: GenerateAudioBody):
    """Generate audio via VoxCPM2 for a specific scene."""
    scene = store.get_scene(body.script_id, body.scene_id)
    if not scene:
        raise HTTPException(404, "Scene not found")

    await manager.broadcast({
        "type": "audio_progress",
        "script_id": body.script_id,
        "scene_id": body.scene_id,
        "status": "rendering",
        "message": "Generating audio via VoxCPM2...",
    })

    result = await generate_audio_for_scene(body.script_id, scene)

    if result.get("success"):
        updated = store.update_scene(body.script_id, body.scene_id, {
            "audio_filename": result.get("audio_filename", ""),
            "status": "ready" if scene.get("prompt") else "draft",
        })
        from routes.scenes import _enrich_scene
        enriched = _enrich_scene(body.script_id, updated)
        await manager.broadcast({
            "type": "audio_progress",
            "script_id": body.script_id,
            "scene_id": body.scene_id,
            "status": "ready",
            "audio_url": enriched.get("audio_url"),
        })

    return result


@router.get("/file/{script_id}/{filename:path}")
async def serve_audio(script_id: str, filename: str):
    """Serve an audio file."""
    # Try direct path
    path = AUDIO_DIR / script_id / filename
    if not path.exists():
        # Try nested scene dirs
        for p in (AUDIO_DIR / script_id).rglob(filename):
            path = p
            break
    if not path.exists():
        raise HTTPException(404, "Audio file not found")
    return FileResponse(str(path), media_type="audio/mpeg")


@router.post("/replace")
async def replace_audio(script_id: str, scene_id: str, file: UploadFile = File(...)):
    """Upload a custom audio file to replace generated audio."""
    import store
    scene = store.get_scene(script_id, scene_id)
    if not scene:
        raise HTTPException(404, "Scene not found")

    # Save uploaded file
    audio_dir = AUDIO_DIR / script_id
    audio_dir.mkdir(parents=True, exist_ok=True)
    dest = audio_dir / file.filename
    import shutil
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Update scene
    store.update_scene(script_id, scene_id, {"audio_filename": file.filename})
    return {"success": True, "audio_filename": file.filename}


# ── Voice catalog ──────────────────────────────────────────────────────────

@router.get("/voices")
async def list_voices():
    """List available voices from the voice catalog."""
    from config import SKILL_DATA
    voices_path = SKILL_DATA / "voices_catalog.json"
    if not voices_path.exists():
        return {"voices": []}
    try:
        data = json.loads(voices_path.read_text(encoding="utf-8"))
        voices = data.get("voices", data) if isinstance(data, dict) else data
        # Return simplified voice list for the frontend dropdown
        result = []
        for v in voices:
            result.append({
                "voice_id": v.get("voice_id", ""),
                "display_name": v.get("display_name", v.get("voice_id", "")),
                "description": v.get("description", ""),
                "gender": v.get("traits", {}).get("gender", ""),
                "age_band": v.get("traits", {}).get("age_band", ""),
                "type": v.get("type", ""),
                "tags": v.get("tags", []),
            })
        return {"voices": result}
    except (json.JSONDecodeError, OSError):
        return {"voices": []}