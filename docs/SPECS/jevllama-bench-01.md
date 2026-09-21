# Jevllama Classifier — First Real Benchmarks (qwen3 via Ollama)
#project/jevllama #benchmark

> 2026-09-21, live runs on Gui's Windows machine (RTX 5070 Ti, Ollama 127.0.0.1:11434).
> Golden mini-set: 8 labeled video-app routing messages. This is directional data (n=8),
> the full golden set (100+) comes next.

## Setup evolution (what we learned live)
- qwen3 emits a hidden 'thinking' field even with /no_think in raw generate -> thinking
  chains of 200-600 tokens = 0.5-84s calls. FIX: /api/chat + think:false.
- First-token is often a newline -> naive first-word parsing fails. Enum-constrained
  structured output (format enum) is the Ollama equivalent of SemIf's logit read.
- Cold load dominates first call (84s CPU load on 0.6b; model stays warm after).

## Results (chat API, think:false, enum-constrained JSON)
| Model | Accuracy | Avg latency (warm) |
|---|---|---|
| qwen3:0.6b | 4/8 (50%) | 0.14s |
| qwen3:4b   | 6/8 (75%) | 0.20s |

Failures at 4B: "Plan the render sequence" -> NAVIGATOR (expected DIRECTOR, close but
wrong), "structure a 90-second short" -> TEACHER. Both plausibly fixable with a
better rubric prompt - the prompt was bare (no role definitions). NEXT: rubric prompt.

## Multi-dimensional routing (the Jevllama decision shape) - 4B, works
- "Rewrite docs for 13 routes, no rush, overnight" -> {MEDIUM, LATER} @ 0.45s ✓
- "App crashing right now, user waiting" -> {EASY, NOW} @ 0.23s (difficulty arguable)
Two dimensions in ONE call, sub-half-second, enum-locked. The router core works.

## Implications
- Latency is a NON-ISSUE: 0.1-0.5s per decision via plain Ollama chat (SemIf's
  logit-read would be even faster + gives real probabilities, not just argmax).
- Accuracy needs the rubric + real probabilities (SemIf) + bigger golden set before
  trusting thresholds. 0.6B is NOT good enough for classification (50%).
- GPU contention check pending: model stays loaded; 4B ~2.5GB VRAM alongside ComfyUI.


## Round 2 results (same 8-msg set, same machine)
| Model | Bare prompt | With role rubric | Rubric latency |
|---|---|---|---|
| qwen3:0.6b | 4/8 (50%) | not tested (ruled out) | — |
| qwen3:4b | 6/8 (75%) | **8/8 (100%)**, reproduced at temp=0 | 0.20-0.44s |
| qwen3:8b | 4/8 (50%) — WORSE than 4B bare | 7/8 (88%) | 0.13-0.56s |

## THE HEADLINE: the rubric is the model
Bigger did NOT mean better (8B was worse than 4B with the bare prompt). Quality came
from the ROLE RUBRIC (one line per role defining scope). 4B + rubric = 8/8 twice,
0.2s per decision. This is a prompt-engineering result, not a params result.

## Hardware footprint (Gui's 6GB-RAM question)
- 4B model = 2.5GB weights, needs ~3GB VRAM/RAM. Works on machines with 6-8GB free.
- 0.6B = 522MB (but 50% accuracy - NOT viable as classifier).
- With 4B + 8B BOTH loaded + ComfyUI-era desktop usage: 11.8/16.3GB VRAM on 5070 Ti.
  Router-only machines need just the 4B (~3GB).
- Enterprise cloud classifier = TypeSafe (waitlist) or a bigger cloud model via enum
  JSON - same interface, bundled as enterprise convenience feature (Gui's idea, sound:
  multi-machine fleets get one consistent classifier without local hardware).

## Next
1. Full golden set (100 messages, labeled by me + spot-checked by Gui).
2. SemIf-style true logit probabilities (confidence thresholds need real numbers,
   not just argmax) - via llama.cpp logprobs or SemIf scorer on the 4B.
3. Box queue as 4th lane integration test.
