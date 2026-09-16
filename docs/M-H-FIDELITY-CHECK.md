# M-H — Script-to-Screen Fidelity Check
#project/comfyui-video-ui #roadmap/m-h-fidelity #whisper #sceneflow #qa

> Status: **PLANNED** (after M-C ships) · Approved by Gui 2026-09-10 · Inspired by taruma/SceneFlow
> Decision: build our OWN native version — do NOT embed the SceneFlow web app.

## Context
SceneFlow (github.com/taruma/SceneFlow, MIT, ★178, live demo: sceneflow.taruma.my.id) syncs
screenplays with video: highlights the exact script line on screen in real time. Built for
checking whether AI video models followed the prompt (missed elements, camera drift, continuity).
8 color-coded cue types (dialogue/action/camera/shot/audio/VFX/transition/environment), timing
buffers, Auteur Script state-chained format. Its limitation: cue creation is MANUAL or via
external multimodal model — the app does no video understanding.

## Why ours will be better (the freebie)
Our pipeline already stores per-scene render timings (render_stats.json) and scenes ARE
prompt-addressable units. SceneFlow's hardest problem (manual cues) is native for us:
each scene's prompt IS the script segment, timestamps exist.

## Sub-features
- **H-1 Scene fidelity view**: prompt elements (dialogue/action/camera/VFX — parsed by the LLM
  layer) color-coded and time-mapped against the render. Playback highlights. Manual boundary
  drag in Edit Mode.
- **H-2 Dialogue verification (Gui's feature, NOT in SceneFlow)**: faster-whisper listens to the
  rendered audio → word-level timestamps → fuzzy-match script lines → verdict per scene (all
  lines spoken / missing / offsets) → click a script word → video jumps to that word.
  Model tier: tiny/base, background job, CPU-viable. faster-whisper already in our stack
  (hermes-agent venv).
- **H-3 Subtitles**: H-2 word timestamps → burn-in or SRT export via ffmpeg. Reuses captions UX.

## Design decisions (recorded)
- Cue storage: extend scene JSON (`cues[]` alongside `renders[]`), versioned.
- Auto-cue path: local vision model (qwen3-vl on the box) scoring frames vs prompt elements —
  opt-in, expensive per frame.
- UI: fidelity panel INSIDE the scene card (native), not a separate app.
- No SceneFlow code copied (MIT permits it; a Next.js app doesn't belong in our stack — ideas only).

## Ordering & dependencies
- H-1 after M-C ships (needs real renders).
- H-2 next (whisper infra exists on this machine).
- H-3 small once H-2 lands.

## References
- SceneFlow: github.com/taruma/SceneFlow · live: sceneflow.taruma.my.id · archive: ig-ddmmpvtjuo4-sceneflow
- Roadmap: docs/ROADMAP.md § M-H
- Related: MiniMax H3 upscaling tutorial (yt-fjweg8so8y0) for the render pipeline side.