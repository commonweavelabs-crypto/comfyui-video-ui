# Role Routing Architecture: ComfyUI Video Workflow UI

## 1. Role-Router Design

The system operates on a **single-threaded conversation model** where a lightweight `Router` intercepts every user message before it reaches the active role. The Router is not a full LLM agent but a classification layer.

**Architecture Flow:**
1.  **User Input** â†’ `routes/llm.py` (existing endpoint).
2.  **Pre-Processing:** `router.py` extracts `user_message`, `project_state`, and `active_role`.
3.  **Classification Call:** A small, fast LLM (e.g., `llama3.2:1b` or `gpt-4o-mini`) receives the `ROUTER_PROMPT` (see Section 3).
4.  **Decision Logic:**
    *   If `confidence >= 0.85`: Route to specified role.
    *   If `confidence < 0.85`: Trigger Fallback Chain (Section 4).
5.  **Execution:** The selected roleâ€™s system prompt is injected, and the message is forwarded to the main LLM (GLM/Ollama) via the existing `llm.py` handler.

**Explicit Routing Rules:**
| Intent Pattern | Target Role | Trigger Keywords/Context |
| :--- | :--- | :--- |
| **Planning/Strategy** | **Director** | "Plan", "Scene structure", "Pacing", "Budget", "Next step", "Render question" |
| **Creative Writing** | **Screenwriter** | "Script", "Dialogue", "Shot description", "Rewrite scene", "Character motivation" |
| **UI Automation** | **Navigator** | "Click", "Select node", "Set parameter", "Run workflow", "Open file", "Action schema" |
| **Educational** | **Teacher** | "How do I", "Explain", "Tutorial", "Why does this error", "Best practice" |
| **Diagnostics** | **Bug Reporter** | "Error", "Crash", "Traceback", "Not working", "Unexpected output" |

## 2. Role Context Isolation

To prevent "cross-talk" (e.g., Screenwriter giving UI instructions), context is strictly partitioned.

### A. Per-Role System Prompts
Each role has a dedicated, immutable system prompt stored in `prompts/roles/`.
*   `director.md`: Focuses on narrative structure, pacing, and technical feasibility of video generation.
*   `screenwriter.md`: Focuses on dialogue, shot composition, and script formatting.
*   `navigator.md`: **Strictly constrained** to the 18-action schema. It does not generate creative content; it only outputs JSON actions.
*   `teacher.md`: References `UI-ACTION-MANUAL` for step-by-step guidance.
*   `bug_reporter.md`: Formats error logs for developer review.

### B. Shared Project State (Read-Only for Roles)
All roles access a shared `ProjectState` object (JSON) containing:
*   `current_scene_id`
*   `active_workflow_id`
*   `recent_actions` (last 5 Navigator actions)
*   `script_draft` (current version)

**Isolation Rule:**
*   **No Cross-Talk:** A role cannot see the *internal reasoning* of another role. It only sees the *output* of the previous role if explicitly handed off.
*   **State Immutability:** Roles cannot modify `ProjectState` directly. Only the `Navigator` (via successful action execution) or `Director` (via plan approval) can update state.

### C. Handoff Mechanism
When the Router detects a role switch, it appends a **Handoff Note** to the context window:
> `[HANDOFF] Previous role: Screenwriter. Context: Scene 4 script finalized. Current role: Director. Task: Plan rendering sequence for Scene 4.`

This ensures continuity without leaking irrelevant context.

## 3. Exact Router Prompt Template

This prompt is sent to the **small classifier model**. It must return strict JSON.

```text
SYSTEM:
You are a Role Router for a ComfyUI Video Workflow Assistant.
Your job is to classify the user's intent into one of these roles:
- DIRECTOR: Planning, strategy, pacing, render questions.
- SCREENWRITER: Script writing, dialogue, shot descriptions.
- NAVIGATOR: UI actions, clicking nodes, setting parameters, running workflows.
- TEACHER: Tutorials, explanations, "how-to" questions.
- BUG_REPORTER: Error reports, crash logs, unexpected behavior.

INPUT:
Project State: {{project_state_json}}
Active Role: {{active_role}}
User Message: {{user_message}}

RULES:
1. If the user asks to perform a UI action (e.g., "click the load image node"), route to NAVIGATOR.
2. If the user asks for creative content (e.g., "write a dialogue for scene 2"), route to SCREENWRITER.
3. If the user asks for planning or strategy (e.g., "how should I structure this video?"), route to DIRECTOR.
4. If the user asks for help or explanation (e.g., "how do I connect these nodes?"), route to TEACHER.
5. If the user reports an error (e.g., "I got a CUDA error"), route to BUG_REPORTER.
6. If ambiguous, prefer the Active Role unless the intent clearly shifts.

OUTPUT FORMAT:
Return ONLY a JSON object with these keys:
{
  "role": "DIRECTOR" | "SCREENWRITER" | "NAVIGATOR" | "TEACHER" | "BUG_REPORTER",
  "confidence": 0.0-1.0,
  "handoff_note": "Brief context for the new role (max 20 words)"
}
```

