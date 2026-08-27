"""Video serving routes — serve rendered video files from data/videos/ (F5)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from config import VIDEOS_DIR

router = APIRouter(prefix="/api/videos", tags=["videos"])


@router.get("/{script_id}/{filename:path}")
async def serve_video(script_id: str, filename: str):
    """Serve a video file from data/videos/{script_id}/."""
    path = VIDEOS_DIR / script_id / filename
    if not path.exists():
        # Try searching in subdirectories
        search_dir = VIDEOS_DIR / script_id
        if search_dir.exists():
            for candidate in search_dir.rglob(filename):
                path = candidate
                break
    if not path.exists():
        raise HTTPException(404, "Video file not found")
    return FileResponse(str(path), media_type="video/mp4")