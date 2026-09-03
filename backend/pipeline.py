"""Pipeline wrapper — bridges the backend to the existing ltxv-video skill scripts."""

from __future__ import annotations

import asyncio
import copy
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import httpx

from config import (
    AUDIO_DIR,
    COMFYUI_INPUT_DIR,
    COMFYUI_PYTHON,
    COMFYUI_URL,
    FRAMES_CATALOG_PATH,
    REFERENCE_FRAMES_DIR,
    SKILL_DATA,
    SKILL_SCRIPTS,
    VIDEOS_DIR,
    WORKFLOW_PATH,
)

# ── ComfyUI health check ───────────────────────────────────────────────────

async def check_comfyui_health() -> dict:
    """Check if ComfyUI is reachable and return system stats."""
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(f"{COMFYUI_URL}/system_stats")
            if resp.status_code == 200:
                stats = resp.json()
                # Also get queue
                queue_resp = await client.get(f"{COMFYUI_URL}/queue")
                queue = queue_resp.json() if queue_resp.status_code == 200 else {}
                running = len(queue.get("queue_running", [])) if isinstance(queue, dict) else 0
                pending = len(queue.get("queue_pending", [])) if isinstance(queue, dict) else 0
                return {
                    "healthy": True,
                    "system_stats": stats,
                    "queue": {"running": running, "pending": pending},
                }
            return {"healthy": False, "error": f"HTTP {resp.status_code}"}
        except Exception as e:
            return {"healthy": False, "error": str(e)}


# ── GPU capabilities / long-scene threshold ──────────────────────────────

# Long-scene thresholds by total VRAM. On cards with limited VRAM the LTXAV
# model (23.8 GB staged) spills over into dynamic offloading above a certain
# scene length — render time increases dramatically (roughly 3x at 16 GB past
# ~15 seconds). Thresholds are conservative: they mark the point where the
# user should expect a big slowdown.
def _long_scene_threshold_for_vram(vram_gb: float) -> int:
    if vram_gb >= 30:
        return 30
    if vram_gb >= 22:
        return 20
    if vram_gb >= 14:
        return 15  # measured: 16 GB cards slow down dramatically past 15s
    return 10


async def get_gpu_capabilities() -> dict:
    """Detect GPU/VRAM from ComfyUI's /system_stats and derive the
    long-scene warning threshold for this machine. Successful detections
    are cached; failures are retried on the next call."""
    global _gpu_capabilities
    if _gpu_capabilities is not None:
        return _gpu_capabilities
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{COMFYUI_URL}/system_stats")
            resp.raise_for_status()
            stats = resp.json()
        devices = stats.get("devices", [])
        gpu_name = None
        vram_gb = None
        if devices:
            dev = devices[0]
            gpu_name = dev.get("name", "Unknown GPU")
            vram_total = dev.get("mem", {}).get("total_vram", 0)  # bytes
            if vram_total and vram_total > 0:
                vram_gb = round(vram_total / (1024 ** 3), 1)
        # Some ComfyUI builds/allocator combos report 0 total VRAM —
        # fall back to nvidia-smi for the real number
        if vram_gb is None:
            vram_gb = _probe_vram_via_nvidia_smi()
        if vram_gb is not None:
            threshold = _long_scene_threshold_for_vram(vram_gb)
            _gpu_capabilities = {
                "gpu_name": gpu_name,
                "vram_total_gb": vram_gb,
                "long_scene_threshold": threshold,
            }
        else:
            # Unknown hardware — use the middle default
            return {
                "gpu_name": gpu_name,
                "vram_total_gb": None,
                "long_scene_threshold": 15,
            }
    except Exception as e:
        return {
            "gpu_name": None,
            "vram_total_gb": None,
            "long_scene_threshold": 15,
            "error": str(e),
        }
    return _gpu_capabilities


