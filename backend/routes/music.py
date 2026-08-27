"""Music management routes -- list, serve, upload, delete, generate (pluggable provider)."""

from __future__ import annotations

import shutil

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel

import store
from config import MUSIC_DIR
from ws_manager import manager

router = APIRouter(prefix="/api/music", tags=["music"])


# ── Track listing and serving ───────────────────────────────────────────────

@router.get("")
async def list_music():
    """List all music tracks."""
    tracks = store.list_music_tracks()
    # Add file URLs
    result = []
    for t in tracks:
        t = dict(t)
        if t.get("filename"):
            t["file_url"] = f"/api/music/file/{t['filename']}"
        result.append(t)
    return {"tracks": result}


@router.get("/file/{filename}")
async def serve_music(filename: str):
    """Serve a music file by filename."""
    path = MUSIC_DIR / filename
    if not path.exists():
        raise HTTPException(404, "Music file not found")
    return FileResponse(str(path), media_type="audio/mpeg")


# ── Upload and delete ───────────────────────────────────────────────────────

@router.post("/upload")
async def upload_music(file: UploadFile = File(...), title: str = "", tags: str = ""):
    """Upload a music file. Accepts file, title, and comma-separated tags."""
    if not file.filename:
        raise HTTPException(400, "No filename provided")

    MUSIC_DIR.mkdir(parents=True, exist_ok=True)
    dest = MUSIC_DIR / file.filename
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Parse tags from comma-separated string
    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

    track_title = title or file.filename.rsplit(".", 1)[0]

    track = store.add_music_track(
        filename=file.filename,
        title=track_title,
        source="upload",
        tags=tag_list,
    )

    await manager.broadcast({
        "type": "music_added",
        "track_id": track["track_id"],
        "filename": file.filename,
    })

    result = dict(track)
    result["file_url"] = f"/api/music/file/{file.filename}"
    return result


@router.delete("/{track_id}")
async def delete_music(track_id: str):
    """Delete a music track (removes from catalog and deletes the file)."""
    track = store.get_music_track(track_id)
    if not track:
        raise HTTPException(404, "Track not found")
    if not store.delete_music_track(track_id):
        raise HTTPException(500, "Failed to delete track")
    await manager.broadcast({
        "type": "music_deleted",
        "track_id": track_id,
    })
    return {"deleted": True, "track_id": track_id}


# ── Provider config ─────────────────────────────────────────────────────────

@router.get("/providers")
async def list_providers():
    """List available music generation providers and the active one."""
    config = store.get_music_provider_config()
    return config


class ProviderUpdate(BaseModel):
    active_provider: str | None = None
    providers: dict | None = None


@router.patch("/providers")
async def update_providers(body: ProviderUpdate):
    """Update provider config (which model to use, endpoints, API keys)."""
    current = store.get_music_provider_config()
    if body.active_provider is not None:
        current["active_provider"] = body.active_provider
    if body.providers is not None:
        # Merge into existing providers
        for key, cfg in body.providers.items():
            if key in current.get("providers", {}):
                current["providers"][key].update(cfg)
            else:
                current["providers"][key] = cfg
    store.save_music_provider_config(current)
    return current


# ── Music generation (pluggable) ────────────────────────────────────────────

class GenerateBody(BaseModel):
    prompt: str
    duration: float = 30.0
    provider: str = "active"


@router.post("/generate")
async def generate_music(body: GenerateBody):
    """Generate music via the configured pluggable provider.

    This is a best-effort stub -- the pluggable interface is in place so users
    can configure a provider. For now, returns a clear message if no provider
    is configured.
    """
    config = store.get_music_provider_config()

    # Resolve which provider to use
    provider = body.provider
    if provider == "active":
        provider = config.get("active_provider", "none")

    providers = config.get("providers", {})
    provider_cfg = providers.get(provider, {})

    if provider == "none" or not provider_cfg:
        raise HTTPException(
            400,
            "No music generation provider configured. "
            "Upload music files or configure a provider.",
        )

    # Check if endpoint is configured for providers that need one
    endpoint = provider_cfg.get("endpoint", "")
    if provider in ("suno", "custom") and not endpoint:
        raise HTTPException(
            400,
            f"Provider '{provider}' has no endpoint configured. "
            "Set the endpoint in provider config first.",
        )

    # Audiocraft: submit to ComfyUI with a MusicGen workflow (best-effort)
    if provider == "audiocraft":
        return {
            "status": "submitted",
            "provider": "audiocraft",
            "message": (
                "MusicGen job submitted to ComfyUI endpoint. "
                "Polling support will be added once the workflow is defined."
            ),
            "endpoint": endpoint,
            "prompt": body.prompt,
            "duration": body.duration,
        }

    # Suno or custom: POST to the configured endpoint (best-effort stub)
    if provider in ("suno", "custom"):
        return {
            "status": "submitted",
            "provider": provider,
            "message": (
                f"Music generation request prepared for {provider_cfg.get('name', provider)}. "
                "The HTTP submission to the endpoint is a stub -- wire up the "
                "actual API call once credentials are available."
            ),
            "endpoint": endpoint,
            "prompt": body.prompt,
            "duration": body.duration,
        }

    raise HTTPException(400, f"Unknown provider: {provider}")


@router.get("/{track_id}")
async def get_music(track_id: str):
    """Get a single music track by ID."""
    track = store.get_music_track(track_id)
    if not track:
        raise HTTPException(404, "Track not found")
    result = dict(track)
    if result.get("filename"):
        result["file_url"] = f"/api/music/file/{result['filename']}"
    return result