# M-C FIRST END-TO-END TEST SCRIPT: ComfyUI Video Workflow UI

**User:** Gui (Non-Engineer)
**Goal:** Generate a short video from a text script using the local ComfyUI pipeline.
**Prerequisites:** Python 3.10+, ComfyUI installed locally, `Documents/ComfyUI` folder exists.

---

### Step 1: Start Backend and Frontend

**Action:**
1.  Open a terminal (Command Prompt or PowerShell).
2.  Navigate to your project root: `cd Documents/ComfyUI`
3.  Create and activate the virtual environment:
    ```bash
    uv venv .venv
    .venv\Scripts\activate  # Windows
    # OR
    source .venv/bin/activate  # Mac/Linux
    ```
4.  Install dependencies (if not already done):
    ```bash
    uv pip install -r requirements.txt
    ```
5.  **Start the Backend (API):**
    ```bash
    python comfyui.py
    ```
    *Expected:* Terminal shows `Uvicorn running on http://0.0.0.0:8502`.
6.  **Start the Frontend (UI):**
    Open a *second* terminal window.
    ```bash
    cd Documents/ComfyUI
    .venv\Scripts\activate
    streamlit run app.py
    ```
    *Expected:* Browser opens automatically at `http://localhost:8503`.

**Expected Result:**
*   Backend terminal is running on port 8502.
*   Frontend UI is visible in the browser on port 8503.
*   No red error messages in either terminal.

**IF-IT-FAILS:**
*   **Port in use:** If you see "Address already in use," close other instances of Python/Streamlit.
*   **Missing dependencies:** If `uv pip install` fails, ensure `uv` is installed globally.
*   **ComfyUI not running:** The backend will start, but rendering will fail later. Ensure your local ComfyUI server is also running (usually on port 8188) before proceeding.

---

### Step 2: Connect an LLM Provider

**Action:**
1.  In the UI, locate the **"LLM Settings"** or **"Connection"** sidebar/modal.
2.  Select your provider (e.g., OpenAI, Anthropic, or Local Ollama).
3.  Enter your **API Key**.
4.  Select the **Model** (e.g., `gpt-4o`, `claude-3-opus`, or `llama3`).
5.  Click **"Test Connection"** or **"Save"**.

**Expected Result:**
*   A green checkmark or "Connected Successfully" message appears.
*   The backend logs in `llm.py` show a successful HTTP 200 response.

**IF-IT-FAILS:**
*   **401 Unauthorized:** Your API key is wrong or expired.
*   **Timeout:** Check your internet connection. If using a local model (Ollama), ensure the Ollama server is running on `localhost:11434`.
*   **B1 Raw Result Return:** If the UI shows raw JSON or a traceback instead of a clean message, this is a known bug (B1). The backend is returning the raw API response object instead of parsing it. *Workaround:* Ignore the ugly text; if the connection test says "Success" anywhere in the text, proceed.

---

### Step 3: Create Project + Write Script

**Action:**
1.  Click **"New Project"**.
2.  Enter a **Project Name** (e.g., "Test Video 1").
3.  In the **Script Input** box, type a simple prompt:
    > "A cinematic shot of a red car driving down a rainy street at night. Slow motion."
4.  Click **"Generate Script"** or **"Save Script"**.

**Expected Result:**
*   The script is saved.
*   The UI displays the script text clearly.
*   A "Scenes" section appears below, initially empty or showing "0 scenes."

**IF-IT-FAILS:**
*   **LLM Error:** If the script generation fails, go back to Step 2.
*   **Empty Script:** If the box is empty after generation, check the backend terminal for errors in `llm.py`.

---

### Step 4: Break Into Scenes

**Action:**
1.  Locate the **"Break into Scenes"** button (or "Generate Scenes").
2.  Click it.
3.  Wait for the LLM to process the script.

**Expected Result:**
*   The UI populates a list of scenes (e.g., Scene 1: "Red car entering frame," Scene 2: "Rain on windshield").
*   Each scene has a unique ID.
*   The status for each scene is **"Pending"** or **"Ready"**.

**IF-IT-FAILS:**
*   **No Scenes Generated:** The LLM may have returned a malformed response. Try regenerating the script first.
*   **B1 Raw Result Return:** If you see JSON code in the scene list, this is Bug B1. The UI is not parsing the LLM's structured output. *Workaround:* Manually copy the scene descriptions from the raw JSON into the scene fields if the UI allows editing, or restart the app.

---

### Step 5: Submit First Scene Render

**Action:**
1.  Ensure your local **ComfyUI** server is running and has a **Video/Image Workflow** loaded (e.g., AnimateDiff, SVD, or a standard image-to-video workflow).
2.  In the UI, select **Scene 1**.
3.  Click **"Submit Render"** for that specific scene.
4.  Observe the progress bar.