def _probe_vram_via_nvidia_smi() -> float | None:
    """Query nvidia-smi for total VRAM (GB) of the first GPU. None on failure."""
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0 and result.stdout.strip():
            mib = float(result.stdout.strip().splitlines()[0])
            return round(mib / 1024, 1)
    except Exception:
        pass
    return None


_gpu_capabilities: dict | None = None

def _load_workflow() -> dict:
    with open(WORKFLOW_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _get_audio_duration(audio_path: str) -> float:
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
             "-of", "csv=p=0", audio_path],
            capture_output=True, text=True, timeout=10
        )
        return float(result.stdout.strip())
    except Exception:
        return 8.0  # fallback


def _get_audio_filename(scene_id: str, speaker: str) -> str:
    sid_str = str(scene_id)
    if len(sid_str) > 1 and any(c.isalpha() for c in sid_str):
        num_part = sid_str[0].zfill(2)
        letter = sid_str[1:]
        return f"scene_{num_part}{letter}_{speaker}.wav"
    try:
        return f"scene_{int(sid_str):02d}_{speaker}.wav"
    except ValueError:
        return f"scene_{sid_str}_{speaker}.wav"


async def submit_scene_to_comfyui(scene: dict, script_id: str) -> dict:
    """Submit a single scene to ComfyUI. Returns {success, prompt_id, error}.

    Audio is optional. If no audio file is provided, a silent audio file of the
    scene's duration is generated so the workflow runs unchanged (video will
    have no sound). The audio input is used for voice selection and lip sync —
    not required for video generation itself.
    """
    workflow = _load_workflow()
    sid = scene.get("scene_id", "")
    speaker = scene.get("audio_speaker", "")
    frame_fn = scene.get("frame_filename", "")
    prompt_text = scene.get("prompt", "")

    # Audio is optional — use provided audio, or generate silent audio
    audio_file = scene.get("audio_filename") or ""
    audio_path = str(AUDIO_DIR / script_id / audio_file) if audio_file else ""

    has_audio = False
    if audio_file and os.path.exists(audio_path):
        has_audio = True
    elif audio_file:
        # Try skill vault path
        vault_audio = SKILL_DATA / "scripts_archive" / script_id / "audio" / audio_file
        if vault_audio.exists():
            audio_path = str(vault_audio)
            has_audio = True

    if not has_audio:
        # No audio provided — generate a silent audio file of the scene's duration
        # The LTX workflow requires an audio input for the audio VAE chain.
        # Silent audio lets the video generate without sound, using the scene's
        # duration field instead of audio duration.
        duration = float(scene.get("duration", 8))
        silent_name = f"silent_{duration}s.wav"
        silent_path = str(AUDIO_DIR / script_id / silent_name)
        AUDIO_DIR.mkdir(parents=True, exist_ok=True)
        (AUDIO_DIR / script_id).mkdir(parents=True, exist_ok=True)

        if not os.path.exists(silent_path):
            subprocess.run([
                "ffmpeg", "-y", "-f", "lavfi",
                "-i", f"anullsrc=r=44100:cl=mono",
                "-t", str(duration),
                "-q:a", "9", "-ac", "1", silent_path
            ], capture_output=True, timeout=15)

        audio_file = silent_name
        audio_path = silent_path

        if not os.path.exists(silent_path):
            return {"success": False, "error": "Failed to generate silent audio for scene without audio input. Please add audio to the scene or ensure ffmpeg is available."}

    duration = _get_audio_duration(audio_path)
    # Honor the scene's duration field: if the user set a duration shorter than
    # the audio, the workflow's TrimAudioDuration node (340:332 reads 340:331)
    # crops the audio — the video renders at the user's chosen length.
    # If duration >= audio length, keep the audio at its full length.
    if scene.get("duration") is not None:
        try:
            requested = float(scene["duration"])
            if 0 < requested < duration:
                duration = requested
        except (TypeError, ValueError):
            pass
    frame_count = int(duration * 24)

    payload = copy.deepcopy(workflow)

    # Apply all fixes from submit-scenes.py
    payload["340:331"]["inputs"]["value"] = duration      # actual duration
    payload["340:323"]["inputs"]["value"] = 24            # 24fps
    if "340:316" in payload and "inputs" in payload["340:316"]:
        payload["340:316"]["inputs"]["temporal_size"] = 2048  # prevent OOM

    payload["269"]["inputs"]["image"] = frame_fn
    payload["276"]["inputs"]["audio"] = audio_file

    payload["340:319"]["inputs"]["value"] = prompt_text    # prompt text
    payload["340:349"]["inputs"]["value"] = False          # use raw prompt, not LTX2 enhancer
    payload["340:305"]["inputs"]["value"] = False          # Image-to-Video: False = USE the initial frame (bypass=False applies image conditioning)

    payload["341"]["inputs"]["filename_prefix"] = f"video/{script_id}_scene_{sid}"

    # Upload frame and audio to ComfyUI input if needed
    await _upload_to_comfyui_input(frame_fn, scene)
    await _upload_audio_to_comfyui(audio_path, audio_file)

    async with httpx.AsyncClient(timeout=30) as client:
        try:
            resp = await client.post(f"{COMFYUI_URL}/prompt", json={"prompt": payload})
            if resp.status_code == 200:
                prompt_id = resp.json().get("prompt_id", "unknown")
                return {"success": True, "prompt_id": prompt_id, "duration": duration, "frame_count": frame_count}
            return {"success": False, "error": f"HTTP {resp.status_code}: {resp.text[:200]}"}
        except Exception as e:
            return {"success": False, "error": str(e)}


