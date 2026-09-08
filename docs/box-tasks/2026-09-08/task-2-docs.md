# BOX TASK: Documentation consolidation + test checklist expansion

Working from the project README (attached context: comfyui-video-ui repo,
docs/ROADMAP.md sections 7, docs/box-tasks/2026-09-08/).

TASK A: Expand the README's 'Testing checklist (per release)' from 5 items to
a full release checklist covering: the shared OutputFormatPicker (all 4
surfaces must render frame-size AND frame-rate sections), the Model button +
connect modal, the chunked-formatting progress bar, the 413 guidance message,
script-detection routing (INT.-start vs prose), title fallback, and the
FPS/unbound behavior (fps preserved across preset switches).

TASK B: Write docs/onboarding-flow.md describing the intended first-run user
journey: landing page -> idea box -> connect modal (no provider found) /
progress bar (chunked) / script page -> timeline -> submit. Note every point
where the user can hit an error and what the app shows instead of a dead end
(philosophy: every warning has a way out).

OUTPUT: two markdown files in this folder.
