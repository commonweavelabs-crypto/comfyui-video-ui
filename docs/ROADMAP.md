# ComfyUI Video Workflow UI — Research Findings & Roadmap

> Compiled 2026-09-02 from: (1) official Comfy MCP release research + live testing,
> (2) Tim's video "Official ComfyUI MCP" (youtube.com/watch?v=ghCKziHvGXo, transcript
> analyzed + fact-checked against official sources), (3) Archify architecture
> visualization of this codebase, (4) hands-on install of the official comfy-mcp
> server against this machine's ComfyUI (port 8000).
>
> Tags: [backend] [frontend] [agent] [future] [verified] [insight]

---

## 1. Environment baseline (verified live)

- ComfyUI 0.34.2, RTX 5070 Ti 17.1 GB VRAM, port **8000** (`COMFY_LOCAL_URL=http://127.0.0.1:8000`)
- comfy-cli 1.20.0 + comfy-mcp 0.10.0 installed in Hermes venv; 39 MCP tools
- Full MCP loop **tested end-to-end**: `server_info → generate_image → prompt_id →
  status=completed → output URL` (fox test image, 2026-09-02)
- Template search works: **32 LTX templates available, incl. LTX-2.5** (i2v, flf2v,
  t2v) — we are on ltx-2.3-22b-dev; LTX-2.5 templates exist but their weights are a
  separate download. [verified]

## 2. Official Comfy MCP — tool model worth mirroring [backend] [verified]

The official server's 40 tools validate a pattern our backend should adopt:

- **[backend] Pollable job handles**: async submit returns `prompt_id`; an expired
  wait returns `{timed_out: true, prompt_id, status}` — the job stays pollable
  (`job status`), collectable (`fetch_outputs`), cancellable (`job cancel`). Never
  orphan a render on timeout. Our `pipeline.get_render_timing`/`check_prompt_status`
  already half-does this; make the timeout path return a pollable handle too.
  **DONE (ce3a5f8, 2026-09-02):** errored history prompts → terminal `error`
  (was fake `rendering` forever); prompt in neither history nor queue → terminal
  `lost` + resubmit hint (was fake `queued` forever); both poll callers treat
  error/lost as terminal and broadcast. Verified live against port 8000.
- **[backend] Spend gate**: any workflow embedding paid partner nodes fails CLOSED
  unless `confirm_spend=True`; the client is asked per call. If we ever add
  API-node templates, copy this — no paid call without explicit UI confirmation.
- **[backend] Introspection over static catalogs**: tools query what models/nodes/
  templates the *live install* actually has (custom nodes included). Roadmap: our
  `/api/comfyui/capabilities` should also list available checkpoints/loras and the
  UI should dim/warn on missing assets *before* submit, not fail at run time.
  **DONE (2026-09-02):** `GET /api/comfyui/assets` — extracts every model asset the
  workflow loads (loader class→folder map incl. custom `latent_upscale_models`),
  checks against `/models/<folder>` with disk-scan fallback for the two shared model
  dirs. Returns {assets, missing, all_available}. Verified live: 5/5 present;
  negative path flags a fake checkpoint. Frontend badge still TODO.
  **Frontend DONE (11460ba):** amber "⚠ N missing assets" header badge (only when
  missing non-empty), click expands filename list.
- **[backend] Log tailing as a first-class tool** (`get_logs`). Feature: replace the
  removed debug overlay with a collapsible "backend log" drawer fed by a
  `/api/comfyui/logs` route — shown on failure, hidden otherwise.
  **DONE (backend, 2026-09-02):** `GET /api/comfyui/logs?bytes=N` (default 20k,
  clamped 1k–200k) tails ComfyUI's `/internal/logs`, returns {logs, truncated}.
  Verified live — captured a real ERROR + invalid-prompt block. Frontend drawer
  UI still TODO.
  **Frontend DONE (11460ba):** "Logs" header button opens collapsible drawer
  (mono pre, Refresh/Close); verified headless with real log lines, no JS errors.
- **[backend] Slot-level workflow editing** (`list_workflow_slots`, `set_workflow_slot`,
  `validate_workflow`, `vary_workflow`): templates are parameterized by slot address
  (`6.text`) or name. Our WorkflowWizard can expose named slots instead of raw JSON.
  **DONE (2026-09-06):** `GET /api/comfyui/slots` introspects Primitive/Switch nodes
  (named slots w/ labels, types, min/max, per-scene flag); `POST /api/comfyui/slots/set`
  validates + persists to the workflow JSON. Frontend `SlotsPanel` in the wizard Render
  step: toggles for bools, number inputs for ints, locked "per scene" rows for
  prompt/duration. Verified live + headless screenshot.
