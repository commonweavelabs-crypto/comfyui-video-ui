"""Export/assembly routes -- assemble completed scenes into a final video using ffmpeg."""

from __future__ import annotations

import asyncio
import shutil
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

import store
from config import VIDEOS_DIR, BROLL_DIR, EXPORTS_DIR, MUSIC_DIR
from ws_manager import manager

router = APIRouter(tags=["export"])


# ── Assembly request model ──────────────────────────────────────────────────

class AssembleBody(BaseModel):
    music_track_id: str | None = None
    music_volume: float = 0.3
    include_broll: bool = True
    output_name: str | None = None
    resolution: str = "1280x720"
    fps: int = 24


# ── Helper: find scene video file ──────────────────────────────────────────

def _find_scene_video(script_id: str, scene: dict) -> Path | None:
    """Find the video file for a scene. Returns Path or None."""
    # Check video_filename first, then video_path
    video_fn = scene.get("video_filename", "")
    video_path_str = scene.get("video_path", "")

    candidates = []
    if video_fn:
        candidates.append(VIDEOS_DIR / script_id / video_fn)
        candidates.append(VIDEOS_DIR / video_fn)
    if video_path_str:
        p = Path(video_path_str)
        candidates.append(p)
        candidates.append(VIDEOS_DIR / script_id / p.name)

    for c in candidates:
        if c.exists():
            return c

    # Last resort: search in videos dir
    search_dir = VIDEOS_DIR / script_id
    if search_dir.exists():
        target_name = video_fn or (Path(video_path_str).name if video_path_str else "")
        if target_name:
            for candidate in search_dir.rglob(target_name):
                if candidate.is_file():
                    return candidate

    return None


# ── Helper: find B-roll file ────────────────────────────────────────────────

def _find_broll_file(broll_filename: str) -> Path | None:
    """Find a B-roll file by filename in BROLL_DIR."""
    if not broll_filename:
        return None
    if not BROLL_DIR.exists():
        return None
    for path in BROLL_DIR.rglob(broll_filename):
        if path.is_file():
            return path
    return None


# ── Helper: run ffmpeg subprocess ───────────────────────────────────────────

async def _run_ffmpeg(args: list[str]) -> tuple[int, str, str]:
    """Run an ffmpeg command as an async subprocess. Returns (returncode, stdout, stderr)."""
    cmd = ["ffmpeg"] + args
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout_data, stderr_data = await proc.communicate()
    stdout_str = stdout_data.decode("utf-8", errors="replace") if stdout_data else ""
    stderr_str = stderr_data.decode("utf-8", errors="replace") if stderr_data else ""
    return proc.returncode, stdout_str, stderr_str


async def _run_ffmpeg_with_progress(args: list[str], stage: str, percent: int,
                                     script_id: str, step_msg: str) -> None:
    """Run ffmpeg and raise on failure with stderr in the message."""
    rc, _stdout, stderr = await _run_ffmpeg(args)
    if rc != 0:
        store.set_assembly_progress(script_id, "error", f"ffmpeg failed: {stderr[-500:]}", percent)
        raise RuntimeError(f"ffmpeg failed (code {rc}): {stderr[-500:]}")


# ── Assembly endpoint ───────────────────────────────────────────────────────

@router.post("/api/scripts/{script_id}/assemble")
async def assemble_video(script_id: str, body: AssembleBody):
    """Assemble all completed scenes into a final video using ffmpeg."""
    # Validate script exists
    if not store.get_script(script_id):
        raise HTTPException(404, "Script not found")

    # Get all scenes
    all_scenes = store.get_scenes(script_id)

    # Filter to completed scenes with video
    completed = []
    for s in all_scenes:
        if s.get("status") != "complete":
            continue
        video = _find_scene_video(script_id, s)
        if video:
            completed.append((s, video))

    if not completed:
        raise HTTPException(400, "No completed scenes to assemble")

    # Sort by scene_number/scene_id
    def scene_sort_key(item):
        s = item[0]
        sid = s.get("scene_id", "0")
        try:
            return (int(sid),)
        except (ValueError, TypeError):
            return (9999, str(sid))

    completed.sort(key=scene_sort_key)

    # Start async assembly in background
    asyncio.create_task(_run_assembly(script_id, body, completed))

    return {
        "script_id": script_id,
        "status": "processing",
        "message": f"Assembly started for {len(completed)} scenes",
        "scene_count": len(completed),
    }


