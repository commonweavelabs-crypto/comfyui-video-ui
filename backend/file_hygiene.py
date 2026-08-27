"""File hygiene utilities — recycle bin support, disk usage calculations.

All user-data deletions go through send2trash (Windows Recycle Bin) so files
are recoverable. If send2trash is not installed, falls back to permanent
delete with a warning logged.
"""

from __future__ import annotations

import os
import shutil
import warnings
from pathlib import Path
from typing import Any

from config import (
    AUDIO_DIR,
    BROLL_DIR,
    DATA_DIR,
    EXPORTS_DIR,
    FEEDBACK_DIR,
    FRAMES_DIR,
    MUSIC_DIR,
    SCENES_DIR,
    SCRIPTS_DIR,
    VIDEOS_DIR,
)

# ── send2trash availability ──────────────────────────────────────────────────

try:
    from send2trash import send2trash as _send2trash

    _HAS_SEND2TRASH = True
except ImportError:
    _send2trash = None
    _HAS_SEND2TRASH = False


# ── Trash helpers ───────────────────────────────────────────────────────────


def send_to_trash(file_path: str | Path) -> dict[str, Any]:
    """Send a single file to the recycle bin.

    Returns ``{"success": bool, "method": "recycle_bin"|"permanent", "path": str}``.
    Falls back to permanent delete with a warning if send2trash is unavailable.
    """
    p = Path(file_path)
    if not p.exists():
        return {"success": False, "method": "skip", "path": str(p), "error": "File does not exist"}

    if _HAS_SEND2TRASH:
        try:
            _send2trash(str(p))
            return {"success": True, "method": "recycle_bin", "path": str(p)}
        except Exception as exc:
            warnings.warn(f"send2trash failed for {p}: {exc} — falling back to permanent delete")
            try:
                p.unlink()
                return {"success": True, "method": "permanent_fallback", "path": str(p)}
            except Exception as exc2:
                return {"success": False, "method": "error", "path": str(p), "error": str(exc2)}
    else:
        warnings.warn("send2trash not installed — permanently deleting file")
        try:
            p.unlink()
            return {"success": True, "method": "permanent", "path": str(p)}
        except Exception as exc:
            return {"success": False, "method": "error", "path": str(p), "error": str(exc)}


def send_dir_to_trash(dir_path: str | Path) -> dict[str, Any]:
    """Send a directory and all its contents to the recycle bin.

    Returns ``{"success": bool, "method": str, "path": str, "file_count": int}``.
    """
    p = Path(dir_path)
    if not p.exists():
        return {"success": False, "method": "skip", "path": str(p), "error": "Directory does not exist", "file_count": 0}

    # Count files inside before trashing
    file_count = sum(1 for _ in p.rglob("*") if _.is_file())

    if _HAS_SEND2TRASH:
        try:
            _send2trash(str(p))
            return {"success": True, "method": "recycle_bin", "path": str(p), "file_count": file_count}
        except Exception as exc:
            warnings.warn(f"send2trash failed for directory {p}: {exc} — falling back to permanent delete")
            try:
                shutil.rmtree(p)
                return {"success": True, "method": "permanent_fallback", "path": str(p), "file_count": file_count}
            except Exception as exc2:
                return {"success": False, "method": "error", "path": str(p), "error": str(exc2), "file_count": 0}
    else:
        warnings.warn("send2trash not installed — permanently deleting directory")
        try:
            shutil.rmtree(p)
            return {"success": True, "method": "permanent", "path": str(p), "file_count": file_count}
        except Exception as exc:
            return {"success": False, "method": "error", "path": str(p), "error": str(exc), "file_count": 0}


# ── Size calculations ────────────────────────────────────────────────────────


def _dir_size(path: Path) -> tuple[int, int]:
    """Return (total_bytes, file_count) for a directory tree."""
    if not path.exists():
        return 0, 0
    total = 0
    count = 0
    for f in path.rglob("*"):
        if f.is_file():
            try:
                total += f.stat().st_size
                count += 1
            except OSError:
                pass
    return total, count


def _file_size(path: Path) -> tuple[int, int]:
    """Return (bytes, 1) for a single file, (0, 0) if missing."""
    if path.exists() and path.is_file():
        try:
            return path.stat().st_size, 1
        except OSError:
            pass
    return 0, 0


def get_project_size(script_id: str) -> dict[str, Any]:
    """Calculate total disk usage for a single project.

    Adds up videos, audio, scenes JSON, and script markdown.
    Returns ``{"script_id": str, "total_bytes": int, "file_count": int, "breakdown": {...}}``.
    """
    breakdown: dict[str, dict[str, int]] = {}

    # Videos
    vid_dir = VIDEOS_DIR / script_id
    vid_bytes, vid_count = _dir_size(vid_dir)
    breakdown["videos"] = {"bytes": vid_bytes, "files": vid_count}

    # Audio
    aud_dir = AUDIO_DIR / script_id
    aud_bytes, aud_count = _dir_size(aud_dir)
    breakdown["audio"] = {"bytes": aud_bytes, "files": aud_count}

    # Scenes JSON
    scenes_file = SCENES_DIR / f"{script_id}.json"
    sc_bytes, sc_count = _file_size(scenes_file)
    breakdown["scenes"] = {"bytes": sc_bytes, "files": sc_count}

    # Script markdown
    script_file = SCRIPTS_DIR / f"{script_id}.md"
    md_bytes, md_count = _file_size(script_file)
    breakdown["script"] = {"bytes": md_bytes, "files": md_count}

    total = sum(v["bytes"] for v in breakdown.values())
    file_count = sum(v["files"] for v in breakdown.values())
    return {
        "script_id": script_id,
        "total_bytes": total,
        "file_count": file_count,
        "breakdown": breakdown,
    }


