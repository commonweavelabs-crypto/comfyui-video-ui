"""Configuration constants for the ComfyUI Video Workflow UI backend."""

from __future__ import annotations

from pathlib import Path

# ── Paths ──────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(r"C:\Users\Guilherme\comfyui-video-ui")
DATA_DIR = PROJECT_ROOT / "data"
SCRIPTS_DIR = DATA_DIR / "scripts"
SCENES_DIR = DATA_DIR / "scenes"
FRAMES_DIR = DATA_DIR / "frames"
AUDIO_DIR = DATA_DIR / "audio"
VIDEOS_DIR = DATA_DIR / "videos"
FEEDBACK_DIR = DATA_DIR / "feedback"
MUSIC_DIR = DATA_DIR / "music"        # uploaded/generated music tracks
BROLL_DIR = DATA_DIR / "broll"        # uploaded B-roll clips
EXPORTS_DIR = DATA_DIR / "exports"     # final assembled videos
CATALOG_PATH = DATA_DIR / "catalog.json"

# ── Music generation providers (pluggable) ─────────────────────────────────
MUSIC_PROVIDER_CONFIG = {
    "active_provider": "none",  # "none", "suno", "audiocraft", "custom"
    "providers": {
        "none": {"name": "None", "description": "No music generation model"},
        "suno": {
            "name": "Suno AI",
            "description": "Suno music generation API",
            "endpoint": "",
            "api_key": "",
        },
        "audiocraft": {
            "name": "AudioCraft (MusicGen)",
            "description": "Local MusicGen via ComfyUI or standalone",
            "endpoint": "http://127.0.0.1:8000",
        },
        "custom": {
            "name": "Custom Endpoint",
            "description": "Custom HTTP endpoint for music generation",
            "endpoint": "",
            "api_key": "",
        },
    },
}

# ── Archive destinations (F9) ──────────────────────────────────────────────
OBSIDIAN_ARCHIVE_DIR = Path(
    r"F:\Other computers\My MacBook Air\workspace\projects\cardano\content\working"
)
GOOGLE_DRIVE_SCRIPTS_DIR = Path(
    r"C:\Users\Guilherme\My Drive\Hermes-Shared\ui-projects\scripts"
)

# Frontend static build
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"

# ── ComfyUI ────────────────────────────────────────────────────────────────
COMFYUI_URL = "http://127.0.0.1:8000"
COMFYUI_INPUT_DIR = Path(r"C:\Users\Guilherme\Documents\ComfyUI\input")

# ── Pipeline skill paths ──────────────────────────────────────────────────
SKILL_SCRIPTS = Path(r"C:\Users\Guilherme\AppData\Local\hermes\skills\creative\ltxv-video\scripts")
SKILL_DATA = Path(r"C:\Users\Guilherme\AppData\Local\hermes\skills\creative\ltxv-video\data")
SKILL_WORKFLOWS = Path(r"C:\Users\Guilherme\AppData\Local\hermes\skills\creative\ltxv-video\workflows")
WORKFLOW_PATH = SKILL_WORKFLOWS / "ltx-workflow.json"
FRAMES_CATALOG_PATH = SKILL_DATA / "initial_frames_catalog.json"
SCRIPTS_CATALOG_PATH = SKILL_DATA / "scripts_catalog.json"

# ── Python interpreter (ComfyUI venv — has VoxCPM2) ───────────────────────
COMFYUI_PYTHON = r"C:\Users\Guilherme\Documents\ComfyUI\.venv\Scripts\python.exe"

# ── Reference frames ──────────────────────────────────────────────────────
REFERENCE_FRAMES_DIR = Path(r"C:\Users\Guilherme\Pictures\New folder")

# ── Server ────────────────────────────────────────────────────────────────
HOST = "0.0.0.0"
PORT = 8503

# ── Ensure directories exist ──────────────────────────────────────────────
for d in (SCRIPTS_DIR, SCENES_DIR, FRAMES_DIR, AUDIO_DIR, VIDEOS_DIR, FEEDBACK_DIR,
          MUSIC_DIR, BROLL_DIR, EXPORTS_DIR):
    d.mkdir(parents=True, exist_ok=True)