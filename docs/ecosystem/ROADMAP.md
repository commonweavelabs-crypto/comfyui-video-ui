---
title: ecosystem - ROADMAP
tags: ['ecosystem/commonweave', 'roadmap/ecosystem', 'roadmap']
status: active
related: ['[[ROADMAP]]', '[[COMPUTE-FUND-VISION]]', '[[ECOSYSTEM-DECISIONS]]']
---

# CommonWeave Ecosystem Roadmap

> 2026-09-09. Cross-project sequencing — the umbrella view. Details live in
> each project's own roadmap; this doc tracks the order and dependencies.

## Phase 1 — Foundation (NOW)
| # | Item | Project | Status | Blocks |
|---|---|---|---|---|
| 1 | Video UI M-C: first end-to-end render | video-ui | ACTIVE | everything |
| 2 | GitHub: CommonWeave org + repos + first push (needs Gui's PAT) | ecosystem | READY (identity+helper set) | all remote work |
| 3 | Recover CommonWeave manifesto from Mac → version | manifesto | pending | fund copy |

### Ops tooling (2026-09-09)
- `commonweave-social-media` skill created (browser-first account management,
  brand voice, hard rules: no passwords/OTP handling, verify-before-save).

## Phase 2 — Launch (after M-C green)
| # | Item | Project | Status |
|---|---|---|---|
| 1 | Public reveal: Video UI standalone (post + demo video) | video-ui | pending |
| 2 | Recommended-model formalized (gemma3:12b or 4B test winner) | video-ui | data ready |
| 3 | Compute Fund alpha: donations → tokens, single hosted project (the UI) | compute-fund | spec'd |
| 4 | Manifesto published on CommonWeave | manifesto | blocked by #1 |

## Phase 3 — Ecosystem flywheel
| # | Item | Project |
|---|---|---|
| 1 | Ticket system live in the UI (free + boosted) | video-ui (M-F3) |
| 2 | LLM triage safety layer + maintainer veto | compute-fund |
| 3 | Model-hash verification in maintainer onboarding | compute-fund |
| 4 | Cardano ledger receipts (hash-on-chain, records off-chain) | compute-fund |
| 5 | Second hosted project onboarding (proves it's a platform, not a one-off) | compute-fund |
| 6 | M-G monetization review (provider referrals; ethics gate) | compute-fund |

## Watch list (quarterly)
- HF Inference Providers / Endpoints / Jobs — video-pipeline parity?
- Hydra (HF's Cardano L2) maturity
- ComfyUI Cloud evolution (competes or complements?)
- New video models: diffusers-first pipelines with parity performance?

Dependency rule: nothing in Phase 2+ starts before Phase 1 #1 and #2 close.