async def _run_assembly(script_id: str, body: AssembleBody,
                        completed: list[tuple[dict, Path]]) -> None:
    """Background task that runs the actual ffmpeg assembly pipeline."""
    try:
        # Prepare output directory
        export_dir = EXPORTS_DIR / script_id
        export_dir.mkdir(parents=True, exist_ok=True)

        output_name = body.output_name or datetime.now().strftime("%Y%m%d-%H%M%S")
        if not output_name.endswith(".mp4"):
            output_name += ".mp4"
        output_path = export_dir / output_name

        # Temp working directory
        work_dir = export_dir / f".tmp_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        work_dir.mkdir(parents=True, exist_ok=True)

        try:
            # Stage 1: preparing
            store.set_assembly_progress(script_id, "preparing",
                                        f"Loading {len(completed)} scenes", 0)

            # Stage 2: normalizing -- re-encode each scene to consistent format
            store.set_assembly_progress(script_id, "normalizing",
                                        "Re-encoding scenes to consistent format", 20)

            normalized_files = []
            total = len(completed)
            for i, (scene, video_path) in enumerate(completed):
                normalized = work_dir / f"scene_{i:04d}.mp4"

                args = [
                    "-y",
                    "-i", str(video_path),
                    "-vf", f"scale={body.resolution}",
                    "-r", str(body.fps),
                    "-c:v", "libx264",
                    "-preset", "fast",
                    "-crf", "20",
                    "-c:a", "aac",
                    "-b:a", "128k",
                    "-ar", "44100",
                    "-ac", "2",
                    str(normalized),
                ]

                # Overlay B-roll if scene has it and include_broll is true
                if body.include_broll:
                    broll_fn = scene.get("broll_filename", "")
                    broll_volume = scene.get("broll_volume", 0.0)
                    broll_path = _find_broll_file(broll_fn) if broll_fn else None
                    if broll_path:
                        # Overlay B-roll with opacity using filter_complex
                        # B-roll scaled to main video size, overlaid with opacity
                        broll_opacity = min(max(broll_volume, 0.0), 1.0) if broll_volume > 0 else 0.5
                        args = [
                            "-y",
                            "-i", str(video_path),
                            "-i", str(broll_path),
                            "-filter_complex",
                            f"[1:v]scale={body.resolution}[broll];"
                            f"[0:v][broll]overlay=0:0:format=auto,"
                            f"[1:a]volume={broll_opacity}[ba];"
                            f"[0:a][ba]amix=inputs=2:duration=first[a]",
                            "-map", "[a]",
                            "-r", str(body.fps),
                            "-c:v", "libx264",
                            "-preset", "fast",
                            "-crf", "20",
                            "-c:a", "aac",
                            "-b:a", "128k",
                            "-ar", "44100",
                            "-ac", "2",
                            str(normalized),
                        ]

                rc, _stdout, stderr = await _run_ffmpeg(args)
                if rc != 0:
                    store.set_assembly_progress(script_id, "error",
                                                f"ffmpeg normalize failed: {stderr[-500:]}", 20)
                    raise RuntimeError(f"ffmpeg normalize failed: {stderr[-500:]}")

                normalized_files.append(normalized)
                # Update progress within normalizing stage
                pct = 20 + int((i + 1) / total * 25)
                store.set_assembly_progress(script_id, "normalizing",
                                            f"Normalized scene {i + 1}/{total}", pct)

            # Stage 3: concatenating
            store.set_assembly_progress(script_id, "concatenating",
                                        "Joining scene videos", 50)

            # Write concat list file
            concat_list = work_dir / "concat.txt"
            with open(concat_list, "w", encoding="utf-8") as f:
                for nf in normalized_files:
                    # ffmpeg concat demuxer needs file paths with forward slashes
                    f.write(f"file '{nf.as_posix()}'\n")

            concat_output = work_dir / "concatenated.mp4"
            rc, _stdout, stderr = await _run_ffmpeg([
                "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", str(concat_list),
                "-c", "copy",
                str(concat_output),
            ])
            if rc != 0:
                # Fallback: re-encode if copy fails (different codecs)
                rc, _stdout, stderr = await _run_ffmpeg([
                    "-y",
                    "-f", "concat",
                    "-safe", "0",
                    "-i", str(concat_list),
                    "-c:v", "libx264",
                    "-preset", "fast",
                    "-crf", "20",
                    "-c:a", "aac",
                    "-b:a", "128k",
                    str(concat_output),
                ])
                if rc != 0:
                    store.set_assembly_progress(script_id, "error",
                                                f"ffmpeg concat failed: {stderr[-500:]}", 50)
                    raise RuntimeError(f"ffmpeg concat failed: {stderr[-500:]}")

            # Stage 4: mixing music (if track provided)
            final_output = concat_output
            if body.music_track_id:
                store.set_assembly_progress(script_id, "mixing_music",
                                            "Adding music track", 75)
                track = store.get_music_track(body.music_track_id)
                if track and track.get("filename"):
                    music_path = MUSIC_DIR / track["filename"]
                    if music_path.exists():
                        music_volume = body.music_volume
                        mixed_output = work_dir / "with_music.mp4"
                        rc, _stdout, stderr = await _run_ffmpeg([
                            "-y",
                            "-i", str(concat_output),
                            "-i", str(music_path),
                            "-filter_complex",
                            f"[1:a]volume={music_volume}[bg];"
                            f"[0:a][bg]amix=inputs=2:duration=first[a]",
                            "-map", "0:v",
                            "-map", "[a]",
                            "-c:v", "copy",
                            "-c:a", "aac",
                            "-b:a", "192k",
                            str(mixed_output),
                        ])
                        if rc != 0:
                            store.set_assembly_progress(script_id, "error",
                                                        f"ffmpeg music mix failed: {stderr[-500:]}", 75)
                            raise RuntimeError(f"ffmpeg music mix failed: {stderr[-500:]}")
                        final_output = mixed_output
                    else:
                        # Music file missing -- skip, continue without music
                        pass
                else:
                    # Track not found -- skip
                    pass

            # Stage 5: finalizing
            store.set_assembly_progress(script_id, "finalizing",
                                        "Writing final output", 90)

            # Move/copy to final output path
            shutil.copy2(str(final_output), str(output_path))

            # Stage 6: complete
            store.set_assembly_progress(script_id, "complete",
                                        f"Export saved as {output_name}", 100)

            await manager.broadcast({
                "type": "assembly_complete",
                "script_id": script_id,
                "output_name": output_name,
            })

        finally:
            # Clean up temp directory
            try:
                shutil.rmtree(str(work_dir), ignore_errors=True)
            except Exception:
                pass

    except Exception as e:
        store.set_assembly_progress(script_id, "error", str(e), 0)
        await manager.broadcast({
            "type": "assembly_error",
            "script_id": script_id,
            "error": str(e),
        })