**Expected Result:**
*   The scene status changes to **"Rendering"**.
*   A progress percentage appears (e.g., 10%, 25%, 50%).
*   The backend terminal (`comfyui.py`) shows logs of sending prompts to ComfyUI and polling for status.

**IF-IT-FAILS:**
*   **Connection Refused:** ComfyUI is not running on port 8188.
*   **Workflow Not Found:** The UI is trying to load a workflow ID that doesn't exist in your ComfyUI library. Ensure the workflow is saved in ComfyUI and the ID matches.
*   **B5 Submit-All No-Stop:** If you accidentally clicked "Submit All," the system will queue *every* scene. This is Bug B5. There is no easy stop button. *Workaround:* You must cancel individual renders or restart the backend to clear the queue.
*   **Poll + WS Race:** If the progress bar jumps erratically (e.g., 10% -> 90% -> 10%), this is Bug B5 (Poll/WebSocket race). The UI is receiving conflicting status updates. *Workaround:* Ignore the erratic numbers; wait for the final "Complete" or "Failed" status.

---

### Step 6: Pick Active Render

**Action:**
1.  Wait for Scene 1 to finish rendering.
2.  The status should change to **"Complete"**.
3.  In the **"Active Renders"** or **"Scenes"** list, ensure Scene 1 is highlighted or marked as the current active output.
4.  (Optional) If you have multiple scenes, ensure you are selecting the correct one for export.

**Expected Result:**
*   Scene 1 shows a thumbnail or "Video Ready" indicator.
*   The file path for the generated video is visible in the backend logs (e.g., `output/scene_1.mp4`).

**IF-IT-FAILS:**
*   **B3 Empty-Files-Complete:** The status says "Complete," but the file is 0 bytes or missing. This is Bug B3. The backend marked the render as done before the file was fully written to disk. *Workaround:* Wait 10-30 seconds and refresh the UI. If the file is still empty, check the ComfyUI output folder manually.
*   **B4 Cancel Leftovers:** If you previously cancelled a render, you might see ghost entries or corrupted files. This is Bug B4. *Workaround:* Delete the old files from the `output` folder manually and restart the backend.

---

### Step 7: Export/Assemble

**Action:**
1.  Click the **"Export"** or **"Assemble Video"** button.
2.  Select the scenes to include (ensure Scene 1 is checked).
3.  Choose an output format (e.g., MP4).
4.  Click **"Start Assembly"**.

**Expected Result:**
*   The backend (`export.py`) begins concatenating the scene videos.
*   A progress bar appears for the assembly process.
*   A final file is created in the `output` folder (e.g., `final_video.mp4`).

**IF-IT-FAILS:**
*   **Assembly Failed:** Check if the scene files exist. If B3 (Empty Files) occurred, the assembler will fail.
*   **FFmpeg Error:** Ensure FFmpeg is installed and in your system PATH.
*   **B3 Empty-Files-Complete:** If the export fails immediately, verify the scene files are not empty.

---

### Step 8: Verify Output

**Action:**
1.  Navigate to your `Documents/ComfyUI/output` folder.
2.  Locate the final video file.
3.  Open it in a video player (VLC, QuickTime, etc.).

**Expected Result:**
*   The video plays smoothly.
*   The content matches your script (red car, rainy street).
*   The duration is reasonable (not 0 seconds).

**IF-IT-FAILS:**
*   **Corrupted Video:** If the video doesn't play, the assembly step likely failed due to missing/corrupted scene files (B3).
*   **Wrong Content:** If the video shows the wrong image, the LLM scene breakdown (Step 4) may have been incorrect. Regenerate scenes.

---

### KNOWN ISSUES (B-BUGS)

*Do not panic if you encounter these. They are known bugs in the current version.*

| Bug ID | Description | Symptom | Workaround |
| :--- | :--- | :--- | :--- |
| **B1** | **Raw Result Return** | UI displays raw JSON or Python tracebacks instead of clean text. | Ignore the ugly text. If the action succeeds (e.g., file created), proceed. |
| **B3** | **Empty-Files-Complete** | Render status says "Complete," but the video file is 0 bytes or missing. | Wait 30 seconds. Refresh UI. Check `output` folder manually. If empty, re-render. |
| **B4** | **Cancel Leftovers** | Cancelled renders leave ghost entries or corrupted files in the list. | Manually delete files from `output` folder. Restart backend to clear state. |
| **B5** | **Submit-All No-Stop** | Clicking "Submit All" queues every scene with no way to stop the queue. | Avoid "Submit All." Submit scenes one by one. If stuck, restart backend. |
| **B5** | **Poll + WS Race** | Progress bar jumps erratically (e.g., 10% -> 90% -> 10%). | Ignore progress numbers. Wait for final "Complete" status. |
