---
tags:
  - ecosystem/commonweave
  - project/compute-fund
  - roadmap/ecosystem
  - manifesto
status: spec
related:
  - "[[ECOSYSTEM-DECISIONS]]"
  - "[[ARCHITECTURE-ENGINE-NOTE]]"
  - "[[ROADMAP]]"
---

# The Compute Fund — patronage platform for LLM-token-funded maintenance

> Broader vision above the Video UI roadmap. Brainstorm with Gui, 2026-09-09.
> Name TBD (working name "Compute Fund"; Gui is still shopping for the final name).

## What it is

A patronage platform where users fund open-source projects **in LLM tokens /
compute** rather than leaving maintainers to pay from their own pockets.

Flow: user donates (money) → the platform converts it to **compute credit on
the developer's provider of choice** (LLM tokens) → the developer spends that
compute on upkeep: bug fixes, dependency updates, keeping up with ComfyUI
releases, model updates, feature work.

- **Using the software is always free. No fees, no gates.**
- Donations are voluntary patronage: "I use this a lot and want it to stay alive."
- First hosted project: **comfyui-video-ui** (this app).

## Ticket system (free + boosted)

- **Tickets are free to submit** — bugs, feature requests, breakage reports.
- **Donation-boosted priority:** donating moves your ticket up the queue.
- **Automatic bug reporting (opt-in):** crash/error → one-click report, like
  Adobe/Google crash reporters. Foundation already exists in the app
  (`data/llm_logs/`, `render_stats.json`).
- Funds map **directly and transparently** to queued work.

## Safety layer (the queue can be gamed — by design it must be resilient)

- An LLM triage layer reviews every queued job before execution.
- Malicious/paid-sabotage tickets ("erase the app", "destroy itself") get
  dropped with a visible reason.
- Needs a genuinely capable (frontier-class) model for the triage role — the
  budget for it comes from the fund itself.
- Human override: maintainer can veto/reorder; the ledger records it.

## Transparency guarantees

- **Everything hashed:** models pulled by hash (HF-style) so no malicious
  model swap via link-hacking; every dependency pinned; releases hashed.
- **Cardano on-chain ledger** for the money trail: every donation in, every
  job executed from that money, out — publicly auditable.
- (Gui noted HF's Hydra — a Cardano-based layer-2 research project — as
  prior art for the "fits blockchain" direction; verify status before building.)
- Spend reports: "this month's donations → these tickets → these commits."

## Relationship to this UI

- comfyui-video-ui ships first, standalone → community forms → Compute Fund
  launches with the UI as its first hosted project.
- The UI embeds a light "Support this project" path (non-intrusive; the free
  path stays first-class forever).
- Bootstrap chain (from memory): ship Video UI → donations → Compute Fund.

## Open questions (for the Compute Fund roadmap)

1. Name (Gui is shopping; "Compute Fund" is the working name).
2. Conversion: money → tokens (which providers, custody, fees, refund policy).
3. Cardano integration mechanics (wallet, on-chain job receipts, oracle for
   job-completion attestations).
4. Triage model choice + appeals process for rejected tickets.
5. Maintainer onboarding: what projects qualify, hash verification flow.
6. Legal: donations vs payments framing, Cardano disclosure, FTC-style
   transparency for "boosted" queues (tie into M-G monetization principles).

## Standing notes (from memory, this machine)

- Manifesto lives on the Mac side (link-archive / Mac Hermes) — recover before
  building.
- Stack sketch: Next.js + Stripe + Supabase.
- Bottleneck linkage: Compute Fund MVP is the funding bootstrap; Video UI is
  the first proof of the model.

## Decisions affecting the fund (2026-09-09, see docs/ECOSYSTEM-DECISIONS.md)

- **Home: CommonWeave GitHub org.** compute-fund and comfyui-video-ui are
  sibling repos under the umbrella — visitors flow between them by design.
- **Hydra caveat:** HF's Hydra is HF's own project (they run Cardano research)
  — verify its maturity independently before relying on it; Cardano remains
  the ledger layer regardless.
- **Framing decision needed at build time:** "donations fund the project;
  boosted queue is priority influence, not a purchase" — protects the
  donations-vs-services legal line (feeds M-G review).
- **Model-hash guarantee is a fund-level feature, not per-app:** every hosted
  project inherits hash-verified pulls; this becomes part of maintainer
  onboarding (open Q5).