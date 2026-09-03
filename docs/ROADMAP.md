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
- **[backend] Spend gate**: any workflow embedding paid partner nodes fails CLOSED
  unless `confirm_spend=True`; the client is asked per call. If we ever add
  API-node templates, copy this — no paid call without explicit UI confirmation.
- **[backend] Introspection over static catalogs**: tools query what models/nodes/
  templates the *live install* actually has (custom nodes included). Roadmap: our
  `/api/comfyui/capabilities` should also list available checkpoints/loras and the
  UI should dim/warn on missing assets *before* submit, not fail at run time.
- **[backend] Log tailing as a first-class tool** (`get_logs`). Feature: replace the
  removed debug overlay with a collapsible "backend log" drawer fed by a
  `/api/comfyui/logs` route — shown on failure, hidden otherwise.
- **[backend] Slot-level workflow editing** (`list_workflow_slots`, `set_workflow_slot`,
  `validate_workflow`, `vary_workflow`): templates are parameterized by slot address
  (`6.text`) or name. Our WorkflowWizard can expose named slots instead of raw JSON.
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
- **[backend] Event→UI push**: on queue events, push per-scene status deltas over
  our existing WS instead of full-state broadcasts.

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