- **[backend] Remote targeting**: `COMFYUI_URL`/`COMFY_LOCAL_URL` env points all tools
  at any host:port. Directly matches our "connect any backend" goal — the UI's
  connect dialog should write this one value; local vs LAN backend becomes a
  config change, not a code change. [verified: works against port 8000]

## 3. Video insights → features [frontend] [insight]

From Tim's video (fact-checked claims only; MCP release date Jun 29 2026 confirmed
via blog.comfy.org + docs.comfy.org; "LTX 2.5 in templates" confirmed by our own
template search):

- **[frontend] Inline quick-edit on queued scenes** (frames, length, aspect): his
  key operational insight — don't burn LLM tokens changing labeled trivia like
  prompt text or frame counts; edit manually. Our scene cards should offer inline
  numeric fields so parameter tweaks never require the agent.
- **[frontend] Missing-asset badge with total size + "download all"**: Comfy
  templates show "3 errors → view details → download all (13.34 GB)" before run.
  Mirror in our template/queue view: detect missing models, show aggregate size,
  one-click fetch.
- **[frontend] Hybrid authoring workflow**: human idea first, AI cleanup second.
  Our M5a writing flow already matches; make the "clean up my draft" path a
  first-class button, not just a chat flow.
- **[agent] Local ↔ API model mixing** (open weights + partner APIs in one graph):
  future feature — a template browser toggle "local / API", with the spend gate
  above. Not a near-term priority (needs Comfy credits).
- **[future] "Install this LoRA by URL"**: paste a Civitai/HF URL in chat; agent
  stages the download into the right models/ dir. Natural agent-driven UI feature.

## 4. Architecture visualization (Archify) [verified]

`docs/video-ui-architecture.html` (interactive) + `.json` (source) + `.png`:
11 components, 14 edges, render-path and writing views. Confirmed structurally:
`ws_manager`'s polling loop is the single status pipeline (polls ComfyUI queue on a
timer, broadcasts to clients). Roadmap:

- **[backend] Replace pure polling with ComfyUI's native WebSocket events**
  (`/ws` socket) where possible; keep polling as fallback. Lower latency,
  less load, and matches the MCP's event/poll hybrid.
  **DONE (2026-09-07):** `comfy_events.py` persistent client (auto-reconnect,
  exp backoff); handlers route status/executing/execution_error to scenes via
  prompt index (in-memory + catalog fallback). Poll loop backs off 15s when
  events healthy, 3s fallback. `/api/comfyui/events/health` diagnostic.
- **[backend] Event→UI push**: on queue events, push per-scene status deltas over
  our existing WS instead of full-state broadcasts.
  **DONE (2026-09-07):** event handlers push targeted scene_update on transitions;
  poll loop's rendering-tick broadcasts only fire when timing values changed
  (delta check) — no more full-state spam.
- **[frontend] Inline quick-edit on queued scenes** (frames, length, aspect):
  **DONE (2026-09-07):** scene cards now have Resolution preset dropdown
  (Template/16:9/9:16/1:1) + FPS input beside Duration. Stored per-scene
  (width/height/fps), explicit null clears to template default; pipeline uses
  scene value ?? template slot at submit. frame_count derives from scene fps.
  **REDESIGNED same day (Gui):** per-scene resolution/FPS was wrong (mixed
  aspect ratios/frame rates within one video are broken by design) — replaced
  by PROJECT-level render settings (see the project-level entry above). Scene
  cards back to Duration-only.

## Output Format feature set (2026-09-07 — all 5 steps BUILT)

1. **Creation-time picker** — wizard step 0: preset grid required before Create
   (no default); format saved to project on creation.
2. **Hardware-aware grading** — `_grade_preset` (VRAM tiers + model MP ceiling
   from checkpoint name) → recommended/heavy/exceeds; grayed presets w/ badges,
   exceeds-confirmation dialog; 720p tiers for 8-12GB cards.
3. **Header Settings button + ProjectSettingsModal** — preset grid + change
   warnings: "N of M scenes already rendered or queued — will need re-submission"
   + "Initial frames were generated for the current aspect ratio — they will be
   cropped or padded to fit WxH".
4. **Library sidebar Settings button** per project row — opens the same modal
   without opening the project.
5. **PLACEMENT (Gui, 2026-09-07):** the header Settings button was WRONG — it sat
   next to the app wordmark and implied a global setting. Project Settings lives
   in the TIMELINE action row (Settings → Export → Submit All Ready, same line as
   the Timeline heading) — inside the project window so it reads per-project.
