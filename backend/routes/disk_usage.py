"""Disk usage route — reports total data directory size and breakdown."""

from __future__ import annotations

from fastapi import APIRouter

from file_hygiene import get_disk_usage_detail, format_file_size

router = APIRouter(prefix="/api", tags=["disk-usage"])


@router.get("/disk-usage")
async def disk_usage():
    """Return disk usage breakdown by category and per-project."""
    detail = get_disk_usage_detail()
    return {
        "total_bytes": detail["total"]["total_bytes"],
        "total_files": detail["total"]["total_files"],
        "total_size_formatted": format_file_size(detail["total"]["total_bytes"]),
        "categories": {
            name: {
                "bytes": info["bytes"],
                "files": info["files"],
                "size_formatted": format_file_size(info["bytes"]),
            }
            for name, info in detail["categories"].items()
        },
        "projects": [
            {
                "script_id": p["script_id"],
                "title": p["title"],
                "total_bytes": p["total_bytes"],
                "file_count": p["file_count"],
                "size_formatted": format_file_size(p["total_bytes"]),
                "breakdown": {
                    k: {**v, "size_formatted": format_file_size(v["bytes"])}
                    for k, v in p["breakdown"].items()
                },
            }
            for p in detail["projects"]
        ],
    }