## 4. Fallback Chain (Confidence < 0.85)

If the Router returns `confidence < 0.85`, the system executes the following chain:

1.  **Check Active Role:**
    *   If `active_role` is `NAVIGATOR` and `confidence < 0.85`, **do not switch**. Assume the user is continuing a UI task. Route to `NAVIGATOR`.
    *   If `active_role` is `DIRECTOR` or `SCREENWRITER`, proceed to Step 2.

2.  **Clarification Prompt (LLM Call):**
    *   Send a lightweight clarification prompt to the **main LLM** (GLM/Ollama):
        > "The user's intent is ambiguous. Ask one clarifying question to determine if they want to: (A) Plan/Strategy, (B) Write Script, (C) Perform UI Action, (D) Learn, or (E) Report Bug."
    *   The LLM generates a clarifying question.
    *   The conversation pauses until the user responds.

3.  **Re-Routing:**
    *   The userâ€™s clarification is treated as a new message.
    *   The Router is called again with the combined context (`original_message + clarification`).
    *   If confidence is still < 0.85, default to `DIRECTOR` (safest role for planning).

## 5. Cost Note: Local 0.6B Classifier vs. Main-LLM Routing

**Recommendation: Use a Local 0.6B-1B Classifier.**

*   **Latency:** A local 0.6B model (e.g., `llama3.2:1b` on CPU or `phi-3-mini` on GPU) completes classification in **< 200ms**. A main LLM (GLM-4 or GPT-4o) takes **1-3s**.
*   **Cost:** Local inference is $0. Main LLM calls cost $0.001-$0.01 per message.
*   **Viability:**
    *   **Yes, viable.** The task is simple classification, not generation.
    *   **Model Choice:** `llama3.2:1b` or `gemma-2b` is sufficient. It fits in 4GB VRAM.
    *   **Hybrid Approach:** If local model is unavailable, fall back to `gpt-4o-mini` (cheap, fast) for routing.
*   **Performance Impact:** Adds ~200ms to every user message. Acceptable for a desktop UI.

## 6. Worked Example Conversation

**Context:**
*   `Project State`: Scene 3 script exists. Workflow loaded.
*   `Active Role`: Screenwriter.

**Turn 1:**
*   **User:** "Can you make the dialogue in scene 3 more sarcastic?"
*   **Router Output:** `{"role": "SCREENWRITER", "confidence": 0.95, "handoff_note": "Rewrite scene 3 dialogue with sarcasm."}`
*   **Action:** Screenwriter rewrites dialogue.

**Turn 2:**
*   **User:** "Now, click the 'Load Image' node and set the path to 'assets/bg.png'."
*   **Router Output:** `{"role": "NAVIGATOR", "confidence": 0.98, "handoff_note": "UI action: Set Load Image node path."}`
*   **Action:** Navigator outputs JSON action: `{"action": "set_node_param", "node_id": "load_image_1", "param": "path", "value": "assets/bg.png"}`.
*   **System:** Executes action. Updates `ProjectState`.

**Turn 3:**
*   **User:** "Why did the render fail with a CUDA out of memory error?"
*   **Router Output:** `{"role": "BUG_REPORTER", "confidence": 0.92, "handoff_note": "Diagnose CUDA OOM error."}`
*   **Action:** Bug Reporter analyzes log, suggests reducing resolution or clearing cache.

**Turn 4:**
*   **User:** "Okay, let's plan the next scene. It should be a night chase."
*   **Router Output:** `{"role": "DIRECTOR", "confidence": 0.90, "handoff_note": "Plan night chase scene structure."}`
*   **Action:** Director proposes scene structure, pacing, and technical requirements.

**Turn 5:**
*   **User:** "How do I connect the Lora node to the KSampler?"
*   **Router Output:** `{"role": "TEACHER", "confidence": 0.88, "handoff_note": "Tutorial: Connect Lora to KSampler."}`
*   **Action:** Teacher provides step-by-step UI instructions.
