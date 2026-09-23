# AI Film Craft Rules — extracted + applied to this project
_Sources: Pj Accetturo's Squid Heist process reel (2.2K likes, archived:
link-archive ig-20260923-squid-heist-pjaccetturo) + Qwen Image 2.1 reel
(link-archive ig-20260923-qwen-image-21). Added to roadmap by Gui 2026-09-23._

## The 3 rules (bake into the Director / prompt engine)

### Rule 1 — NEVER prompt emotions; prompt BEHAVIOR
❌ "the character was happy" / "she's afraid"
✅ "her eyes dart to the window, breathing gets shallow, her grip tightens
   on the sword"
→ The Director prompt engine MUST translate emotional intent into observable
   physical behavior. This is the "emotion engine": an emotion -> behavior
   mapping table the Director consults when writing video-model prompts.
   (Emotion words read by models as label; behavior reads as visual reality.)

### Rule 2 — One character sheet per story STATE
Reference images are generated per story state, not per character:
- mask on / mask off / weapon drawn / injured (act 3)
- Every state change in the script = a new reference sheet
Maps to: Character Sheets pages (initial frames) in the video UI.

### Rule 3 — LOCK THE SCALE
Creatures/props drift in size because the model has no size reference.
Fix: ONE clean reference shot (character holding the subject against a plain
backdrop) + subject size stated in inches as a HARD RULE in every prompt.
Maps to: Environment Sheets + scale-lock reference shot generation.

### Workflow (his skill's shape — we build our own)
script -> split into ~30-second sequences -> prompts written per sequence
(behaviorally, with state-matched references, scale-locked). Our video UI
should ship exactly this helper: paste script -> sequence split -> Director
writes prompts under these rules.

## Qwen Image 2.1 — the local editing/generation engine
- Open weights (Alibaba, 2026-09-20): 7B generator + 8B Qwen3-VL encoder,
  UNIFIED text-to-image AND image editing in one model
- ComfyUI already supports it
- VRAM: ~15.6GB fp16 (borderline on 16GB 5070 Ti) -> use quantized/GGUF (fits)
- Use cases here: generate + EDIT initial shots, character sheets per story
  state, environment sheets, scale-lock reference shots — all locally
- Nano Banana 2 comparison is disputed/thin — but NB2 is closed (not
  downloadable); Qwen is open: for local workflow it wins by default
