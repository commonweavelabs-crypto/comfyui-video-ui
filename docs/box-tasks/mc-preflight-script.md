**Pre-Flight Review: ComfyUI Video Workflow UI (M-C)**

> ⚠️ REVIEW NOTE (added by Hermes 9/17): findings 1a "Missing Render Routes" and 1b "Missing
> Export/Assembly Logic" are FALSE — artifacts of the input scope (this job only received
> llm.py + scripts.py; the render/export layer lives in comfyui.py + export.py and is intact).
> The three error-handling findings below (silent provider probe, unhelpful 500s, truncated
> status errors) are verified real. See mc-preflight-render.md for the render-flow review.

### 1. Flow-Blocking Bugs
*   **Missing Render Routes:** The provided `backend/routes/llm.py` contains **no** routes for `submit`, `poll`, or `cancel` renders, nor any WebSocket endpoints for progress. The happy path (Script -> Scenes -> Render -> Export) is completely broken because the backend does not expose the ComfyUI interaction layer. The UI will fail on the first attempt to submit a render job.
*   **Missing Export/Assembly Logic:** There is no code path to assemble rendered scenes into a final video file. The flow ends at "export/assemble," but no backend support exists for this step.

### 2. Missing Error Handling
*   **Silent Failure in Provider Probing (`llm.py:58-68`):** In `_probe_local`, if `resp.json()` fails or returns unexpected data, the exception is caught and ignored (`continue`). If a local provider is reachable but returns malformed JSON, the user sees no provider in the list with no explanation. This is a silent failure that confuses first-time users who have a running server but see it as "not detected."
*   **Unhelpful 500s in Connect (`llm.py:138-145`):** In `connect_provider`, if `path.write_text` fails (e.g., permissions issue on `data/llm_config.json`), an unhandled `OSError` will propagate as a generic 500 Internal Server Error. The user receives no specific message about file system permissions or path issues.
*   **Ambiguous Status Check (`llm.py:172-178`):** In `llm_status`, if `llm_adapter.chat_completion` fails due to network timeout or API key mismatch, the error is truncated to 200 chars (`str(e)[:200]`). For a first-time user, a truncated "Connection refused" or "401 Unauthorized" might be cut off or unclear, leading to confusion about whether the issue is network or credentials.

### 3. Race Conditions
*   **None in Provided Code:** The provided `llm.py` is stateless regarding render jobs. However, since the render polling/WS flow is **missing**, we cannot verify race conditions in that specific area. *Note: In a full implementation, concurrent polls for the same job ID or WS disconnects during progress updates are common race conditions, but they are not present in this file.*

### 4. Top 3 Fixes Before E2E Test
1.  **Implement Render Submission & Polling Routes:** Add `POST /api/render/submit`, `GET /api/render/status/{job_id}`, and `POST /api/render/cancel/{job_id}` to `backend/routes/render.py` (new file). Without these, the core video generation flow is impossible.
2.  **Add WebSocket Progress Endpoint:** Implement `WS /ws/render/{job_id}` to stream progress updates from ComfyUI to the UI. Without this, the user has no feedback during the long render process, leading to perceived hangs.
3.  **Implement Video Assembly/Export Route:** Add `POST /api/render/export/{job_id}` to assemble scene clips into a final MP4. Without this, the user cannot retrieve the final product, breaking the end-to-end flow.
