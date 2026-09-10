---
title: ECOSYSTEM DECISIONS
tags: ['ecosystem/commonweave', 'roadmap/ecosystem', 'decisions']
status: live
related: ['[[COMPUTE-FUND-VISION]]', '[[ARCHITECTURE-ENGINE-NOTE]]', '[[ROADMAP]]']
---

# Decisions & follow-ups — GitHub org, Hugging Face auth, ecosystem tagging

> 2026-09-09. Companion to ARCHITECTURE-ENGINE-NOTE.md and COMPUTE-FUND-VISION.md.

## D1. GitHub home for comfyui-video-ui — DECISION: CommonWeave umbrella

Gui has three GitHub identities:
1. **CommonWeave** — the umbrella company; all Cardano/ecosystem projects spawn
   here. The Compute Fund will live here.
2. **Personal (Guilherme)** — his own account.
3. **"David"** — a functional email/account created for David's Gmail access
   (not a real maintainer identity).

**Decision: host the Video UI under CommonWeave.** ✅ DONE 2026-09-09: repo
live at https://github.com/commonweavelabs-crypto/comfyui-video-ui (public,
master pushed; the logged-in umbrella account is `commonweavelabs-crypto` —
note the GUI account `Commonweave` from Feb 2026 is a separate empty user).
CONFIRMED 2026-09-09:
account exists as GitHub **user** `Commonweave` (created 2026-02-05, currently
0 public repos), email commonweavelabs@gmail.com. Remote pre-wired:
`https://github.com/Commonweave/comfyui-video-ui.git`. Git identity set to
Commonweave <commonweavelabs@gmail.com>. Options:
- Convert the user account to an **organization** (GitHub: Settings →
  "Convert to organization") — free, keeps the name, enables teams. This is
  the recommended form once a second collaborator (David) joins; a user
  account works fine until then.
- Note: `commonweavelabs` and `common-weave` are free as org names if Gui
  prefers that handle; `Commonweave` is taken (him). Reasoning:
- The UI is designed to be Compute Fund's first hosted project — siblings belong
  under the same umbrella so visitors cross-pollinate ("people get excited
  about the UI, walk into the Fund, start using it").
- Community-maintained projects need organization accounts, not personal ones:
  org = shared ownership, teams/permissions, survives any one person, matches
  the fund's governance model.
- Personal account stays for personal experiments; "David" account should NOT
  hold repos (it's a service identity, not a maintainer).
- Migration is cheap NOW (one `git remote set-url` + push); expensive later
  (stars/watchers don't move cleanly). Decide before first push.

Ecosystem repo layout under CommonWeave (suggested):
```
commonweave/
  comfyui-video-ui/      ← this app
  compute-fund/          (Next.js + Stripe + Supabase)
  manifesto/             (shared manifesto, versioned)
  brand/                 (logos, naming, assets)
```
Obsidian vault tags for the ecosystem: `#ecosystem/commonweave`,
`#project/comfyui-video-ui`, `#project/compute-fund`, `#roadmap/ecosystem`.

## D1b. Brand name resolved: "CommonWeave Labs" (with S) — 2026-09-09

The X handle @CommonweaveLab (no S) is the outlier; every other asset uses the S:
email commonweavelabs@gmail.com, GitHub commonweavelabs-crypto, YouTube
@CommonweaveLabs, GitHub profile "CommonWeave Labs", all project docs (19 vs 4
mentions). Grammar: plural "Labs" is the tech-brand standard for an umbrella
spawning multiple projects (Google Labs, Bell Labs) — singular "Lab" reads as
one workshop. ACTION: rename X handle in X Settings → Account → Username change
(keeps followers/posts) to @CommonweaveLabs if available at rename time.

## D2. Hugging Face auth — what the "AD Hugging Face" error is

The icon Gui clicked is **ComfyUI-Manager's model-database entry for
ComfyUI-Addoor's "🌻 Hugging Face Download" node** (the "AD" = Addoor). It is
NOT installed locally — the icon appears in Manager's node list. The error —
"no auth token was obtained... may require a manual registered auth client" —
is HF's OAuth device flow: that node's flow wants HF to authorize an OAuth
client, and unregistered clients get rejected.

**Recommended path (simpler + standard): skip the OAuth node flow.**
- HF's standard auth is a **personal access token**: create at
  https://huggingface.co/settings/tokens (scope: read is enough for public
  models; fine-grained "read access to all public repos").
- Where it lands: `C:\Users\<user>\.cache\huggingface\token` (verified absent
  today) or set `HUGGING_FACE_HUB_TOKEN` env var — both ComfyUI-Manager and
  any HF hub code pick that up globally.
- Do NOT chase the Addoor OAuth route — it's a third-party node quirk, and we
  don't even have Addoor installed. If Gui wants one-click model downloads in
  the app later (M-A), we'll use `huggingface_hub` with a token field in our
  own Settings — one flow, ours, with the hash-verification guarantee from
  COMPUTE-FUND-VISION.md.
**Should Gui log in to HF?** Yes — creating the token is 2 minutes and future-
proofs model pulls for M-A (ltx-2.5/minimax are already on disk, but future
models will need it). Not urgent for M-C.

## D3. Ecosystem tag taxonomy (Obsidian vault)

```
#ecosystem/commonweave          ← umbrella
  #org/commonweave              ← the company
  #project/comfyui-video-ui     ← this UI (status: active, M-C next)
  #project/compute-fund         ← patronage platform (status: spec'd)
  #roadmap/ecosystem            ← cross-project sequencing
  #decision/engine-comfyui      ← architecture note reference
  #manifesto/commonweave        ← on Mac; recover + version here
```
Frontmatter convention for ecosystem notes:
`tags: [ecosystem/commonweave, project/<name>, roadmap, <topic>]` +
`related: [<other project docs>]` so Obsidian links stay bidirectional.

## Follow-ups created (owners: Hermes, next sessions)

| # | Item | Where | Priority |
|---|---|---|---|
| 1 | Create CommonWeave GitHub org/repo + wire remote + first push (needs PAT from Gui) | D1 | HIGH |
| 2 | HF personal-access token setup (when model downloads needed) | D2 | MEDIUM |
| 3 | Recover Compute Fund manifesto from Mac → version into this repo | D1 | HIGH |
| 4 | Compute Fund: verify Hydra status (HF's Cardano L2) before chain design | COMPUTE-FUND-VISION open Q3 | MEDIUM |
| 5 | Add "David" account policy: service identities hold no repos | D1 | LOW |
| 6 | M-G legal review: donations-vs-services framing for boosted queues | M-G | before fund launch |