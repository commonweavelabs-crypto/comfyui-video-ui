"""Script storage: versioned scripts with characters and parsed lines (M5a).

Layout:
    data/scripts/{script_id}.md          — legacy raw script (existing projects)
    data/scripts/{script_id}/v{N}.json   — immutable ScriptVersion blobs
    data/scripts/{script_id}/meta.json   — {current_version, linked_projects}

Versioning is copy-on-write:
- A version is immutable once any project links to it.
- Saving an edit to a script whose current version has linked projects
  auto-forks a new version (create_script_version handles this).
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path

from config import SCRIPTS_DIR


def _script_dir(script_id: str) -> Path:
    return SCRIPTS_DIR / script_id


def _versions_dir(script_id: str) -> Path:
    return _script_dir(script_id) / "versions"


def _now() -> str:
    return datetime.now().astimezone().isoformat()


def load_script_meta(script_id: str) -> dict | None:
    """Load the script's meta file (versions + links). None if not a structured script."""
    path = _script_dir(script_id) / "meta.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _save_script_meta(script_id: str, meta: dict) -> None:
    _script_dir(script_id).mkdir(parents=True, exist_ok=True)
    path = _script_dir(script_id) / "meta.json"
    path.write_text(json.dumps(meta, indent=2), encoding="utf-8")


def create_script_version(
    script_id: str,
    title: str,
    raw_text: str,
    parsed: dict,
    speak_direction: bool = False,
) -> dict:
    """Create a new script (version 1) or auto-fork the next version.

    Returns the version blob: {version, title, raw_text, lines, characters,
    speak_direction, created, linked_projects}.
    """
    meta = _script_dir(script_id).exists() and _script_dir(script_id).is_dir()
    versions_dir = _versions_dir(script_id)
    versions_dir.mkdir(parents=True, exist_ok=True)

    existing = sorted(versions_dir.glob("v*.json"))
    if meta and existing:
        current_version = len(existing)
        current = get_script_version(script_id, current_version)
        linked = (current or {}).get("linked_projects", [])
        version = current_version + 1 if linked else current_version
    else:
        version = 1

    blob = {
        "version": version,
        "title": title,
        "raw_text": raw_text,
        "lines": parsed.get("lines", []),
        "characters": parsed.get("characters", []),
        "speak_direction": False,
        "director_voice_id": None,
        "linked_projects": [],
        "created": _now(),
    }
    path = versions_dir / f"v{version}.json"
    path.write_text(json.dumps(blob, indent=2), encoding="utf-8")

    m = load_script_meta(script_id) or {}
    m["script_id"] = script_id
    m["current_version"] = version
    m["title"] = title
    _save_script_meta(script_id, m)
    return blob


def get_script_version(script_id: str, version: int | None = None) -> dict | None:
    """Load a specific version (or the current one)."""
    meta = load_script_meta(script_id)
    if not meta:
        return None
    v = version if version is not None else meta.get("current_version", 1)
    path = _versions_dir(script_id) / f"v{v}.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def update_script_content(script_id: str, title: str | None, raw_text: str,
                          parsed: dict) -> dict:
    """Save an edit. Forks to a new version if the current one has linked projects."""
    meta = load_script_meta(script_id)
    current = get_script_version(script_id)
    has_links = bool(current and current.get("linked_projects"))

    if has_links:
        return create_script_version(script_id, title or current.get("title", ""), raw_text, parsed)

    versions_dir = _versions_dir(script_id)
    versions_dir.mkdir(parents=True, exist_ok=True)
    version = (current or {}).get("version", 1)
    blob = {
        **current,
        "version": version,
        "title": title or (current or {}).get("title", ""),
        "raw_text": raw_text,
        "lines": parsed.get("lines", []),
        "characters": parsed.get("characters", []),
        "updated": _now(),
    }
    # Preserve fields set later (voices, toggles) across content edits
    for k in ("speak_direction", "director_voice_id", "linked_projects", "created"):
        if k not in blob:
            blob[k] = None if k == "director_voice_id" else (False if k == "speak_direction" else [])
    (versions_dir / f"v{version}.json").write_text(json.dumps(blob), encoding="utf-8")
    m = load_script_meta(script_id) or {}
    m["script_id"] = script_id
    m["current_version"] = version
    if title:
        m["title"] = title
    _save_script_meta(script_id, m)
    return blob


def link_project(script_id: str, version: int, project_id: str) -> None:
    """Record that a project was created from this script version."""
    blob = get_script_version(script_id, version)
    if not blob:
        return
    if project_id not in blob.get("linked_projects", []):
        blob.setdefault("linked_projects", []).append(project_id)
        (_versions_dir(script_id) / f"v{version}.json").write_text(
            json.dumps(blob), encoding="utf-8")


def list_script_versions(script_id: str) -> list[dict]:
    """Metadata for all versions (no line bodies)."""
    meta = load_script_meta(script_id)
    if not meta:
        return []
    out = []
    for path in sorted(_versions_dir(script_id).glob("v*.json")):
        try:
            blob = json.loads(path.read_text(encoding="utf-8"))
            out.append({
                "version": blob.get("version"),
                "title": blob.get("title"),
                "created": blob.get("created"),
                "linked_projects": blob.get("linked_projects", []),
                "line_count": len(blob.get("lines", [])),
                "character_count": len(blob.get("characters", [])),
            })
        except (OSError, json.JSONDecodeError):
            continue
    return out


def update_character(script_id: str, version: int, character_id: str,
                     updates: dict) -> dict | None:
    """Update a character's voice/casting info (voice_id, voice_locked, traits)."""
    blob = get_script_version(script_id, version)
    if not blob:
        return None
    for c in blob.get("characters", []):
        if c.get("id") == character_id:
            for k in ("voice_id", "voice_locked", "traits", "type"):
                if k in updates:
                    c[k] = updates[k]
            (_versions_dir(script_id) / f"v{version}.json").write_text(
                json.dumps(blob), encoding="utf-8")
            return c
    return None