async def _upload_to_comfyui_input(frame_filename: str, scene: dict) -> None:
    """Upload the initial frame image to ComfyUI input directory."""
    if not frame_filename:
        return
    # Check if already in input dir
    dest = COMFYUI_INPUT_DIR / frame_filename
    if dest.exists():
        return
    # Try to find in reference frames or frames dir
    from config import FRAMES_DIR
    candidates = [
        REFERENCE_FRAMES_DIR / frame_filename,
        FRAMES_DIR / frame_filename,
    ]
    # Also check by frame_id in catalog
    frame_id = scene.get("frame_id", "")
    if frame_id:
        catalog = _load_frames_catalog()
        for entry in catalog:
            if entry.get("id") == frame_id:
                sp = entry.get("source_path", "")
                if sp:
                    candidates.append(Path(sp))
    for src in candidates:
        if src.exists():
            COMFYUI_INPUT_DIR.mkdir(parents=True, exist_ok=True)
            import shutil
            shutil.copy2(str(src), str(dest))
            return


async def _upload_audio_to_comfyui(audio_path: str, audio_filename: str) -> None:
    """Upload audio to ComfyUI input directory."""
    dest = COMFYUI_INPUT_DIR / audio_filename
    if dest.exists():
        return
    if os.path.exists(audio_path):
        import shutil
        COMFYUI_INPUT_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copy2(audio_path, str(dest))


