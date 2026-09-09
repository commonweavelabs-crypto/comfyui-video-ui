# Architecture Note: Engine Abstraction — why ComfyUI and how we stay un-locked

> Decision record, 2026-09-09. Question: "Are we building on top of another UI when
> we could pull models directly from Hugging Face? Is ComfyUI a filler layer?"

## The three layers (and what each actually is)

| Layer | What it is | What it does NOT do |
|---|---|---|
| **Hugging Face** | Model **warehouse** + a Python library (diffusers). Stores weights (.safetensors), licenses, model cards. | Does not RUN anything for you locally: no server, no queue, no VRAM manager, no runtime. Pulling weights = you own the whole execution problem. |
| **ComfyUI** | **Inference engine**: executes the pipeline. Job queue (`/prompt`), history, WS progress events, VRAM management, custom-node ecosystem (LTXVideo pack, STG guiders, upscalers), model file management, `/system_stats` hardware introspection. | Not a warehouse (though it can download), not a studio UX, not ours to brand. GPL-3.0 (fine: we talk HTTP, we don't link). |
| **This app** | **The studio** — the only layer users touch. Timeline, scripts, project canvas, provider picker, chunked LLM, casting. | Everything below this line is deliberately not ours to rebuild. |

Analogy: HF is the warehouse, ComfyUI is the engine room, we are the studio floor.

## What we concretely consume from ComfyUI today (backend/pipeline.py)

- `POST /prompt` — submit scene jobs; `/history` + native WS — status & progress
- Workflow JSON — LTX node graph maintained by Lightricks/ComfyUI core
  (LTX-2 is built into ComfyUI core: new models land day-one with tested
  graphs, quantizations, VRAM optimizations)
- Custom nodes: `LatentUpscaleModelLoader`, LTXVideo pack, VoxCPM2 audio path
- `/system_stats` — GPU detection feeds our preset grading + FPS caps
- `/internal/logs`, `/models/*` — introspection and log drawer
- Comfy Cloud (their side) — future escape hatch for GPUs that can't run a model

## The counterfactual: "without ComfyUI" = HF diffusers + a home-built engine

We would have to write: queue + retries + crash recovery, VRAM juggling, WS
progress, per-model pipeline code (every new video model = new integration we
own), audio, upscaling chains. History check: diffusers was famously slower
than ComfyUI per-iteration in community benchmarks (HF forum, 15s vs 1s per
iteration at 1024px). Our app's value is the studio UX; engine-building would
bury it. We'd also inherit per-model licensing checks that ComfyUI currently
absorbs.

## Honest costs of the ComfyUI dependency (tracked, not hidden)

1. **Install friction** — users install ComfyUI first (Comfy Desktop). Mitigation
   lives in onboarding work; never assume ComfyUI knowledge in our UX.
2. **Version churn** — ComfyUI updates can break custom nodes; pin/track versions.
3. **Internal leakage** — node IDs (`340:330`) are Comfy internals in our code;
   tamed by the Slots system; the least "ours" layer.
4. **GPL-3.0** — fine over HTTP (no code linkage), matters if we ever bundle.

## HF diversification — real, watch it, don't chase it

HF is genuinely broadening from warehouse toward engine-adjacent services
(verified 2026-09): Inference Providers (single-token API to partner compute),
Inference Endpoints (managed deployment, ~$0.50/hr T4 → $10/hr H100), HF Jobs
(one-command vLLM servers). Note: HF's own Spaces/DeepSite-style products are
UX layers on top of these. TODAY these serve LLMs/image APIs well; interactive
video-model pipelines (frame-by-frame, upscalers, audio) are still
ComfyUI-shaped. Re-evaluate quarterly — if a video model ships a
diffusers-first pipeline with parity performance, revisit.

## Lock-in insurance (this is the actual note)

- **Rule:** every ComfyUI touchpoint lives in `backend/pipeline.py` (+ `comfy_events.py`
  for WS), with ONE sanctioned exception: `routes/comfyui.py` (the ComfyUI
  introspection proxy — status/interrupt/assets/logs — whose purpose IS
  ComfyUI-specific). Verified 2026-09-09: no other route touches ComfyUI.
- **The interface to preserve:** (a) submit(prompt_payload) → job id;
  (b) job status/poll → terminal states; (c) progress events; (d) hardware
  introspection; (e) asset availability. Any engine replacement must implement
  these five; nothing else in the app may know ComfyUI exists.
- **Escape hatches already real:** Comfy Cloud (their compute), HF Inference
  Providers / Endpoints (our alternative), local diffusers (last resort).
- **Cost of switching, honest estimate:** ~2-6 weeks to re-implement the
  pipeline module against a new engine; zero changes above `pipeline.py`'s
  interface. That's the blast radius. Acceptable.

**Verdict: keep ComfyUI as the engine. Not a filler layer — the engine room.
Stay leveraged, not locked.**