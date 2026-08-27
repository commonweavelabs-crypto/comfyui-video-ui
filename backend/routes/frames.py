"""Reference frame catalog routes (F7)."""

from __future__ import annotations

import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse

from config import FRAMES_DIR
from pipeline import get_reference_frames

router = APIRouter(prefix="/api/frames", tags=["frames"])


@router.get("")
async def list_frames():
    """List all available reference frames."""
    return {"frames": get_reference_frames()}


@router.get("/file/{filename:path}")
async def serve_frame(filename: str):
    """Serve a frame image file."""
    # Search in reference frames dir, frames dir, and ComfyUI input
    from config import REFERENCE_FRAMES_DIR, COMFYUI_INPUT_DIR
    candidates = [
        FRAMES_DIR / filename,
        REFERENCE_FRAMES_DIR / filename,
        COMFYUI_INPUT_DIR / filename,
    ]
    for path in candidates:
        if path.exists():
            return FileResponse(str(path))
    raise HTTPException(404, "Frame not found")


@router.post("/upload")
async def upload_frame(file: UploadFile = File(...)):
    """Upload a new reference frame to the catalog."""
    if not file.filename:
        raise HTTPException(400, "No filename provided")

    dest = FRAMES_DIR / file.filename
    FRAMES_DIR.mkdir(parents=True, exist_ok=True)

    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    return {
        "filename": file.filename,
        "path": str(dest),
        "message": "Frame uploaded successfully",
    }