6. **"New empty project" also requires format (Gui, 2026-09-07):** the landing
   inline panel asks format FIRST (graded grid) then name; Create gated on both.
   Includes canvas explanation: "frame size and frame rate apply to every initial
   frame and are the final render size for the whole video (unless you upscale at
   the end)." Both creation paths (wizard + landing) enforce format-before-create.
7. **End-to-end verified:** presets persist (reels 1080x1920@30 survived
   GET-after-PUT), grading matches Gui's 16GB/5070 Ti reality, all modals clean
   (zero JS errors). Commits: creation picker, grading, settings modal, library.
8. **FPS UNBOUND FROM RESOLUTION (Gui, 2026-09-07):** frame size (destination
   choice) and frame rate (look/time choice) are independent decisions. Presets
   carry size only; FPS is its own selector row (12/24/30/60 with notes — 12
   stylized/fastest, 24 cinematic, 30 standard, 60 smooth/2.5x render work).
   FPS layering on save: explicit arg > existing project fps > 24 default.
   Switching presets preserves the chosen fps (verified: reels switch kept 60).
   Label wording: "Frame size" and "Frame rate" sections replace "Output format".

## 5. MCP landscape (pick rationale) [verified]

- **Chosen: official `Comfy-Org/comfy-mcp`** (AGPL-3.0, beta). First-party, 40
  focused tools, wraps comfy-cli, `COMFY_LOCAL_URL` targeting, fails-closed spend
  gate. Installed + registered in Hermes config (39/39 tools, env wired).
- Community `artokun/comfyui-mcp`: 178 tools + 36 skills — powerful but floods the
  toolset on every API call and is single-maintainer. Revisit only if we need its
  sidebar-agent features.
- Comfy Cloud MCP (`https://cloud.comfy.org/mcp`, remote HTTP): separate server;
  relevant only if we add cloud rendering.

## 6. Tooling notes (this machine) [verified]

- cua-driver upgraded 0.7.1 → **0.23.2** (manual install from GitHub releases; the
  `cua.ai` installer domain does not resolve on this network). Autostart daemon
  registered (`cua-driver-serve` scheduled task); Hermes `computer_use` patched to
  attach via `--socket \\.\pipe\cua-driver` (cua_backend.py `_mcp_args_with_overlay_flag`).
- comfy-cli env override: `COMFY_LOCAL_URL=http://127.0.0.1:8000` (host_port.py
  precedence: flag > env > persisted config > 8188 default).
- Hermes `mcp add` multi-`--args` bug avoided: comfy-mcp is a single console
  script, no args needed.

## 7. Next-stage milestones (brainstorm, 2026-09-07 — not started)

### M-A. Reference-sheet generation entry (Gui's idea — "let the AI take flight")
The current pipeline requires initial frames. A **reference-sheet-first entry**
lets users skip that: feed a character sheet / environment sheet, the model
generates the video.
- Models already on disk (ComfyUI-Shared/models/diffusion_models/):
  `ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors` and
  `minimax_h3_fl2va_pruned_int8_convrot.safetensors`. No saved user workflow
  for either yet — build/template one when we start this milestone.
- Positioning: the "leave it up to the AI" path from the landing page (fresh,
  out-of-box experience). Users who want control can still supply initial frames.
- Design questions to settle: per-project model choice? new wizard branch? how
  character sheets map to the existing scene/initial-frame pipeline.

### M-B. Angle-sheet generator (integrate existing workflow)
Gui has a working config workflow that takes ONE image and generates multiple
angles of the subject. Integrate in-app: user uploads one image → generates
angle variants → picks one as the scene's initial frame. No external software.
- Downstream of M-A (a character sheet from M-A could feed this).
- Keep it inside the timeline UX (scene card → "generate angles" → picker).

### M-C. First end-to-end user test (ACTIVE — starting now)
Fresh out-of-box path: landing "let's write your next movie idea" → new empty
project (format + name gated) → script/scenes → timeline → submit → real output.
Expectation: fresh project has no initial frames — first milestone is frame-gen
on scene 1. Plan B if script formatting blocks: submit a ready scene from test2.

### M-D. Telemetry / hardware data collection (backlog, opt-in)
Render timing per GPU/VRAM/resolution/duration/fps/checkpoint → local estimates
per machine. Community submission strictly opt-in (default OFF, show-what's-sent,
export before send). Foundation exists: `render_stats.json` logs real timings.