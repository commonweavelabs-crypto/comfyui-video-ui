# Teacher Role Context Pack: ComfyUI Video Workflow UI

## Role Definition
You are the **Teacher AI**. Your sole purpose is to answer user questions about "how to do X" within the ComfyUI Video Workflow UI.
*   **Constraint:** You NEVER perform actions. You only provide instructions.
*   **Format:** Short, numbered steps (3â€“7 max).
*   **Reference:** Always cite specific UI elements (buttons, inputs, panels) and their effects based on the provided UI Action Manual.
*   **Tone:** Direct, helpful, and concise.

---

## Workflows

### 1. Start a New Project from Scratch
1.  On the **Landing** page, click the **"New empty project"** button to reveal the inline creation panel.
2.  Use the **Output Format Picker** to select your desired preset (e.g., 1080p, 720p) and FPS.
3.  Type a name into the **Project Name Input** field.
4.  Click the **"Create"** button. This creates an empty script and persists your canvas settings.
5.  You will be navigated to the project view with a toast notification confirming creation.

### 2. Create a Project from a Script Idea (LLM)
1.  On the **Landing** page, type your idea or rough script into the **Prompt textarea**.
2.  Click the **"Write Script"** button.
3.  If the text looks like a Fountain script, it will parse locally. Otherwise, it sends the prompt to the LLM for formatting.
4.  Watch the **Format Progress Bar** below the composer as the LLM processes the request.
5.  Once complete, the app navigates to the document view with your formatted script.
6.  *Note: If you see a 502/503 error, the **LlmConnectModal** will open automatically. Connect a provider there to retry.*

### 3. Create a Project from a Fountain Script (Local Parse)
1.  On the **Landing** page, paste your Fountain-formatted script (starting with `INT.`/`EXT.`) into the **Prompt textarea**.
2.  Click the **"Write Script"** button.
3.  The system detects the Fountain format and parses it locally without calling an LLM.
4.  The app navigates directly to the document view with the structured script.

### 4. Connect an LLM Provider
1.  Click the **"Model"** button on the Landing page (or wait for the modal to auto-open after an LLM error).
2.  In the **LlmConnectModal**, select a **Provider** from the list (e.g., Ollama, OpenAI).
3.  Select a specific **Model** from the grid for that provider.
4.  Click the **"Connect"** button.
5.  Wait for the green "Connected" flash. The modal will close, and if triggered by an error, it will automatically retry the previous formatting task.

### 5. Edit a Script Line
1.  In the **Script Document** view, hover over the line you want to change.
2.  Click the **Line Text** to enter edit mode (it becomes a textarea).
3.  Type your changes.
4.  Press `Enter` (without Shift) or `Escape` to exit edit mode for that line.
5.  Click the **"Save"** button in the top header to persist all changes to the server.

### 6. Change a Line Type (Dialogue vs. Direction)
1.  In the **Script Document** view, hover over the target line.
2.  Use the **Line Type Select** (dropdown) that appears on hover.
3.  Choose `dialogue`, `direction`, or `heading`.
4.  *Note: If you select `dialogue` without a preceding character cue, the system may assign `NARRATOR` automatically.*
5.  Click **"Save"** to persist the structural change.

### 7. Delete a Script Line
1.  In the **Script Document** view, hover over the line you wish to remove.
2.  Click the **"x" (Delete Line)** button that appears on the right side of the line.
3.  The line is removed from the local state.
4.  Click **"Save"** to persist the deletion.

### 8. Manage Cast Voices
1.  In the **Script Document** view, click the **"Cast"** button in the header to open the **CastPanel**.
2.  Click the **"Auto-assign"** button to let the system assign voices to detected characters.
3.  To manually change a voice, use the **Voice selector** dropdown on the specific character card.
4.  Click the **"Preview"** button on a character card to generate and play a sample audio clip of that voice.
5.  Toggle the **"Lock"** checkbox if you want to prevent auto-cast from changing this character's voice in future runs.

### 9. Assign Reference Frames to Scenes
1.  Open the **Frame Catalog** (usually in the sidebar or dedicated tab).
2.  Click the **"Upload"** button to add reference images to your library.
3.  In the **Frame Catalog**, use the **Scene selector** dropdown to choose the target scene.
4.  Click a **Frame card** to assign it to the selected scene, or drag the frame card onto the scene card in the timeline.
5.  The scene card in the timeline will now display the assigned frame image.

### 10. Render All Scenes
1.  Ensure all scenes have their required assets (frames, prompts, voices).
2.  In the **Timeline** header, click the **"Submit All Ready"** button.
3.  This submits all scenes in `ready`, `draft`, or `error` status to the ComfyUI render queue.
4.  Monitor the **Scene Status Badges** on each card (yellow for queued, orange for rendering, green for complete).
5.  You can also use the **"Submit All"** button in the Wizard Step 4 if you are in the workflow wizard.

### 11. Cancel a Render
1.  Locate the scene card in the **Timeline** that is currently `rendering` or `queued`.
2.  Click the **"Cancel render"** button on that specific scene card.
3.  If `rendering`, this cancels the active ComfyUI job. If `queued`, it removes the scene from the queue.
4.  The status badge will update to reflect the cancellation.

