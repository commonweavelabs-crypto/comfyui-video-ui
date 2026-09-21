# Jev-class (System One) Models — Brainstorm for the Video UI
#project/comfyui-video-ui #brainstorm #m-f

> 2026-09-21, grounded in the real code. Sources: the Jev dossier (5 archived videos,
> catalog 264-270) + SemIf repo audit. Companion: docs/POCOCK-METHODS-APPLICATION.md.

## What Jev-class models ARE (one correction first)

Not a code generator and not a small chat model. A Jev-class model:
- takes (input, list of options) -> returns PROBABILITIES per option in ~100-300ms
- does NOT write prose, summarize, or analyze (Nate Herk test: decisions only)
- the "perfect formatting" intuition is right but backwards: there IS no format to get
  wrong because it never generates text - the answer is read straight from the model's
  internal logits (SemIf's trick). That's why it's fast and cheap (fractions of a cent
  per 1000 decisions) - and why it CAN still make decision mistakes (small model).

Difference from a regular LLM: an LLM generates a sentence you then parse into an if
statement; a Jev-class model IS the if statement. Software branches directly on "0.88".

## Where they fit in comfyui-video-ui (grounded in real code)

### 1. The M-F role router (already designed for this)
`docs/box-tasks/mf-role-router.md` specs a small classifier (llama3.2:1b class) that
reads every user message and picks Director/Screenwriter/Navigator/Teacher/Bug-Reporter,
with confidence >= 0.85 else fallback. A SemIf-style scorer is EXACTLY this: typed
probabilities for the 5 roles, ~200ms, ~free, local. The router prompt template becomes
option labels; the confidence threshold logic is unchanged. FIRST candidate.

### 2. Navigator confirmation layer (M-F)
The navigator's confirm-cards (from navigator-permissions-impl.md) need risk classification:
is this action destructive (delete scene / overwrite workflow) vs safe (set slot)?
A Jev-class judgment gates auto-run vs ask-user. Sub-300ms so the card logic stays snappy.

### 3. Background triggers (Gui's instinct - confirmed)
Users won't only ASK; the UI can watch and act. Real decision points found in the code:
- Render finished but frame quality ambiguous? -> classify retry vs accept.
- Scene has no prompt and user submits? -> classify: block+explain vs auto-draft.
- Long render queue: classify priority order (scene completeness, deadline hints).
Each is a 1-question/3-options call - the exact shape these models want.

### 4. Script formatting - NO (important negative result)
Fountain parsing is already deterministic regex (fountain_parser.py): headings/cues/
parentheticals are syntax, not semantics. A classifier would ADD failure modes, not
remove them. The creative step (scene breakdown from prose) stays with the main LLM
(qwen3:0.6b already viable per M-E benchmarks, format=json constrained decoding).
Where Jev-class DOES help in the script flow: not writing or formatting the script -
CLASSIFYING it: "does scene 3 have enough visual detail to render?" (yes/no/partial),
"which character speaks this line?" (multi-option), "is this direction or dialogue?"
when the regex is ambiguous. Fidelity-check triage (M-H) is the natural home.

### 5. M-H fidelity checks (H-2)
The whisper spec's fuzzy line matching produces "close but not exact" matches. A
Jev-class call per mismatch - "is this the same line?" - is cheaper and faster than an
LLM call, and confidence-gated: >0.9 auto-accept, <0.5 flag for human, middle = ask.

### 6. NOT fits (honest negatives)
- NOT the Screenwriter (it cannot write).
- NOT the Teacher (needs prose, examples, empathy).
- NOT a general fallback for the router's low-confidence path (that needs reasoning).
- NOT the Director (planning = reasoning over many constraints).
Rule of thumb: ONE question, N options, sub-second latency wanted -> Jev-class.
Anything that needs PROSE -> main LLM.

## Where they run
- Our 5070 Ti (17GB): a 4B BF16 model fits trivially (SemIf's target).
- Even in-browser (WebGPU demo exists) - zero backend cost for classification.
- The box (CPU-only): SemIf reads logits from a 4B model on CPU - slower than GPU but
  the box already runs 27B IQ3_S at 2 tok/s, so a one-shot logit read is still fast.

## Adoption plan (post-M-C, per POCOCK-METHODS-APPLICATION)
1. M-C first: e2e test flow with the plain LLM router as specced.
2. When M-F router implementation begins: benchmark SemIf (4B, GPU) vs LLM-call router
   on a golden dataset (100 labeled user messages) - accuracy, latency, cost.
3. Adopt only if accuracy >= LLM router AND latency meaningfully better (it will be).
4. Then extend to navigator risk-gating + M-H triage.

Provenance: Jev dossier yt-53wdoi7x8i-open-jev-models (SemIf = MIT, 3.1K stars, active),
yt-ymgh8js6wb8-nate-jev (64K ctx note, evals advice), yt-wzzu1hnsc8-jev-typesafe (main entry).