# ── Assembly progress ───────────────────────────────────────────────────────

@router.get("/api/scripts/{script_id}/assemble/progress")
async def get_assembly_progress(script_id: str):
    """Get assembly progress for a script."""
    return store.get_assembly_progress(script_id)


# ── Export listing and serving ──────────────────────────────────────────────

@router.get("/api/scripts/{script_id}/exports")
async def list_exports(script_id: str):
    """List exported videos for a script."""
    export_dir = EXPORTS_DIR / script_id
    exports = []
    if export_dir.exists():
        for path in sorted(export_dir.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
            if path.is_file() and path.suffix.lower() == ".mp4":
                stat = path.stat()
                exports.append({
                    "filename": path.name,
                    "size": stat.st_size,
                    "created": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    "url": f"/api/scripts/{script_id}/exports/{path.name}",
                })
    return {"exports": exports}


@router.get("/api/scripts/{script_id}/exports/{filename}")
async def serve_export(script_id: str, filename: str):
    """Serve/download an exported video."""
    path = EXPORTS_DIR / script_id / filename
    if not path.exists():
        raise HTTPException(404, "Export not found")
    return FileResponse(str(path), media_type="video/mp4", filename=filename)


@router.delete("/api/scripts/{script_id}/exports/{filename}")
async def delete_export(script_id: str, filename: str):
    """Delete an exported video."""
    path = EXPORTS_DIR / script_id / filename
    if not path.exists():
        raise HTTPException(404, "Export not found")
    try:
        path.unlink()
    except OSError as e:
        raise HTTPException(500, f"Failed to delete: {e}")
    return {"deleted": True, "filename": filename}