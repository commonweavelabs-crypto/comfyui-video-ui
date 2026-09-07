"""JSON-file-backed data store for scripts, scenes, and catalog."""

from __future__ import annotations

import json
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from config import (
    CATALOG_PATH,
    SCENES_DIR,
    SCRIPTS_DIR,
    AUDIO_DIR,
    FRAMES_DIR,
    VIDEOS_DIR,
    FEEDBACK_DIR,
    MUSIC_DIR,
    OBSIDIAN_ARCHIVE_DIR,
    GOOGLE_DRIVE_SCRIPTS_DIR,
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return default


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


# ── Catalog (master index) ─────────────────────────────────────────────────

def load_catalog() -> dict:
    return _read_json(CATALOG_PATH, {"scripts": [], "scenes": {}, "frames": []})


def save_catalog(catalog: dict) -> None:
    _write_json(CATALOG_PATH, catalog)


# ── Scripts ────────────────────────────────────────────────────────────────

def list_scripts() -> list[dict]:
    """Return all script metadata entries."""
    catalog = load_catalog()
    return catalog.get("scripts", [])


def get_script(script_id: str) -> dict | None:
    for s in list_scripts():
        if s.get("script_id") == script_id:
            return s
    return None


def get_script_content(script_id: str) -> str | None:
    """Read the markdown content of a script."""
    meta = get_script(script_id)
    if not meta:
        return None
    path = SCRIPTS_DIR / f"{script_id}.md"
    if not path.exists():
        # Fallback: check vault in skill data
        vault_path = Path(r"C:\Users\Guilherme\AppData\Local\hermes\skills\creative\ltxv-video\data\scripts_archive") / script_id / "00-seed.md"
        if vault_path.exists():
            return vault_path.read_text(encoding="utf-8")
        return None
    return path.read_text(encoding="utf-8")


# Platform resolution presets (Gui, 2026-09-07): resolution + FPS are PROJECT-level
# settings, not per-scene. Mixed aspect ratios / frame rates within one video are
# wrong. Presets are labeled by destination so users pick the right one for where
# the video is going.
PLATFORM_PRESETS: dict[str, dict] = {
    "youtube_1080p":  {"label": "YouTube 1080p",        "width": 1920, "height": 1080, "fps": 24, "note": "Standard YouTube horizontal"},
    "youtube_4k":     {"label": "YouTube 4K",           "width": 3840, "height": 2160, "fps": 24, "note": "High-res horizontal — very heavy render"},
    "reels_tiktok":   {"label": "Instagram Reels / TikTok", "width": 1080, "height": 1920, "fps": 30, "note": "Vertical short-form (9:16)"},
    "instagram_feed": {"label": "Instagram Feed",       "width": 1080, "height": 1350, "fps": 30, "note": "IG portrait feed post (4:5)"},
    "square":         {"label": "Square 1:1",           "width": 1080, "height": 1080, "fps": 30, "note": "Feed-neutral, works everywhere"},
    "custom":         {"label": "Custom",               "width": None, "height": None, "fps": None, "note": "Manual size + FPS"},
}


def get_project_render_settings(script_id: str) -> dict:
    """Effective render geometry for a project: project settings > template slots.

    Returns {width, height, fps, preset, source} where source explains which
    layer won (project preset / template default).
    """
    entry = get_script(script_id) or {}
    rs = entry.get("render_settings") or {}

    def _resolve(field: str, default: int) -> tuple[int, str]:
        v = rs.get(field)
        if isinstance(v, int) and v > 0:
            return v, "project"
        # fall back to the workflow template slot values
        try:
            workflow = _load_workflow_public()
            node = {"width": "340:330", "height": "340:324", "fps": "340:323"}[field]
            return int(workflow[node]["inputs"].get("value", default)), "template"
        except Exception:
            return default, "builtin"

    width, wsrc = _resolve("width", 1600)
    height, _ = _resolve("height", 900)
    fps, _ = _resolve("fps", 24)
    return {
        "width": width, "height": height, "fps": fps,
        "preset": rs.get("preset", "custom" if rs else "template"),
        "source": wsrc,
    }


def _load_workflow_public() -> dict:
    return _load_workflow()


def set_project_render_settings(script_id: str, preset: str,
                                width: int | None = None, height: int | None = None,
                                fps: int | None = None) -> dict | None:
    """Set project-level render geometry. For 'custom', width/height/fps are used
    directly; for named presets the preset values fill any gaps."""
    preset_info = PLATFORM_PRESETS.get(preset)
    if preset_info is None:
        return None
    resolved_w = width if (preset == "custom" and width) else (preset_info["width"] or width)
    resolved_h = height if (preset == "custom" and height) else (preset_info["height"] or height)
    resolved_fps = fps if (preset == "custom" and fps) else (preset_info["fps"] or fps)

    catalog = load_catalog()
    for s in catalog.get("scripts", []):
        if s.get("script_id") == script_id:
            s["render_settings"] = {
                "preset": preset,
                "width": int(resolved_w) if resolved_w else None,
                "height": int(resolved_h) if resolved_h else None,
                "fps": int(resolved_fps) if resolved_fps else None,
            }
            s["updated"] = _now()
            save_catalog(catalog)
            return s
    return None


def create_script(title: str, content: str, tags: list[str] | None = None) -> dict:
    script_id = f"{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:8]}"
    entry = {
        "script_id": script_id,
        "title": title,
        "tags": tags or [],
        "status": "draft",
        "created": _now(),
        "updated": _now(),
        "scene_count": 0,
    }
    # Save markdown file
    (SCRIPTS_DIR / f"{script_id}.md").write_text(content, encoding="utf-8")
    # Update catalog
    catalog = load_catalog()
    catalog.setdefault("scripts", []).append(entry)
    save_catalog(catalog)
    return entry


def update_script(script_id: str, title: str | None = None, content: str | None = None,
                   tags: list[str] | None = None, status: str | None = None) -> dict | None:
    catalog = load_catalog()
    scripts = catalog.get("scripts", [])
    for i, s in enumerate(scripts):
        if s.get("script_id") == script_id:
            if title is not None:
                s["title"] = title
            if tags is not None:
                s["tags"] = tags
            if status is not None:
                s["status"] = status
            s["updated"] = _now()
            scripts[i] = s
            catalog["scripts"] = scripts
            save_catalog(catalog)
            if content is not None:
                (SCRIPTS_DIR / f"{script_id}.md").write_text(content, encoding="utf-8")
            return s
    return None


def delete_script(script_id: str) -> bool:
    catalog = load_catalog()
    scripts = catalog.get("scripts", [])
    new_scripts = [s for s in scripts if s.get("script_id") != script_id]
    if len(new_scripts) == len(scripts):
        return False
    catalog["scripts"] = new_scripts
    # Also remove scene mapping
    catalog.get("scenes", {}).pop(script_id, None)
    save_catalog(catalog)
    # Remove files
    md = SCRIPTS_DIR / f"{script_id}.md"
    if md.exists():
        md.unlink()
    scenes_file = SCENES_DIR / f"{script_id}.json"
    if scenes_file.exists():
        scenes_file.unlink()
    return True


def search_scripts(query: str) -> list[dict]:
    q = query.lower()
    results = []
    for s in list_scripts():
        title_match = q in s.get("title", "").lower()
        tag_match = any(q in t.lower() for t in s.get("tags", []))
        # Search content
        content = get_script_content(s["script_id"]) or ""
        content_match = q in content.lower()
        if title_match or tag_match or content_match:
            results.append(s)
    return results


# ── Scenes ─────────────────────────────────────────────────────────────────

def get_scenes(script_id: str) -> list[dict]:
    path = SCENES_DIR / f"{script_id}.json"
    data = _read_json(path, {"scenes": []})
    return data.get("scenes", [])


def save_scenes(script_id: str, scenes: list[dict]) -> None:
    _write_json(SCENES_DIR / f"{script_id}.json", {"scenes": scenes})
    # Update scene count in script metadata
    update_script(script_id, scene_count_override=len(scenes))


def get_scene(script_id: str, scene_id: str) -> dict | None:
    for s in get_scenes(script_id):
        if str(s.get("scene_id")) == str(scene_id):
            return s
    return None


def update_scene(script_id: str, scene_id: str, updates: dict) -> dict | None:
    scenes = get_scenes(script_id)
    for i, s in enumerate(scenes):
        if str(s.get("scene_id")) == str(scene_id):
            s.update(updates)
            s["updated"] = _now()
            scenes[i] = s
            save_scenes(script_id, scenes)
            return s
    return None


MAX_RENDERS_PER_SCENE = 20


def add_render_to_scene(script_id: str, scene_id: str, render_entry: dict) -> dict | None:
    """Append a render version entry to a scene's renders array.

    Keeps at most MAX_RENDERS_PER_SCENE entries (drops oldest on overflow).
    Returns the updated scene, or None if the scene was not found.
    """
    scenes = get_scenes(script_id)
    for i, s in enumerate(scenes):
        if str(s.get("scene_id")) == str(scene_id):
            renders = s.get("renders", [])
            renders.append(render_entry)
            if len(renders) > MAX_RENDERS_PER_SCENE:
                renders = renders[-MAX_RENDERS_PER_SCENE:]
            s["renders"] = renders
            s["updated"] = _now()
            scenes[i] = s
            save_scenes(script_id, scenes)
            return s
    return None


def set_active_render(script_id: str, scene_id: str, render_id: str) -> dict | None:
    """Set the active_render_id on a scene and update video_filename/video_path
    to point to the selected render's video. Returns the updated scene or None.
    """
    scenes = get_scenes(script_id)
    for i, s in enumerate(scenes):
        if str(s.get("scene_id")) == str(scene_id):
            renders = s.get("renders", [])
            target = None
            for r in renders:
                if str(r.get("render_id")) == str(render_id):
                    target = r
                    break
            if not target:
                return None
            s["active_render_id"] = render_id
            s["video_filename"] = target.get("video_filename", "")
            s["video_path"] = target.get("video_path", "")
            s["updated"] = _now()
            scenes[i] = s
            save_scenes(script_id, scenes)
            return s
    return None


def create_scene(script_id: str, scene_data: dict, insert_after: str | None = None) -> dict:
    scenes = get_scenes(script_id)
    new_scene = {
        "scene_id": scene_data.get("scene_id") or _next_scene_id(scenes),
        "prompt": scene_data.get("prompt", ""),
        "duration": scene_data.get("duration", 14),
        "frame_filename": scene_data.get("frame_filename", ""),
        "frame_id": scene_data.get("frame_id", ""),
        "audio_filename": scene_data.get("audio_filename", ""),
        "audio_speaker": scene_data.get("audio_speaker", ""),
        "narration": scene_data.get("narration", ""),
        "status": scene_data.get("status", "draft"),
        "feedback": scene_data.get("feedback", ""),
        "prompt_id": None,
        "video_path": None,
        "broll_filename": scene_data.get("broll_filename", ""),
        "broll_id": scene_data.get("broll_id", ""),
        "broll_volume": scene_data.get("broll_volume", 0.0),
        "created": _now(),
        "updated": _now(),
    }
    if insert_after is not None:
        idx = None
        for i, s in enumerate(scenes):
            if str(s.get("scene_id")) == str(insert_after):
                idx = i + 1
                break
        if idx is not None:
            scenes.insert(idx, new_scene)
        else:
            scenes.append(new_scene)
    else:
        # insert_after=None means insert at the beginning (slot 1)
        scenes.insert(0, new_scene)
    save_scenes(script_id, scenes)
    _renumber_scenes(script_id)
    # Return the renumbered scene (scene_number set correctly by _renumber_scenes)
    for s in get_scenes(script_id):
        if str(s.get("scene_id")) == str(new_scene["scene_id"]):
            return s
    return new_scene  # fallback


def delete_scene(script_id: str, scene_id: str) -> bool:
    scenes = get_scenes(script_id)
    new_scenes = [s for s in scenes if str(s.get("scene_id")) != str(scene_id)]
    if len(new_scenes) == len(scenes):
        return False
    save_scenes(script_id, new_scenes)
    _renumber_scenes(script_id)
    return True


def reorder_scenes(script_id: str, scene_ids: list[str]) -> list[dict]:
    """Reorder scenes by providing the desired order of scene IDs."""
    current = get_scenes(script_id)
    by_id = {str(s["scene_id"]): s for s in current}
    ordered = []
    for sid in scene_ids:
        if sid in by_id:
            ordered.append(by_id[sid])
    # Append any not in the list
    for s in current:
        if str(s["scene_id"]) not in scene_ids:
            ordered.append(s)
    save_scenes(script_id, ordered)
    _renumber_scenes(script_id)
    return get_scenes(script_id)


def _next_scene_id(scenes: list[dict]) -> str:
    """Generate a unique scene_id. Uses sequential integers but skips any already used.
    scene_id is PERMANENT — once assigned, it never changes even if scenes are reordered/deleted."""
    used_ids = set()
    for s in scenes:
        used_ids.add(str(s.get("scene_id", "")))
    
    # Find the lowest unused integer ID
    n = 1
    while str(n) in used_ids:
        n += 1
    return str(n)


def _renumber_scenes(script_id: str) -> None:
    """Update scene_number (display order) sequentially after insert/delete/reorder.
    
    scene_id is now a PERMANENT internal identifier — never renumbered.
    scene_number is the display position (1, 2, 3...) — always sequential.
    This keeps file tracking stable (scene_id links to files) while
    allowing the display order to change freely.
    """
    scenes = get_scenes(script_id)
    for i, s in enumerate(scenes):
        s["scene_number"] = i + 1
    save_scenes(script_id, scenes)


# Patch update_script to support scene_count_override
def update_script(script_id: str, title: str | None = None, content: str | None = None,
                   tags: list[str] | None = None, status: str | None = None,
                   scene_count_override: int | None = None) -> dict | None:
    catalog = load_catalog()
    scripts = catalog.get("scripts", [])
    for i, s in enumerate(scripts):
        if s.get("script_id") == script_id:
            if title is not None:
                s["title"] = title
            if tags is not None:
                s["tags"] = tags
            if status is not None:
                s["status"] = status
            if scene_count_override is not None:
                s["scene_count"] = scene_count_override
            s["updated"] = _now()
            scripts[i] = s
            catalog["scripts"] = scripts
            save_catalog(catalog)
            if content is not None:
                (SCRIPTS_DIR / f"{script_id}.md").write_text(content, encoding="utf-8")
            return s
    return None


# ── Pipeline progress (in-memory, #5) ───────────────────────────────────────

_pipeline_progress: dict[str, dict] = {}
"""Per-script_id progress state: {"stage": str, "message": str, "percent": int}."""


def set_pipeline_progress(script_id: str, stage: str, message: str = "", percent: int = 0) -> None:
    """Update pipeline progress for a script (called from pipeline runner / progress callbacks)."""
    _pipeline_progress[script_id] = {"stage": stage, "message": message, "percent": percent}


def get_pipeline_progress(script_id: str) -> dict:
    """Return the current pipeline progress for a script, or idle default."""
    return _pipeline_progress.get(script_id, {"stage": "idle", "message": "", "percent": 0})


def clear_pipeline_progress(script_id: str) -> None:
    """Remove pipeline progress for a script."""
    _pipeline_progress.pop(script_id, None)


# ── Feedback log (F10) ──────────────────────────────────────────────────────

def append_feedback(script_id: str, scene_id: str, feedback: str, prompt: str = "") -> dict:
    """Append a feedback entry to the JSONL log for a script. Returns the entry."""
    entry = {
        "timestamp": _now(),
        "scene_id": str(scene_id),
        "feedback": feedback,
        "prompt": prompt,
    }
    FEEDBACK_DIR.mkdir(parents=True, exist_ok=True)
    path = FEEDBACK_DIR / f"{script_id}.jsonl"
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    return entry


def get_feedback_log(script_id: str) -> list[dict]:
    """Read all feedback entries for a script from the JSONL log."""
    path = FEEDBACK_DIR / f"{script_id}.jsonl"
    if not path.exists():
        return []
    entries = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            entries.append(json.loads(line))
        except (json.JSONDecodeError, OSError):
            continue
    return entries


# ── Script archive sync (F9) ────────────────────────────────────────────────

def sync_script_to_archive(script_id: str) -> dict:
    """Best-effort copy of script markdown to Obsidian vault and Google Drive.

    Returns a dict with per-destination success/failure info. Never raises.
    """
    result = {"script_id": script_id, "obsidian": False, "google_drive": False}
    content = get_script_content(script_id)
    if content is None:
        result["error"] = "Script not found"
        return result

    meta = get_script(script_id) or {}
    title = meta.get("title", script_id)
    tags = meta.get("tags", [])

    # Build markdown with frontmatter for archive copies
    fm_lines = ["---", f"title: {title}", f"script_id: {script_id}", f"tags: {tags}", f"archived: {_now()}", "---", ""]
    archived_md = "\n".join(fm_lines) + content

    # Obsidian vault
    try:
        OBSIDIAN_ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
        (OBSIDIAN_ARCHIVE_DIR / f"{script_id}.md").write_text(archived_md, encoding="utf-8")
        result["obsidian"] = True
    except Exception:
        pass

    # Google Drive
    try:
        GOOGLE_DRIVE_SCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
        (GOOGLE_DRIVE_SCRIPTS_DIR / f"{script_id}.md").write_text(archived_md, encoding="utf-8")
        result["google_drive"] = True
    except Exception:
        pass

    return result


# ── Music tracks (catalog section "music") ─────────────────────────────────

def list_music_tracks() -> list[dict]:
    """List all music tracks. Returns list of {track_id, filename, title, duration, source, tags, created}."""
    catalog = load_catalog()
    return catalog.get("music", [])


def add_music_track(filename: str, title: str, source: str = "upload",
                    tags: list[str] | None = None, duration: float = 0.0) -> dict:
    """Register a music track in the catalog. Returns the track entry."""
    track_id = uuid.uuid4().hex[:12]
    entry = {
        "track_id": track_id,
        "filename": filename,
        "title": title,
        "duration": duration,
        "source": source,
        "tags": tags or [],
        "created": _now(),
    }
    catalog = load_catalog()
    catalog.setdefault("music", []).append(entry)
    save_catalog(catalog)
    return entry


def delete_music_track(track_id: str) -> bool:
    """Remove a music track from catalog and delete the file."""
    catalog = load_catalog()
    tracks = catalog.get("music", [])
    target = None
    new_tracks = []
    for t in tracks:
        if t.get("track_id") == track_id:
            target = t
        else:
            new_tracks.append(t)
    if target is None:
        return False
    catalog["music"] = new_tracks
    save_catalog(catalog)
    # Delete the file
    filename = target.get("filename", "")
    if filename:
        path = MUSIC_DIR / filename
        if path.exists():
            try:
                path.unlink()
            except OSError:
                pass
    return True


def get_music_track(track_id: str) -> dict | None:
    """Get a single music track by ID."""
    for t in list_music_tracks():
        if t.get("track_id") == track_id:
            return t
    return None


# ── Assembly progress (in-memory, like pipeline progress) ──────────────────

_assembly_progress: dict[str, dict] = {}
"""Per-script_id assembly progress: {"stage": str, "message": str, "percent": int}."""


def set_assembly_progress(script_id: str, stage: str, message: str = "", percent: int = 0) -> None:
    """Store assembly progress for a script (in-memory like pipeline progress)."""
    _assembly_progress[script_id] = {"stage": stage, "message": message, "percent": percent}


def get_assembly_progress(script_id: str) -> dict:
    """Return current assembly progress."""
    return _assembly_progress.get(script_id, {"stage": "idle", "message": "", "percent": 0})


def clear_assembly_progress(script_id: str) -> None:
    """Clear assembly progress."""
    _assembly_progress.pop(script_id, None)


# ── Music provider config (catalog section "music_provider") ──────────────

def get_music_provider_config() -> dict:
    """Return the music provider config from catalog, merged with defaults from config.py."""
    from config import MUSIC_PROVIDER_CONFIG
    catalog = load_catalog()
    stored = catalog.get("music_provider", {})
    # Start from defaults
    merged = {
        "active_provider": stored.get("active_provider", MUSIC_PROVIDER_CONFIG["active_provider"]),
        "providers": {},
    }
    for key, default_cfg in MUSIC_PROVIDER_CONFIG["providers"].items():
        stored_cfg = stored.get("providers", {}).get(key, {})
        # Merge: stored overrides defaults
        merged["providers"][key] = {**default_cfg, **stored_cfg}
    return merged


def save_music_provider_config(config: dict) -> dict:
    """Save the music provider config to catalog. Returns the saved config."""
    catalog = load_catalog()
    catalog["music_provider"] = config
    save_catalog(catalog)
    return config