# ComfyUI Video Workflow UI

A clean, modern web UI for the LTX video production pipeline — replaces ComfyUI's
node interface with a visual timeline of scene cards (initial frame, prompt,
audio, submit status). FastAPI backend + React/Vite frontend.

**Status:** active development. Full history, architecture, and decisions live in
[`docs/ROADMAP.md`](docs/ROADMAP.md) — read that first.

## Quick start

```bash
# Backend (port 8503) — uses the ComfyUI venv (httpx, fastapi already there)
cd backend
C:/Users/Guilherme/Documents/ComfyUI/.venv/Scripts/python.exe main.py

# Frontend (port 8502)
cd frontend
npm run dev
```

Open **http://localhost:8502/**. ComfyUI must be running on port 8000
(launch through the Comfy Desktop app).

## Layout

```
backend/            FastAPI — scripts, scenes, pipeline, ComfyUI bridge, WS events
  store.py          Catalog + project render settings (presets, FPS, grading)
  pipeline.py       Scene submission to ComfyUI, GPU capabilities, polling
  routes/           scripts, scenes, comfyui (slots), ws
frontend/src/
  components/
    OutputFormatPicker.tsx   THE shared frame-size + frame-rate picker.
                             All 4 surfaces mount this — never copy its JSX.
    ProjectSettingsModal.tsx Timeline Settings button + Library row Settings
    WorkflowWizard.tsx       Script → scenes → render wizard (step 0 = format)
    Landing.tsx              "New empty project" (format required at creation)
    SlotsPanel.tsx           Render-step slot editing (ComfyUI workflow slots)
    Timeline.tsx, SceneCard.tsx, Header.tsx ...
  api.ts, types.ts
data/               scripts catalog (JSON, git-tracked)
docs/ROADMAP.md     Milestones, decisions, backlog — the project's source of truth
```

## Social / ecosystem

- X: x.com/Commonweavelabs · YouTube: youtube.com/@CommonweaveLabs
- Managed via the `commonweave-social-media` skill (browser-first, preview pane).
- Ecosystem docs: `docs/ECOSYSTEM-DECISIONS.md`, `docs/COMPUTE-FUND-VISION.md`,
  `docs/ecosystem/SOCIAL-ACCOUNTS.md`, `docs/ecosystem/ROADMAP.md`.

## Core concepts

- **Project canvas (project-level, never per-scene):** frame size (destination
  preset: YouTube/Reels/Square/Custom, hardware-graded) + frame rate
  (12/24/30/60 + custom). Set at creation, changeable in Project Settings;
  applies to every initial frame and the final render. FPS is independent of
  resolution (unbound, 2026-09-07).
- **FPS limits = model ceiling ∩ hardware cap, whichever binds first.**
  LTX-2.3 tested envelope tops out ~50fps; VRAM tiers set the rest.
- **Slots:** the ComfyUI workflow's editable parameters, exposed at the render
  step. Prompt/duration are per-scene and protected from template edits.
- **Legacy projects** may report `preset: 'template'` (size from workflow
  slots) — the backend accepts it everywhere.

## Testing checklist (per release)

1. Landing → New empty project: format + name required before Create
2. Wizard step 0: same gating; Create & Continue disabled until picked
3. Timeline Settings: frame size + frame rate both present; fps click saves
   (watch for 404 "Script not found or unknown preset" = template-preset bug)
4. Library row Settings: same modal, without opening the project
5. Backend restart required after any `store.py` change (no hot reload)