def _load_frames_catalog() -> list[dict]:
    if FRAMES_CATALOG_PATH.exists():
        try:
            data = json.loads(FRAMES_CATALOG_PATH.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return data
            if isinstance(data, dict) and "frames" in data:
                return data["frames"]
        except (json.JSONDecodeError, OSError):
            pass
    return []


# ── ComfyUI queue / history polling ────────────────────────────────────────

async def get_comfyui_queue() -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(f"{COMFYUI_URL}/queue")
            if resp.status_code == 200:
                queue = resp.json()
                running = len(queue.get("queue_running", [])) if isinstance(queue, dict) else 0
                pending = len(queue.get("queue_pending", [])) if isinstance(queue, dict) else 0
                return {"running": running, "pending": pending, "raw": queue}
            return {"running": 0, "pending": 0, "error": f"HTTP {resp.status_code}"}
        except Exception as e:
            return {"running": 0, "pending": 0, "error": str(e)}


async def get_comfyui_history(prompt_id: str | None = None) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(f"{COMFYUI_URL}/history")
            if resp.status_code != 200:
                return {"error": f"HTTP {resp.status_code}"}
            history = resp.json()
            if prompt_id:
                # Find this prompt_id
                for pid, data in history.items():
                    if pid == prompt_id or pid.startswith(prompt_id[:20]):
                        return {"prompt_id": pid, "data": data}
                return {"prompt_id": prompt_id, "data": None}
            return history
        except Exception as e:
            return {"error": str(e)}


async def check_prompt_status(prompt_id: str) -> dict:
    """Check the status of a submitted prompt. Returns {status, outputs, progress}."""
    # Fetch full history and find our prompt_id directly
    # (get_comfyui_history wraps the response, so we fetch raw history here)
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(f"{COMFYUI_URL}/history")
            if resp.status_code != 200:
                return {"status": "error", "error": f"HTTP {resp.status_code}"}
            history = resp.json()
        except Exception as e:
            return {"status": "error", "error": str(e)}

    for pid, data in history.items():
        if pid == prompt_id or pid.startswith(prompt_id[:20]):
            if not isinstance(data, dict):
                continue
            status_data = data.get("status", {})
            completed = status_data.get("completed", False)
            status_str = str(status_data.get("status_str", "")).lower()
            outputs = data.get("outputs", {})

            # Extract output files
            files = []
            for node_id, node_output in outputs.items():
                if isinstance(node_output, dict):
                    for key, items in node_output.items():
                        if isinstance(items, list):
                            for item in items:
                                if isinstance(item, dict) and "filename" in item:
                                    files.append({
                                        "filename": item["filename"],
                                        "subfolder": item.get("subfolder", ""),
                                        "type": item.get("type", "output"),
                                        "node_id": node_id,
                                    })

            if status_str == "error":
                # Terminal state: the prompt executed and failed. Never report
                # this as "rendering" — that orphans the scene forever.
                return {
                    "status": "error",
                    "prompt_id": pid,
                    "error": _extract_history_error(status_data),
                    "files": files,
                }
            if completed and files:
                return {"status": "complete", "prompt_id": pid, "files": files}
            elif not completed:
                return {"status": "rendering", "prompt_id": pid}
            else:
                return {"status": "complete", "prompt_id": pid, "files": files}

    # Not in history — check if still in queue
    queue = await get_comfyui_queue()
    queue_data = queue.get("raw", {})
    running_items = queue_data.get("queue_running", []) if isinstance(queue_data, dict) else []
    pending_items = queue_data.get("queue_pending", []) if isinstance(queue_data, dict) else []
    
    # Check if OUR prompt is in the running or pending queue
    our_in_running = any(
        item[0] == prompt_id or (isinstance(item, list) and len(item) > 0 and str(item[0]) == prompt_id)
        for item in running_items if isinstance(item, (list, tuple))
    )
    our_in_pending = any(
        item[0] == prompt_id or (isinstance(item, list) and len(item) > 0 and str(item[0]) == prompt_id)
        for item in pending_items if isinstance(item, (list, tuple))
    )
    
    if our_in_running:
        return {"status": "rendering", "prompt_id": prompt_id}
    elif our_in_pending:
        return {"status": "queued", "prompt_id": prompt_id}
    elif queue.get("running", 0) > 0 or queue.get("pending", 0) > 0:
        # Something is in queue but not us — we might have just been picked up
        # or are between history updates. Default to queued, not unknown.
        return {"status": "queued", "prompt_id": prompt_id}
    # Not in history AND not in the queue. This is either (a) ComfyUI was
    # restarted since submit (its history is in-memory), or (b) the prompt
    # was evicted/lost. Polling "queued" forever orphans the scene — surface
    # it as a resolvable lost-state so the caller can offer a resubmit.
    return {
        "status": "lost",
        "prompt_id": prompt_id,
        "error": "Prompt not found in ComfyUI history or queue (server may have restarted since submit). Resubmit to render.",
    }


def _extract_history_error(status_data: dict) -> str:
    """Pull a human-readable error message out of a ComfyUI history status blob."""
    messages = status_data.get("messages") or []
    for msg in messages:
        if isinstance(msg, (list, tuple)) and len(msg) >= 2:
            event, payload = msg[0], msg[1]
            if str(event).lower() == "execution_error" and isinstance(payload, dict):
                node_type = payload.get("node_type", "unknown node")
                err = payload.get("exception_message") or payload.get("error", "")
                return f"{node_type}: {err}"[:300]
    return "Render failed (execution error in ComfyUI history)"


# ── Render timing ──────────────────────────────────────────────────────────

# Baseline: ~6 min (360s) for 14s scenes, ~2.6 min (156s) for 3s scenes.
# Scales linearly with duration. Base rate ≈ 25.7s of render per 1s of video.
_BASE_RATE_PER_SEC = 360.0 / 14.0  # ≈ 25.71

# In-memory cache of completed render durations (scene_duration -> render_time_seconds)
# Updated as scenes finish. Persists to data/render_stats.json for cross-session tracking.
_render_time_cache: list[dict] = []  # [{duration, render_time}]

# Persistent storage path
_RENDER_STATS_FILE = Path(__file__).parent.parent / "data" / "render_stats.json"


def _load_render_stats():
    """Load render time history from persistent JSON file."""
    global _render_time_cache
    if _render_time_cache:
        return  # already loaded
    try:
        if _RENDER_STATS_FILE.exists():
            data = json.loads(_RENDER_STATS_FILE.read_text(encoding="utf-8"))
            _render_time_cache = data.get("render_times", [])
    except Exception:
        pass


def _save_render_stats():
    """Save render time history to persistent JSON file."""
    try:
        _RENDER_STATS_FILE.parent.mkdir(parents=True, exist_ok=True)
        _RENDER_STATS_FILE.write_text(json.dumps({
            "render_times": _render_time_cache[-100:],  # keep last 100
        }, indent=2), encoding="utf-8")
    except Exception:
        pass


# Load persistent render stats on module import
_load_render_stats()


def _estimate_render_time(scene_duration: float) -> float:
    """Estimate render time in seconds based on scene duration.

    Uses historical data if available, otherwise falls back to the baseline rate.
    """
    if not scene_duration or scene_duration <= 0:
        scene_duration = 14.0

    # If we have historical data, compute weighted average
    if _render_time_cache:
        # Weight by similarity to the target duration
        weights = []
        times = []
        for entry in _render_time_cache:
            d = entry["duration"]
            t = entry["render_time"]
            # Weight: inverse distance, clamped
            distance = abs(d - scene_duration)
            w = 1.0 / (1.0 + distance)
            weights.append(w)
            times.append(t)
        total_weight = sum(weights)
        if total_weight > 0:
            return sum(w * t for w, t in zip(weights, times)) / total_weight

    # Fallback: linear scaling from baseline
    return _BASE_RATE_PER_SEC * scene_duration


def _record_render_time(scene_duration: float, render_time: float) -> None:
    """Record a completed render's duration for future estimates. Persists to disk."""
    _render_time_cache.append({"duration": scene_duration, "render_time": render_time})
    # Keep last 100 entries
    if len(_render_time_cache) > 100:
        _render_time_cache.pop(0)
    _save_render_stats()  # persist to disk


async def get_render_timing(prompt_id: str) -> dict:
    """Extract render timing from ComfyUI history for a given prompt_id.

    Returns:
        {
            "execution_start": float | None,   # ms timestamp
            "execution_success": float | None,  # ms timestamp
            "render_duration": float | None,    # seconds (success - start) / 1000
            "elapsed": float | None,            # seconds since start (if still running)
        }
    """
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(f"{COMFYUI_URL}/history")
            if resp.status_code != 200:
                return {"error": f"HTTP {resp.status_code}"}
            history = resp.json()
        except Exception as e:
            return {"error": str(e)}

    import time as _time

    for pid, data in history.items():
        if pid == prompt_id or pid.startswith(prompt_id[:20]):
            if not isinstance(data, dict):
                continue
            status_data = data.get("status", {})
            messages = status_data.get("messages", [])

            exec_start = None
            exec_success = None

            for msg in messages:
                if not isinstance(msg, (list, tuple)) or len(msg) < 2:
                    continue
                msg_type = msg[0]
                msg_data = msg[1]
                if isinstance(msg_data, dict):
                    if msg_type == "execution_start":
                        exec_start = msg_data.get("timestamp")
                    elif msg_type == "execution_success":
                        exec_success = msg_data.get("timestamp")

            render_duration = None
            if exec_start is not None and exec_success is not None:
                render_duration = (exec_success - exec_start) / 1000.0

            elapsed = None
            if exec_start is not None and exec_success is None:
                # Still rendering — compute elapsed
                elapsed = (_time.time() * 1000 - exec_start) / 1000.0

            return {
                "execution_start": exec_start,
                "execution_success": exec_success,
                "render_duration": render_duration,
                "elapsed": elapsed,
            }

    return {
        "execution_start": None,
        "execution_success": None,
        "render_duration": None,
        "elapsed": None,
    }


async def get_average_render_time() -> dict:
    """Return the current average render time based on historical data.

    Returns:
        {
            "average_render_time": float,  # seconds
            "sample_count": int,
            "samples": [{duration, render_time}],
        }
    """
    if _render_time_cache:
        avg = sum(e["render_time"] for e in _render_time_cache) / len(_render_time_cache)
    else:
        avg = _BASE_RATE_PER_SEC * 14.0  # default ~360s

    return {
        "average_render_time": round(avg, 1),
        "sample_count": len(_render_time_cache),
        "samples": list(_render_time_cache),
    }


async def compute_scene_timing(scene: dict) -> dict:
    """Compute timing data for a single scene.

    Returns:
        {
            "render_progress": int,           # 0-100
            "render_elapsed": float | None,    # seconds elapsed since render start
            "render_estimated_remaining": float | None,  # seconds
            "render_estimated_total": float | None,  # seconds
        }
    """
    prompt_id = scene.get("prompt_id") or scene.get("comfyui_prompt_id")
    status = scene.get("status")
    duration = float(scene.get("duration", 14) or 14)

    if not prompt_id or status not in ("queued", "rendering", "unknown"):
        return {
            "render_progress": 0,
            "render_elapsed": None,
            "render_estimated_remaining": None,
            "render_estimated_total": None,
        }

    # Get timing from ComfyUI history
    timing = await get_render_timing(prompt_id)
    render_duration = timing.get("render_duration")
    elapsed = timing.get("elapsed")
    exec_success = timing.get("execution_success")

    # If the render is complete, record it for future estimates
    if render_duration is not None and exec_success is not None:
        _record_render_time(duration, render_duration)

    estimated_total = _estimate_render_time(duration)

    if status == "queued":
        # Queued but not yet rendering
        return {
            "render_progress": 0,
            "render_elapsed": None,
            "render_estimated_remaining": estimated_total,
            "render_estimated_total": estimated_total,
        }

    if status == "rendering":
        if elapsed is not None and estimated_total > 0:
            progress = min(95, int((elapsed / estimated_total) * 100))
            remaining = max(0, estimated_total - elapsed)
        else:
            progress = 0
            remaining = estimated_total

        return {
            "render_progress": progress,
            "render_elapsed": round(elapsed, 1) if elapsed is not None else None,
            "render_estimated_remaining": round(remaining, 1),
            "render_estimated_total": round(estimated_total, 1),
        }

    return {
        "render_progress": 0,
        "render_elapsed": None,
        "render_estimated_remaining": None,
        "render_estimated_total": None,
    }


# ── VoxCPM2 audio generation ──────────────────────────────────────────────

async def generate_audio_for_scene(script_id: str, scene: dict) -> dict:
    """Generate audio via VoxCPM2 by calling the existing pipeline script."""
    sid = str(scene.get("scene_id", ""))
    narration = scene.get("narration", "")
    speaker = scene.get("audio_speaker", "")

    if not narration:
        return {"success": False, "error": "No narration text provided"}

    # Build a temporary scenes file for the legacy mode
    import tempfile
    scenes_txt = Path(tempfile.gettempdir()) / f"comfyui_ui_scenes_{script_id}_{sid}.txt"
    scenes_txt.write_text(f"{sid}|0|{narration}|[pause]|{speaker}\n", encoding="utf-8")

    # Output dir
    output_dir = AUDIO_DIR / script_id
    output_dir.mkdir(parents=True, exist_ok=True)

    # Try vault mode first (if script exists in vault), else legacy mode
    vault_path = SKILL_DATA / "scripts_archive" / script_id
    if vault_path.exists():
        cmd = [COMFYUI_PYTHON, str(SKILL_SCRIPTS / "queue-audio-generation.py"),
               "--script-id", script_id, "--output-dir", str(AUDIO_DIR)]
    else:
        # Legacy mode needs an anchor — use a default if available
        anchor = SKILL_DATA / "voice-catalog" / "charles-hoskinson-anchor.wav"
        if not anchor.exists():
            return {"success": False, "error": "No anchor WAV found for legacy audio generation"}
        cmd = [COMFYUI_PYTHON, str(SKILL_SCRIPTS / "queue-audio-generation.py"),
               str(scenes_txt), str(anchor), script_id, "--output-dir", str(AUDIO_DIR)]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=600)
        stdout_text = stdout.decode("utf-8", errors="replace") if stdout else ""
        stderr_text = stderr.decode("utf-8", errors="replace") if stderr else ""

        if proc.returncode == 0:
            # Find the generated audio file
            audio_filename = _get_audio_filename(sid, speaker)
            audio_path = output_dir / audio_filename
            if not audio_path.exists():
                # Search for it
                for f in output_dir.rglob("*.mp3"):
                    if sid in f.name or "narration" in f.name:
                        audio_path = f
                        audio_filename = f.name
                        break

            return {
                "success": True,
                "audio_filename": audio_filename,
                "audio_path": str(audio_path),
                "stdout": stdout_text[-500:],
            }
        return {
            "success": False,
            "error": stderr_text[-500:] or stdout_text[-500:],
            "stdout": stdout_text[-500:],
        }
    except asyncio.TimeoutError:
        return {"success": False, "error": "Audio generation timed out (600s)"}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        if scenes_txt.exists():
            scenes_txt.unlink(missing_ok=True)