def get_total_disk_usage() -> dict[str, Any]:
    """Total size of all data directories, with per-category breakdown.

    Returns ``{"total_bytes": int, "total_files": int, "categories": {...}}``.
    """
    categories: dict[str, dict[str, int]] = {}

    for name, dir_path in [
        ("videos", VIDEOS_DIR),
        ("audio", AUDIO_DIR),
        ("frames", FRAMES_DIR),
        ("broll", BROLL_DIR),
        ("music", MUSIC_DIR),
        ("scripts", SCRIPTS_DIR),
        ("scenes", SCENES_DIR),
        ("exports", EXPORTS_DIR),
        ("feedback", FEEDBACK_DIR),
    ]:
        b, c = _dir_size(dir_path)
        categories[name] = {"bytes": b, "files": c}

    total = sum(v["bytes"] for v in categories.values())
    total_files = sum(v["files"] for v in categories.values())
    return {
        "total_bytes": total,
        "total_files": total_files,
        "categories": categories,
    }


def get_disk_usage_detail() -> dict[str, Any]:
    """Full disk usage report: totals, category breakdown, and per-project sizes.

    Returns ``{"total": {...}, "categories": {...}, "projects": [...]}``.
    """
    total_info = get_total_disk_usage()

    # Per-project sizes — derive project IDs from videos/ and audio/ subdirectories
    project_ids: set[str] = set()
    for d in (VIDEOS_DIR, AUDIO_DIR):
        if d.exists():
            for child in d.iterdir():
                if child.is_dir():
                    project_ids.add(child.name)

    # Also include scripts from the catalog
    import store
    for s in store.list_scripts():
        project_ids.add(s.get("script_id", ""))

    project_ids.discard("")

    projects = []
    for pid in sorted(project_ids):
        info = get_project_size(pid)
        # Get title from catalog if available
        meta = store.get_script(pid)
        info["title"] = meta.get("title", pid) if meta else pid
        projects.append(info)

    return {
        "total": {
            "total_bytes": total_info["total_bytes"],
            "total_files": total_info["total_files"],
        },
        "categories": total_info["categories"],
        "projects": projects,
    }


# ── Formatting ───────────────────────────────────────────────────────────────


def format_file_size(num_bytes: int) -> str:
    """Format a byte count into a human-readable string (KB / MB / GB)."""
    if num_bytes < 1024:
        return f"{num_bytes} B"
    elif num_bytes < 1024 * 1024:
        return f"{num_bytes / 1024:.1f} KB"
    elif num_bytes < 1024 * 1024 * 1024:
        return f"{num_bytes / (1024 * 1024):.1f} MB"
    else:
        return f"{num_bytes / (1024 * 1024 * 1024):.2f} GB"


# ── ComfyUI output cleanup ──────────────────────────────────────────────────

COMFYUI_OUTPUT_DIR = Path(r"C:\Users\Guilherme\Documents\ComfyUI\output")


def cleanup_comfyui_outputs(older_than_days: int = 0) -> dict[str, Any]:
    """List and optionally clean files in ComfyUI's output directory.

    Sends files older than ``older_than_days`` to the recycle bin.
    Returns ``{"total_files": int, "total_bytes": int, "deleted": [...], "freed_bytes": int, "freed_count": int}``.
    """
    if not COMFYUI_OUTPUT_DIR.exists():
        return {
            "total_files": 0,
            "total_bytes": 0,
            "deleted": [],
            "freed_bytes": 0,
            "freed_count": 0,
            "error": f"Output directory not found: {COMFYUI_OUTPUT_DIR}",
        }

    import time

    cutoff_time = time.time() - (older_than_days * 86400)
    deleted_entries: list[dict] = []
    total_bytes = 0
    total_files = 0
    freed_bytes = 0

    for f in COMFYUI_OUTPUT_DIR.iterdir():
        if not f.is_file():
            continue
        try:
            stat = f.stat()
            total_bytes += stat.st_size
            total_files += 1
        except OSError:
            continue

        # Check age if filtering
        if older_than_days > 0:
            try:
                if stat.st_mtime > cutoff_time:
                    continue  # File is newer than the cutoff
            except OSError:
                continue

        freed_bytes += stat.st_size
        result = send_to_trash(f)
        deleted_entries.append({
            "filename": f.name,
            "size": stat.st_size,
            "success": result["success"],
            "method": result["method"],
        })

    return {
        "total_files": total_files,
        "total_bytes": total_bytes,
        "deleted": deleted_entries,
        "freed_bytes": freed_bytes,
        "freed_count": len(deleted_entries),
    }