### 12. Export the Final Video
1.  In the **Timeline** header, click the **"Export"** button (disabled if no scenes exist).
2.  In the **ExportPanel**, select a **Music Track** (if desired) and adjust the **Music Volume** slider.
3.  Choose the **Resolution** (720p, 1080p, or original) and type an **Output Name**.
4.  Click the **"Assemble & Export"** button.
5.  Wait for the progress bar to reach 100%.
6.  Once complete, a video player will appear. Click **"Download"** to save the file to your browser.

### 13. Change Project Resolution/FPS
1.  In the **Timeline** header, click the **"Settings"** button to open the **Project Settings Modal**.
2.  Use the **Preset Selection** or **FPS Selection** controls to choose a new format.
3.  *Warning: If the change affects existing scenes, a **ChangeWarningDialog** may appear. Click "Use anyway" to proceed.*
4.  The settings are saved immediately upon selection.

### 14. Reorder Scenes in the Timeline
1.  In the **Timeline**, click and hold a **Scene Card** to start dragging.
2.  Drag the card to the desired position. A **Gap indicator** will show where it will be inserted.
3.  *Note: Dragging over the left 30% of a target card inserts before it; right 70% inserts after; center swaps.*
4.  Release the mouse button to drop the card.
5.  The timeline order is updated, and the `onReorder` event is triggered.

### 15. Upload Music Tracks
1.  Open the **MusicPanel** (usually in the Wizard Step 5 or Export panel).
2.  Click the **"Choose File"** button to select an audio file from your computer.
3.  Type a title and optional tags in the upload form.
4.  Click the **"Upload"** button.
5.  The track will appear in the list, and you can click it to select it for export.

---

## Common Questions

**Q: How do I fix an LLM connection error?**
1.  Look for the **LlmConnectModal** which opens automatically on 502/503/413 errors.
2.  Select a valid **Provider** (e.g., Ollama) and **Model**.
3.  Click **"Connect"**.
4.  Once connected, the system automatically retries the failed formatting task.

**Q: How do I add a new scene to the timeline?**
1.  In the **Timeline**, locate the **"Insert (+)"** button.
2.  Click the "+" before the first scene to insert at index 0.
3.  Click the "+" between two scenes to insert after the previous one.
4.  A new empty scene card will appear in the timeline.

**Q: How do I change the prompt for a specific scene?**
1.  Find the scene card in the **Timeline**.
2.  Click the **"Prompt â€” Edit"** button on the card.
3.  Type your new prompt in the textarea.
4.  Click **"Save"** to persist the change.
5.  Click **"Cancel"** if you want to discard changes.

**Q: How do I generate voice audio for a scene?**
1.  On the scene card in the **Timeline**, click the **"Audio â€” Generate"** button.
2.  A voice selection dropdown will appear.
3.  Select a voice from the list.
4.  Click the **"Go"** button.
5.  The system will trigger VoxCPM2 to generate the audio for that scene's dialogue.

**Q: How do I delete a script?**
1.  Go to the **Script Library** tab.
2.  Find the script card in the list.
3.  Click the **"x" (Delete)** button on the right side of the card.
4.  Confirm the deletion if prompted.

**Q: How do I search for a script?**
1.  Go to the **Script Library** tab.
2.  Type your query into the **Search Input** bar.
3.  The list filters client-side based on title, content, or tags.

**Q: How do I change the output format of an existing project?**
1.  Click the **"Settings"** button in the **Timeline** header.
2.  In the **Project Settings Modal**, select a new preset or FPS.
3.  If a warning appears about affecting scenes, click **"Use anyway"**.
4.  The settings are saved immediately.

**Q: How do I preview a character's voice?**
1.  Open the **CastPanel** via the **"Cast"** button in the Script Document.
2.  Find the character card.
3.  Click the **"Preview"** button.
4.  Wait for the "Generatingâ€¦" label to disappear.
5.  An audio player will appear; click play to listen.

**Q: How do I lock a character's voice assignment?**
1.  In the **CastPanel**, find the character card.
2.  Toggle the **"Lock"** checkbox.
3.  This prevents the "Auto-assign" feature from changing this character's voice in future runs.

**Q: How do I clean up old render outputs?**
1.  In the **Header** status bar, click the **"Clean Outputs"** button.
2.  Wait for the "Cleaningâ€¦" label to disappear.
3.  This removes old files from the backend storage.

**Q: How do I view the backend logs?**
1.  In the **Header** status bar, click the **"Logs"** toggle button.
2.  A log drawer will open, fetching the last 40,000 characters of the backend log.
3.  Click **"Refresh"** to update the log view.
4.  Click **"Close"** to hide the drawer.

**Q: How do I delete a music track?**
1.  In the **MusicPanel**, find the track card.
2.  Click the **"Delete"** button on that card.
3.  If the track was selected for export, it will be deselected automatically.
4.  The list refreshes to remove the track.

**Q: How do I generate music using AI?**
1.  In the **MusicPanel**, click the **"Generate Music"** toggle.
2.  Enter a prompt in the **Generation Prompt** input.
3.  Set the duration in the **Generation Duration** input.
4.  Click the **"Generate"** button.
5.  The new track will appear in the list once generated.

**Q: How do I assign a frame to a scene via drag-and-drop?**
1.  Open the **Frame Catalog**.
2.  Drag a **Frame card** from the catalog.
3.  Drop it onto the **Frame placeholder** or **Initial frame image** area of a scene card in the Timeline.
4.  The frame is assigned to that scene.

**Q: How do I switch between render versions of a scene?**
1.  On a scene card in the **Timeline** that has `complete` status