# ── Reference frames catalog ──────────────────────────────────────────────

def get_reference_frames() -> list[dict]:
    """Return reference frames from both the skill catalog and the Pictures folder."""
    frames = []

    # From skill catalog
    catalog = _load_frames_catalog()
    for entry in catalog:
        frames.append({
            "id": entry.get("id", ""),
            "frame_id": entry.get("frame_id", ""),
            "title": entry.get("title", ""),
            "source_path": entry.get("source_path", ""),
            "tags": entry.get("tags", []),
            "vision_result": entry.get("vision_result", ""),
            "ltx_seed_prompt": entry.get("ltx_seed_prompt", ""),
            "character_present": entry.get("character_present", False),
            "shot_type": entry.get("shot_type", ""),
            "windows_status": entry.get("windows_status", ""),
        })

    # From Pictures/New folder/ (character sheets + environment shots)
    if REFERENCE_FRAMES_DIR.exists():
        for f in REFERENCE_FRAMES_DIR.iterdir():
            if f.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp"):
                # Check if already in catalog
                already = any(f.name == Path(e.get("source_path", "")).name for e in frames)
                if not already:
                    frames.append({
                        "id": f.stem,
                        "frame_id": "",
                        "title": f.stem,
                        "source_path": str(f),
                        "tags": ["reference"],
                        "vision_result": "",
                        "ltx_seed_prompt": "",
                        "character_present": None,
                        "shot_type": "",
                        "windows_status": "present",
                    })

    return frames


