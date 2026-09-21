# M-C Plan B Test Walkthrough: `test2` Project

**Scope:** Verify render pipeline and export for existing `test2` project.
**Resolution:** 0.2MP Draft (512x512 or equivalent low-res preset).
**Precondition:** `test2` project exists in Library with at least one scene.

---

### Step 1: Open `test2` Project

*   **UI Click Path:**
    1.  Navigate to **Script Library** surface.
    2.  Locate `test2` in the list.
    3.  Click **Script Card (Row)** (ID: **SL-04**).
*   **Expected Result:**
    *   Navigates to **Script Document** or **Timeline** view (depending on app flow, typically Timeline for render-ready projects).
    *   `activeScriptId` is set to `test2`'s ID.
    *   Scene cards load in the Timeline.
*   **Failure Mode (Bugs):**
    *   **B1 (Stale State):** If `test2` was recently edited, the UI may show outdated scene counts. *Check:* Refresh page if scene count looks wrong.
    *   **B2 (API 404):** If `test2` was deleted server-side but cached in UI, click will fail silently or show "Project not found." *Check:* Verify project exists in Library list before clicking.

### Step 2: Select Scene & Submit Render

*   **UI Click Path:**
    1.  In **Timeline** surface, ensure scene status is `ready` or `draft`.
    2.  Click **"Submit All Ready"** button (ID: **T3**) in the Timeline header.
    *   *Alternative:* If submitting a single scene, use **SceneCard** "Render" action (if visible) or ensure it's in `ready` state and use T3.
*   **Expected Result:**
    *   `POST /comfyui/submit` is triggered (via `comfyuiApi.submitAll`).
    *   Scene status changes from `ready`/`draft` to `queued` (yellow bar, ID: **S12**).
    *   No immediate error toast.
*   **Failure Mode (Bugs):**
    *   **B3 (Queue Stuck):** Scene remains `queued` indefinitely. *Check:* If no change to `rendering` within 30s, check ComfyUI server logs.
    *   **B4 (Permission Denied):** 403 error on submit. *Check:* Verify user has render permissions for `test2`.
    *   **B5 (Payload Mismatch):** 400 error if scene prompt is empty or malformed. *Check:* Verify scene has a valid prompt (ID: **S19**).

### Step 3: Poll Status

*   **UI Click Path:**
    *   **Passive UI:** No user action required.
    *   Observe **Scene Status Badges** (ID: **W-53** / **S10**).
*   **Expected Result:**
    *   System polls `comfyuiApi.pollStatus(script.id)` every 5s (ID: **W-52**).
    *   Scene status transitions: `queued` â†’ `rendering` (orange pulse, ID: **S10**) â†’ `complete` (green).
    *   **Timing at 0.2MP Draft:**
        *   `queued` â†’ `rendering`: < 10s.
        *   `rendering` â†’ `complete`: 15â€“45s (depending on GPU load).
*   **Failure Mode (Bugs):**
    *   **B3 (Queue Stuck):** Status stays `queued` > 60s. *Action:* Cancel render (ID: **S13**) and retry.
    *   **B1 (Stale State):** UI shows `rendering` but backend is `error`. *Check:* Hard refresh to sync state.
    *   **B5 (Payload Mismatch):** Status jumps to `error` (red, ID: **S14**) with message "Invalid prompt." *Action:* Edit prompt (ID: **S15**) and resubmit.

### Step 4: Export

*   **UI Click Path:**
    1.  In **Timeline** surface, click **"Export"** button (ID: **T2**) in the header.
    2.  In **ExportPanel** (ID: **W-70** / **E1-E10**):
        *   Select Resolution: **720p** or **original** (ID: **E4**).
        *   Type Output Name: `test2_draft` (ID: **E5**).
        *   Click **"Assemble & Export"** button (ID: **E6**).
*   **Expected Result:**
    *   `exportApi.assemble(scriptId, ...)` is called.
    *   Progress bar appears (ID: **E6** step 3).
    *   System polls `exportApi.progress(scriptId)` every 2s.
    *   On 100%: **Completed Export** video player appears (ID: **E7**).
    *   **Timing at 0.2MP Draft:**
        *   Assembly: 10â€“20s (fast due to low res).
        *   Total: < 30s.
*   **Failure Mode (Bugs):**
    *   **B2 (API 404):** Export fails if scene render files are missing. *Check:* Ensure scene status is `complete` before exporting.
    *   **B4 (Permission Denied):** 403 on export. *Check:* Verify user can export `test2`.
    *   **B5 (Payload Mismatch):** 400 error if output name is invalid (e.g., special chars). *Check:* Use alphanumeric + underscore only.

---

### Bug Recognition Cheat Sheet

| Bug ID | Symptom | Likely Cause | Tester Action |
| :--- | :--- | :--- | :--- |
| **B1** | UI state doesn't match backend (e.g., shows `rendering` but is `error`) | Stale cache / polling failure | Hard refresh (Ctrl+R) to resync. |
| **B2** | 404 errors on submit/export | Project/scene deleted server-side | Verify project exists in Library; recreate if needed. |
| **B3** | Scene stuck in `queued` > 60s | ComfyUI worker down / queue full | Cancel render (ID: **S13**), check server health, retry. |
| **B4** | 403 Forbidden on submit/export | User lacks permissions | Check user role; contact admin if needed. |
| **B5** | 400 Bad Request on submit/export | Invalid prompt, empty scene, or bad filename | Edit prompt (ID: **S15**); simplify output name (ID: **E5**). |

**Note:** All endpoints referenced (`/comfyui/submit`, `comfyuiApi.pollStatus`, `exportApi.assemble`) are real backend calls per UI-ACTION-MANUAL. Timings are estimates for 0.2MP draft on standard GPU.
