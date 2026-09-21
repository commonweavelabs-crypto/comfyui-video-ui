# Pocock Methods — Where They Honestly Apply to This Codebase
#project/comfyui-video-ui #process/pocock-methods

> Audit 2026-09-21, grounded in the real code (not vibes). Source: "Software
> Fundamentals Matter More Than Ever" (Matt Pocock, archived `yt-v4f1gfyhqg-pocock-fundamentals`)
> + his `mattpocock/skills` repo (MIT). Companion skill: `spec-first` (Hermes).
> Scope rule from Gui: apply ONLY where it honestly helps; no skill-for-skill's-sake.

## Ground truth (what the code actually looks like today)

- `backend/routes/` — 13 small modules. **Deep-module shape: already good.** No change.
- `backend/pipeline.py` — 48KB, 31 functions, 0 classes. Mixed concerns (comfy
  health/queue/history + audio + render stats + workflow slots + assets).
  THE god-module. But its *public surface* (`submit_scene_to_comfyui`,
  `check_prompt_status`, `get_render_timing`, …) is a clean seam.
- `backend/store.py` — 33KB, second god-module candidate.
- `frontend/src/App.tsx` — 60KB, **28 useState + 5 useEffect in one component.**
  God-component; `components/` are mostly presentational.
- `frontend/src/api.ts` — 19KB single API client. Good seam.
- **Tests: ZERO, backend and frontend.** `package.json` has lint but no test script.

## The 4 methods, honestly mapped

### 1. Ubiquitous language — ALREADY OURS, keep, one upgrade
UI-ACTION-MANUAL.md + MODEL-INTEGRATION-BRIEF + roadmap glossary are the shared
vocabulary; box-job briefs already cite the same terms. **Upgrade:** keep term
decisions in one place as they crystallize (see glossary note below). No new process.

### 2. Spec before coding — ADOPTED via `spec-first` skill
Runs at the START of each new project/major milestone (Gui's standing rule).
For THIS repo: specs land in `docs/SPECS/<name>.md`, linked from ROADMAP-INDEX.
Not used for small bugfixes — spec only where decisions would otherwise be silent.

### 3. TDD at seams — ADOPT, scoped to where it pays
We have zero tests; M-C (first e2e test) is exactly when that starts paying.
- **Seam 1 (primary): the HTTP API.** `routes/*`FastAPI endpoints are the public
  interface — tests hit them, never internals. Acceptance test per B1–B5 fix
  BEFORE applying the patch (red-green), starting with the box's fix-designs job.
- **Seam 2 (frontend): `api.ts`.** Component tests mock at api.ts, not fetch internals.
- Rule from the talk: one vertical slice at a time; tests verify behavior, not internals.
- NOT doing: retro-fitting tests onto all of pipeline.py/App.tsx now. Tests accrete
  with the slices we're already working on (M-C, B-fixes). Zero busy-work.

### 4. Deep modules — VALIDATED, two honest refactor candidates (post-M-C)
- Keep `routes/` as-is. ✔ already his shape.
- `pipeline.py` is 31 functions of mixed concerns; `App.tsx` is 28 hooks in one file.
  **Both work today** — refactor ONLY when a slice forces the issue (e.g. when the
  navigator permission layer (M-F) needs to call pipeline internals, that's the moment
  pipeline.py splits: comfy-client / render-stats / workflow-slots).
- ADR candidates (only when all three: hard-to-reverse + surprising + real tradeoff):
  the engine-abstraction decision already has ARCHITECTURE-ENGINE-NOTE.md ✔. No new ADRs now.

## Glossary upgrade (ubiquitous language, concrete)
`docs/GLOSSARY.md` — capture canonical terms as decided (scene vs shot vs clip;
"angle sheet"; "render slot"; "fidelity check"). One line per term, source-linked.
Start it when the first term fight happens — created lazily, not speculatively.

## What we are NOT doing (anti-clutter, per Gui)
- Not installing his repo's other 34 skills.
- No issue tracker (his stack assumes one; ours = roadmap docs + box jobs).
- No ADR ceremony, no CONTEXT-MAP multi-context structure — single repo, one glossary.
- No big-bang test suite or refactor sprint.

## Where this shows up in the roadmap
- **M-C (ACTIVE):** acceptance test first per bug fix (B1–B5) at the HTTP seam;
  Plan B walkthrough already queued to the box tonight.
- **B-fix designs (queued):** box writes proof-test per fix → I write the seam test,
  then apply. TDD order starts with this batch.
- **M-F navigator:** its API surface = the seam; spec-first runs before its impl spec.
- **post-M-C:** pipeline.py / App.tsx splits happen only when a feature slice demands them.

Provenance: Matt Pocock, mattpocock/skills (MIT), adapted into Hermes skill `spec-first`
(2026-09-21). Transcript: link-archive/transcripts/pocock-software-fundamentals.md.