# ── Full pipeline (script → scenes) ───────────────────────────────────────

async def run_pipeline_for_script(script_id: str, progress_callback=None) -> dict:
    """Run the full LTX pipeline for a script. Calls existing skill scripts."""
    vault_path = SKILL_DATA / "scripts_archive" / script_id

    # Check if the script exists in the vault
    if not vault_path.exists():
        return {"success": False, "error": f"Script {script_id} not found in vault. Import it first."}

    # Try running the integrated pipeline script
    pipeline_script = SKILL_SCRIPTS / "comfyui-integrated-pipeline.py"
    if not pipeline_script.exists():
        pipeline_script = SKILL_SCRIPTS / "pipeline-run.py"

    if pipeline_script.exists():
        cmd = [COMFYUI_PYTHON, str(pipeline_script), "--script-id", script_id]
        try:
            if progress_callback:
                await progress_callback({"stage": "starting", "message": "Starting pipeline..."})

            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=1800)
            stdout_text = stdout.decode("utf-8", errors="replace") if stdout else ""
            stderr_text = stderr.decode("utf-8", errors="replace") if stderr else ""

            if proc.returncode == 0:
                if progress_callback:
                    await progress_callback({"stage": "complete", "message": "Pipeline complete"})
                return {"success": True, "stdout": stdout_text[-1000:]}
            return {"success": False, "error": stderr_text[-1000:] or stdout_text[-1000:]}
        except asyncio.TimeoutError:
            return {"success": False, "error": "Pipeline timed out (30 min)"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    return {"success": False, "error": "Pipeline runner script not found"}


# ── Download ComfyUI output files (F5, #11) ────────────────────────────────

async def download_comfyui_output(file_info: dict, script_id: str, scene_id: str) -> dict:
    """Download an output file from ComfyUI and save it to data/videos/.

    ``file_info`` is the dict from ``check_prompt_status`` → ``files`` list:
    ``{"filename", "subfolder", "type", "node_id"}``.

    Returns ``{"success": bool, "video_filename": str, "video_path": str}``.
    """
    filename = file_info.get("filename", "")
    subfolder = file_info.get("subfolder", "")
    file_type = file_info.get("type", "output")

    if not filename:
        return {"success": False, "error": "No filename in file_info"}

    # ComfyUI /view endpoint: /api/view?filename=...&subfolder=...&type=...
    params: dict[str, Any] = {"filename": filename, "type": file_type}
    if subfolder:
        params["subfolder"] = subfolder

    async with httpx.AsyncClient(timeout=120) as client:
        try:
            resp = await client.get(f"{COMFYUI_URL}/view", params=params)
            if resp.status_code != 200:
                return {"success": False, "error": f"HTTP {resp.status_code}"}
            content_bytes = resp.content
        except Exception as e:
            return {"success": False, "error": str(e)}

    # Save to data/videos/{script_id}/
    dest_dir = VIDEOS_DIR / script_id
    dest_dir.mkdir(parents=True, exist_ok=True)

    # Use a unique filename: scene_{scene_id}_{timestamp}_{original_filename}
    # This ensures re-renders don't overwrite previous versions
    import time as _time
    ts = int(_time.time())
    safe_name = f"scene_{scene_id}_{ts}_{filename}"
    dest_path = dest_dir / safe_name
    dest_path.write_bytes(content_bytes)

    return {
        "success": True,
        "video_filename": safe_name,
        "video_path": str(dest_path),
    }