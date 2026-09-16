# Roadmap Status Index
#project/comfyui-video-ui #roadmap/index

> Quick-reference index for docs/ROADMAP.md. The roadmap file is the source of truth;
> this page maps each milestone to its detail doc, status, and stage.

| Milestone | Title | Status | Stage | Doc |
|---|---|---|---|---|
| M-A | Reference-sheet generation entry | planned | pre-MVP | (in ROADMAP § 7) |
| M-B | Angle-sheet generator | planned | post M-A | (in ROADMAP § 7) |
| M-C | First end-to-end user test | **ACTIVE** | MVP | (in ROADMAP § 7) |
| M-D | Telemetry / hardware data | backlog (opt-in) | post-MVP | (in ROADMAP § 7) |
| M-E | LLM onboarding + provider layer | **DONE** (routes/llm.py + LlmConnectModal) | MVP | MODEL-INTEGRATION-BRIEF.md |
| M-F | Multi-role AI assistant | Director/Screenwriter LIVE; roles 2-4 planned | post-M-C | UI-ACTION-MANUAL.md (foundation) |
| M-F2 | Script page as document | brainstorm | post-MVP | (in ROADMAP) |
| M-F3 | Compute Fund integration | vision spec | post-MVP | COMPUTE-FUND-VISION.md |
| M-G | Monetization | deferred (until M-C + M-E-2) | post-MVP | (in ROADMAP) |
| M-H | Script-to-screen fidelity check | planned (after M-C) | post-M-C | M-H-FIDELITY-CHECK.md |
| M-I | DLSS 5 neural post-process | **installed, selftest passed** (UI integration pending) | post-M-C | M-I-DLSS5-POSTPROCESS.md |
| M-J | Liquid mode (QuickLiquid theme) | planned (post-MVP polish) | post-MVP | M-J-LIQUID-MODE.md |

## Design guidance embedded in the roadmap
- **MCP tool design** (Neon, yt-bqrhbq-kge): workflow tools + progressive discovery, not
  endpoint mappings. Applies to M-F role routing + AI Manual tool surface.
- **Sandcastle side-note**: AFK agent orchestration — mini-box upgrade path (trigger: box
  jobs that modify code).

## Non-roadmap reference docs
- ARCHITECTURE-ENGINE-NOTE.md — engine abstraction decision record
- ECOSYSTEM-DECISIONS.md — GitHub home, HF auth, Obsidian taxonomy
- UI-ACTION-MANUAL.md — every control + API effect (box-generated, verified)