# ComfyUI Video Workflow UI — Project Manifest

**Created:** 2026-08-21
**Last Updated:** 2026-08-25
**Status:** In Development — Core + B-roll/Music/Assembly Complete, Wizard Integration Pending

---

## Purpose

A clean, modern web UI for the LTX video production pipeline. Replaces ComfyUI's node-based interface with a visual timeline that lets Gui organize, preview, and submit scenes without looking at nodes or wiring.

The UI is the control center for the full pipeline: script → scene breakdown → audio generation (VoxCPM2) → prompt building → ComfyUI submission → video preview → archive.

---

## What It Does When Complete

1. **Upload or write a script** in the UI
2. **Submit to pipeline** — AI breaks the script into 5-15s scenes, generates audio (VoxCPM2), writes visual prompts, and populates scene cards automatically
3. **Review scenes on a horizontal timeline** — each card shows the initial frame, prompt text, audio player, and duration
4. **Edit everything before submission** — swap frames, replace audio, edit prompts, adjust durations, reorder scenes
5. **Insert new scenes** between existing ones with "+" buttons
6. **Submit to ComfyUI** — single scene or all ready scenes at once
7. **Watch live status** — draft → ready → queued → rendering → complete, with WebSocket updates
8. **Video preview swap** — when a render completes, the card's initial frame is replaced with a playable video
9. **Browse reference frames** — character sheets, environment shots, and assign them to scenes
10. **Voice selection** — choose which cloned voice (e.g., Odessa A'zion for Amara) to use per scene
11. **Feedback loop** — write notes on each scene that feed back into the AI pipeline for self-improvement
12. **Archive everything** — scripts, scenes, and renders saved to local storage + Obsidian vault + Google Drive

---

## Architecture

```
Browser (React, port 8502)
    ↕ Vite proxy /api → localhost:8503
    ↕ WebSocket /ws → localhost:8503
FastAPI Backend (Python, port 8503)
    ├── REST API (32 endpoints)
    ├── WebSocket (live status updates)
    ├── Pipeline scripts (ltxv-video skill)
    ├── VoxCPM2 (ComfyUI venv — voice cloning + TTS)
    ├── ComfyUI API (localhost:8000, LTX 2.3 model)
    └── JSON file storage (data/)
```

### Tech Stack
- **Frontend:** React + Vite + Tailwind CSS v4 (`@tailwindcss/vite` plugin)
- **Backend:** FastAPI + uvicorn + WebSocket
- **Python venv:** `C:\Users\Guilherme\Documents\ComfyUI\.venv` (shared with ComfyUI)
- **ComfyUI:** localhost:8000 (LTX 2.3 22B model, RTX 5070 Ti 16GB VRAM)

### Directory Structure
```
C:\Users\Guilherme\comfyui-video-ui\
├── frontend/                 # React + Vite + Tailwind v4 (port 8502)
│   ├── src/
│   │   ├── App.tsx            # Main app, state, WebSocket, polling
│   │   ├── api.ts             # API client (scripts, scenes, comfyui, frames, audio, videos)
│   │   ├── types.ts           # TypeScript types + STATUS_META
│   │   └── components/
│   │       ├── Header.tsx          # Top bar with ComfyUI status
│   │       ├── ScriptLibrary.tsx  # Script browser + create
│   │       ├── Timeline.tsx       # Horizontal scrollable scene timeline
│   │       ├── SceneCard.tsx      # Scene card with prompt, audio, frame, video, feedback
│   │       ├── FrameCatalog.tsx   # Reference frame browser + assign
│   │       ├── AudioPlayer.tsx    # Audio player with waveform
│   │       └── ErrorBoundary.tsx  # Error boundary (prevents black screen)
│   ├── package.json
│   └── vite.config.ts
├── backend/                  # FastAPI (port 8503)
│   ├── main.py               # App, routes, WebSocket, static serving
│   ├── config.py             # Paths, ports, constants
│   ├── store.py               # JSON file data store
│   ├── pipeline.py            # ComfyUI API, VoxCPM2, frame catalog, pipeline runner
│   ├── ws_manager.py          # WebSocket manager + background polling
│   ├── routes/
│   │   ├── scripts.py         # Script CRUD + submit + progress + feedback log
│   │   ├── scenes.py          # Scene CRUD + insert + frame/audio upload + generate-audio + feedback
│   │   ├── comfyui.py         # ComfyUI submit/poll/queue/status/history
│   │   ├── audio.py           # VoxCPM2 generation + file serving
│   │   ├── frames.py          # Reference frame catalog + upload + serving
│   │   └── videos.py          # Video file serving (completed renders)
│   └── requirements.txt
├── data/                     # JSON storage
│   ├── scripts/               # Script markdown files
│   ├── scenes/                # Scene JSON data
│   ├── frames/                # Uploaded reference frames
│   ├── audio/                 # Generated audio files
│   ├── videos/                # Completed video renders
│   └── feedback/              # Feedback JSONL logs
└── reference/                # Old comfyui-video-queue-react (design reference)
```

---

## Features — Status Matrix

| # | Feature | Backend | Frontend | Status | Notes |
|---|---------|---------|----------|--------|-------|
| F1 | Script Management | DONE | DONE | WORKING | Create, browse, select, search scripts |
| F2 | Scene Breakdown (pipeline) | DONE | DONE | WORKING | Submit to pipeline, progress tracking. Requires script in vault for full pipeline |
| F3 | Timeline / Scene Cards | DONE | DONE | WORKING | Horizontal scroll, drag-to-scroll, snap-x, status badges |
| F4 | Insert Scene (+ buttons) | DONE | DONE | WORKING | Insert between scenes, auto-renumber |
| F5 | Video Preview Swap | DONE | DONE | WORKING | Auto-download on completion, video player, download button |
| F6 | ComfyUI Integration | DONE | DONE | WORKING | Submit single/all, poll status, queue info, health check |
| F7 | Reference Frame Catalog | DONE | DONE | WORKING | Browse, search, upload, assign to scenes. Fixed field mapping crash |
| F8 | Audio Management | DONE | DONE | WORKING | VoxCPM2 generation, player, upload replacement, voice selection |
| F9 | Script Archive | DONE | DONE | WORKING | Auto-sync to Obsidian vault + Google Drive (best-effort) |
| F10 | Feedback Loop | DONE | DONE | WORKING | Per-scene feedback, JSONL log, retrieval endpoint |
| F11 | UI Polish Pass | PARTIAL | 2026-08-25 | Drag-and-drop frames, image fallbacks, WebSocket fix. Still needs full user test |
| F12 | Sweet Dreams end-to-end | TODO | 2026-08-25 | Full project: script -> scenes -> render. Not started |
| F13 | Bug fixes from user testing | TODO | 2026-08-26 | Pending F11/F12 testing |
| F14 | Production merge (1 port) | TODO | 2026-09-01 | npm build -> FastAPI serves dist/ |
| F15 | B-roll System | DONE | DONE | 2026-08-24 | Upload, assign, volume control, 5 API routes |
| F16 | Music System | DONE | DONE | 2026-08-24 | Pluggable provider interface (Suno/AudioCraft/Custom), upload, 8 API routes |
| F17 | Final Assembly (ffmpeg) | DONE | DONE | 2026-08-24 | Concat scenes + mix music -> export MP4, 5 API routes |
| F18 | Guided Workflow Wizard | PARTIAL | 2026-08-25 | Component built (26KB) but NOT wired into App.tsx yet |
| F19 | Music Panel | PARTIAL | 2026-08-25 | Component built (17KB) but NOT wired into App.tsx yet |
| F20 | Export Panel | PARTIAL | 2026-08-25 | Component built (13KB) but NOT wired into App.tsx yet |

---

## API Endpoints (57 total)

### Scripts (10)
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/scripts | List all scripts |
| POST | /api/scripts | Create a script |
| GET | /api/scripts/search | Search scripts |
| GET | /api/scripts/{id} | Get a script with content |
| PUT | /api/scripts/{id} | Update a script (full) |
| PATCH | /api/scripts/{id} | Update a script (partial) |
| DELETE | /api/scripts/{id} | Delete a script |
| POST | /api/scripts/{id}/submit | Submit to pipeline |
| GET | /api/scripts/{id}/progress | Get pipeline progress |
| GET | /api/scripts/{id}/feedback | Get feedback log |

### Scenes (12)
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/scripts/{id}/scenes | List scenes |
| POST | /api/scripts/{id}/scenes | Create a scene |
| POST | /api/scripts/{id}/scenes/insert | Insert scene after given ID |
| POST | /api/scripts/{id}/scenes/reorder | Reorder scenes |
| GET | /api/scripts/{id}/scenes/{sid} | Get a scene |
| PUT | /api/scripts/{id}/scenes/{sid} | Update a scene (full) |
| PATCH | /api/scripts/{id}/scenes/{sid} | Update a scene (partial) |
| DELETE | /api/scripts/{id}/scenes/{sid} | Delete a scene |
| POST | /api/scripts/{id}/scenes/{sid}/frame | Upload initial frame |
| POST | /api/scripts/{id}/scenes/{sid}/audio | Upload audio file |
| POST | /api/scripts/{id}/scenes/{sid}/generate-audio | Generate audio via VoxCPM2 |
| POST | /api/scripts/{id}/scenes/{sid}/feedback | Submit feedback |

### ComfyUI (8)
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/comfyui/health | ComfyUI health check (raw) |
| GET | /api/comfyui/status | ComfyUI status (frontend format) |
| GET | /api/comfyui/queue | Queue status |
| GET | /api/comfyui/history | Job history |
| GET | /api/comfyui/status/{prompt_id} | Check prompt status |
| POST | /api/comfyui/submit | Submit single scene |
| POST | /api/comfyui/submit-all | Submit all ready scenes |
| POST | /api/comfyui/poll | Poll all scene statuses + auto-download |

### Audio (4)
| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/audio/generate | Generate audio (VoxCPM2) |
| GET | /api/audio/file/{script_id}/{filename} | Serve audio file |
| POST | /api/audio/replace | Replace audio (placeholder) |
| GET | /api/audio/voices | List available voice clones |

### Frames (3)
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/frames | List reference frames |
| GET | /api/frames/file/{filename} | Serve frame image |
| POST | /api/frames/upload | Upload new reference frame |

### Videos (1)
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/videos/{script_id}/{filename} | Serve completed video |

### B-roll (5) — NEW Aug 24
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/broll | List all B-roll clips |
| GET | /api/broll/file/{filename} | Serve a B-roll video file |
| POST | /api/scripts/{script_id}/scenes/{scene_id}/broll | Upload B-roll for a scene |
| DELETE | /api/scripts/{script_id}/scenes/{scene_id}/broll | Remove B-roll from a scene |
| PATCH | /api/scripts/{script_id}/scenes/{scene_id}/broll | Update B-roll settings (volume) |

### Music (8) — NEW Aug 24
| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/music | List all music tracks |
| GET | /api/music/{track_id} | Get a single track |
| GET | /api/music/file/{filename} | Serve a music file |
| POST | /api/music/upload | Upload a music file |
| DELETE | /api/music/{track_id} | Delete a track |
| POST | /api/music/generate | Generate music via pluggable model |
| GET | /api/music/providers | List available music generation providers |
| PATCH | /api/music/providers | Update provider config |

### Export/Assembly (5) — NEW Aug 24
| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/scripts/{script_id}/assemble | Assemble all completed scenes into final video |
| GET | /api/scripts/{script_id}/assemble/progress | Get assembly progress |
| GET | /api/scripts/{script_id}/exports | List exported videos for this script |
| GET | /api/scripts/{script_id}/exports/{filename} | Serve/download an exported video |
| DELETE | /api/scripts/{script_id}/exports/{filename} | Delete an export |

### Pipeline (1)
| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/pipeline/run | Run full LTX pipeline |

### WebSocket (1)
| Path | Purpose |
|------|---------|
| /ws | Live status updates (scene_update, pipeline_progress, audio_progress, queue_status) |

---

## Fixes Applied (2026-08-22)

### Session 1 — 11 API Mismatches + 3 Missing Features

**Backend (7 files modified, 1 created):**
1. `routes/scripts.py` — Added PATCH alias, POST /submit, GET /progress, GET /feedback, script archive sync
2. `routes/scenes.py` — Added PATCH alias, POST /insert, POST /frame, POST /audio, POST /generate-audio, POST /feedback
3. `routes/comfyui.py` — Added GET /status (frontend format), POST /poll (auto-download video)
4. `routes/videos.py` — Created. Video file serving route
5. `store.py` — Added pipeline progress state, feedback log (JSONL), script archive sync
6. `pipeline.py` — Added download_comfyui_output() for video auto-download
7. `config.py` — Added FEEDBACK_DIR, OBSIDIAN_ARCHIVE_DIR, GOOGLE_DRIVE_SCRIPTS_DIR
8. `main.py` — Registered videos router

**Frontend (7 files modified):**
1. `api.ts` — Full rewrite. Aligned all endpoints, added audioApi + videosApi, fixed pollStatus to POST, frame field mapping
2. `types.ts` — Added video_filename, expanded FrameCatalogItem with backend fields
3. `App.tsx` — Full rewrite. WebSocket with reconnection, removed emojis, voice selection support
4. `SceneCard.tsx` — Full rewrite. Video player swap, feedback UI, voice selection, no emojis
5. `AudioPlayer.tsx` — Replaced emoji with CSS "No audio" text
6. `FrameCatalog.tsx` — Fixed crash (null-safe field access, proper field mapping)
7. `ScriptLibrary.tsx` — Minor updates

### Session 2 — Bug Fixes

1. **FrameCatalog crash** — `f.description.toLowerCase()` crashed because backend returns `title` not `description`. Fixed by mapping backend fields to frontend shape in api.ts and making all field access null-safe.

---

## Design Rules (Gui's Preferences)

1. **NO EMOJIS** — use CSS-based indicators (dots, bars, text labels)
2. **Dark theme** — zinc-950 background (#09090b), zinc-100 text
3. **Modern and clean** — proper letter-spacing, rounded corners, subtle borders, backdrop-blur on header
4. **Status badges** — small colored CSS dots (w-1.5 h-1.5 rounded-full) + uppercase text labels
5. **Horizontal timeline** — scene cards in scrollable horizontal strip with snap-x, ~340px fixed width
6. **Responsive** — must work on phone browsers (tested via Wi-Fi IP)
7. **Buttons** — plain text only (Upload, Download, Submit). No icons or unicode symbols

---

## How to Launch

```bash
# Backend
cd C:/Users/Guilherme/comfyui-video-ui/backend
C:/Users/Guilherme/Documents/ComfyUI/.venv/Scripts/python.exe main.py

# Frontend (separate terminal)
cd C:/Users/Guilherme/comfyui-video-ui/frontend
npx vite --host 0.0.0.0 --port 8502
```

- **PC access:** http://localhost:8502/
- **Phone access (same Wi-Fi):** http://192.168.12.126:8502/
- **Tailscale access:** http://100.119.226.51:8502/
- **API docs:** http://localhost:8503/docs

---

## Known Limitations / Next Steps

1. **Pipeline integration** — `POST /scripts/{id}/submit` calls the full pipeline, but the script must be imported into the ltxv-video skill vault first. Manual scene creation works fully.
2. **ComfyUI must be running** — Submit/poll features need ComfyUI at localhost:8000. Status correctly shows "down" when offline.
3. **VoxCPM2 audio generation** — Works via subprocess call to the pipeline scripts. Needs VRAM free (unload Ollama models first).
4. **Video auto-download** — The poll endpoint downloads completed videos from ComfyUI output. Needs ComfyUI running.
5. **Frame URL construction** — Some frames from the skill catalog may have empty `source_path`. The API client falls back to using the frame ID for the URL.
6. **Script archive sync** — Obsidian vault and Google Drive paths are best-effort. Won't fail if drives aren't mounted.

---

## Roadmap — Milestone Tracker

**MVP Target: September 15, 2026** — all core features working, one project (Sweet Dreams) rendered end-to-end.

### Phase 1 — MVP (current, dev mode)

| ID | Feature | Status | Target | Notes |
|----|---------|--------|--------|-------|
| F1 | Script Management | DONE | 2026-08-22 | Create, browse, search, select |
| F2 | Scene Breakdown (pipeline) | DONE | 2026-08-22 | Submit → AI breaks into scenes |
| F3 | Timeline / Scene Cards | DONE | 2026-08-22 | Horizontal scroll, status badges |
| F4 | Insert Scene (+ buttons) | DONE | 2026-08-22 | Insert between, auto-renumber |
| F5 | Video Preview Swap | DONE | 2026-08-22 | Auto-download + video player |
| F6 | ComfyUI Integration | DONE | 2026-08-22 | Submit, poll, queue, health |
| F7 | Reference Frame Catalog | DONE | 2026-08-22 | Browse, search, upload, assign |
| F8 | Audio Management | DONE | 2026-08-22 | VoxCPM2, player, upload, voices |
| F9 | Script Archive | DONE | 2026-08-22 | Obsidian + Google Drive sync |
| F10 | Feedback Loop | DONE | 2026-08-22 | Per-scene feedback + JSONL log |
| F11 | UI Polish Pass | PARTIAL | 2026-08-25 | Drag-and-drop, image fallbacks, WS fix. Needs full user test |
| F12 | Sweet Dreams end-to-end | TODO | 2026-08-26 | Full project: script -> scenes -> render |
| F13 | Bug fixes from user testing | TODO | 2026-08-28 | Pending F11/F12 testing |
| F14 | Production merge (1 port) | TODO | 2026-09-01 | npm build -> FastAPI serves dist/ |
| F15 | B-roll System | DONE | 2026-08-24 | Upload, assign, volume, 5 API routes |
| F16 | Music System | DONE | 2026-08-24 | Pluggable provider (Suno/AudioCraft/Custom), 8 API routes |
| F17 | Final Assembly (ffmpeg) | DONE | 2026-08-24 | Concat + mix music -> export MP4, 5 API routes |
| F18 | Guided Workflow Wizard | IN PROGRESS | 2026-08-26 | Component built, needs App.tsx integration |
| F19 | Music Panel | IN PROGRESS | 2026-08-26 | Component built, needs App.tsx integration |
| F20 | Export Panel | IN PROGRESS | 2026-08-26 | Component built, needs App.tsx integration |

### Phase 2 — Post-MVP (after September 15, 2026)

| ID | Feature | Status | Target | Notes |
|----|---------|--------|--------|-------|
| P1 | Obsidian Vault Plugin | PLANNED | 2026-09-30 | Read tagged notes, live sync, no manual import |
| P2 | Tag-Based File Organization | PLANNED | 2026-09-30 | All assets (scripts, frames, voices, audio) tagged. Google-search-style discovery with AI confidence ratings. Tag intersections as pre-filter. See P1 design notes below. |
| P3 | User accounts + multi-project | PLANNED | 2026-10-15 | Multiple projects, separate data stores |
| P4 | Cloud deployment (Docker) | PLANNED | 2026-10-30 | Sandboxed ComfyUI, remote access |
| P5 | Mobile-optimized layout | PLANNED | 2026-11-15 | Mobile-first responsive, touch gestures |
| P6 | Collaborative editing | BACKLOG | TBD | WebRTC or CRDT, real-time multi-user |

### P1/P2 Design Notes — Tag-Based File Organization (Aug 22 2026 conversation)

**Problem:** File management is a necessary evil. Folders nest infinitely and slow humans down. Need multi-dimensional organization.

**Solution:** Obsidian-inspired tag system for ALL assets:

**Scripts:** Tagged `#video-script` or `#manuscript` or `#movie-scene` or `#dialogue` or `#screenplay` or `#draft`. AI runs on files in run folders, confidence-rates them like Google search results — "this file is 94% likely to be a narrative script for video conversion."

**Initial Frames:** Auto-tagged with:
- Character present in frame (e.g., `#charles`, `#amara`, `#james`)
- Source: `#ai-generated` (from prompt) or `#human-uploaded` or `#vision-auto-described`
- Visual type: `#headshot`, `#profile`, `#over-shoulder`, `#background`, `#logo`
- Vision model auto-runs on new frames, generates description + tags

**Voices:** Tagged with `#voice-clone`, character name, gender, age band, accent, quality notes

**Audio:** Tagged with scene ID, speaker, `#generated` or `#uploaded`, `#approved` or `#rejected`

**Discovery:** Google-search-style results — user types "amara clinic scene" and gets confidence-rated results across ALL asset types. The AI pre-filters using tag intersections before reading file content.

**Follow-up schedule:** Exponential reminders scheduled via cron — day 3, 6, 12, 24, 48 (Aug 25, 28, Sep 3, 15, Oct 9).

---

## Integration with Other Systems

- **ltxv-video skill** — Pipeline scripts (vocal-layer, screenwriter, director, asset-planner, prompt-bind, queue-audio-generation)
- **VoxCPM2** — Voice cloning + TTS. Installed in ComfyUI venv. Uses reference_wav_path mode for controllable cloning.
- **ComfyUI** — LTX 2.3 22B model. Submit via /prompt API, poll via /history.
- **Obsidian vault** — Script archive at `F:/Other computers/My MacBook Air/workspace/projects/cardano/content/working/`
- **Google Drive** — Backup at `C:/Users/Guilherme/My Drive/Hermes-Shared/ui-projects/scripts/`
- **Reference frames** — `C:/Users/Guilherme/Pictures/New folder/` (character sheets, environments)
- **Voice vault** — `~/.openclaw/workspace/voice-catalog/` (cloned voice anchors)

---

## Showrunner Contest Context

The first project using this UI is "Sweet Dreams" — a Ripper Doc short for the Gossip Goblin Showrunner competition.
- **Script:** Obsidian vault at `projects/cardano/content/working/showrunner-ripper-doc-amara-loop-script-draft-2-2026-07-26.md`
- **Characters:** Amara Sol (voice ref: Odessa A'zion), Eight (The Ripper Doc), The Hammer
- **Contest closes:** October 23, 2026
- **External editing, sound design, music, and voiceovers are allowed**