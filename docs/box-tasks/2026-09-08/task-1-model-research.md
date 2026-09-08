# BOX TASK: Model research — recommended-model candidates (qwen3 4B class)

You are helping the ComfyUI Video Workflow UI project. Task: research LOCAL
LLM candidates for the 'Recommended' tier of the app's model picker.

Context: the app uses Ollama models to (a) convert movie ideas into Fountain
screenplays as strict JSON, and (b) reformat existing screenplays. Verified so
far (RTX 5070 Ti 16GB):
- qwen3:0.6b: floor tier. Schema adherence OK; full screenplay fails; chunked
  at 3K scene-boundary chunks = 89% line fidelity.
- gemma3:12b: recommended tier. Full 19K screenplay pass verified, 8 scenes,
  faithful dialogue.

RESEARCH QUESTIONS (answer with sources):
1. Which Apache-2.0/MIT licensed Ollama models in the 3B-8B class are best at
   structured JSON output + long-document formatting as of late 2026?
   Candidates to evaluate: qwen3:4b, qwen3:8b, llama3.1:8b, mistral:7b,
   phi-4-mini, gemma3:4b. For each: license, context window, VRAM at Q4,
   known JSON/structured-output reliability, HF/Ollama availability.
2. Which have documented context windows >= 32K (needed for ~20K-char prompts)?
3. Rank them as: floor tier (<1B), middle tier (3-8B), recommended tier (12B+).
4. Note any models with known issues on Ollama Windows (like the
   format:"object" bug on our version - format:"json" is the safe one).

OUTPUT: a markdown file saved as research-models-recommended.md with a
comparison table + a final recommendation for the app's default 'Recommended'
model with reasoning. Keep it factual, cite model cards.
