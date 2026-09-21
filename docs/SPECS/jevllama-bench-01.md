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
