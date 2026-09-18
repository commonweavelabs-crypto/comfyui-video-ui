# Frontend Implementation Spec: M-A Reference-Sheet Generation

## 1. UX: Control Placement & Flow

### 1.1 Location in Scene Card
The **Reference Sheet** control is a collapsible section within the existing `SceneCard` component, positioned directly below the "Prompt" textarea and above the "Generate" button.

*   **Visibility**: Always visible if the scene type is `character` or `environment`. Hidden for `abstract` or `text-only` scenes.
*   **State**: Collapsed by default. Expands when the user clicks "Add Reference Sheet" or when a reference is already attached.

### 1.2 Input Methods
Two distinct input modes, toggled via a segmented control:

1.  **Upload New**:
    *   Drag-and-drop zone or file picker.
    *   Accepts: `.png`, `.jpg`, `.webp`.
    *   Max size: 10MB.
    *   On upload: Immediately uploads to ComfyUI via `POST /api/comfyui/upload` (existing pattern). Returns `filename` and `subfolder`.
2.  **Pick from Assets**:
    *   Opens a modal displaying the user's asset library (fetched from `GET /api/assets`).
    *   Filter: Images only.
    *   Selection: Click to select. Displays thumbnail preview.

### 1.3 Model Selector
A radio group or dropdown labeled "Generation Model":

*   **Option A: MiniMax H3 (Ordered Ref)**
    *   *Description*: Best for character consistency across multiple reference frames.
    *   *Default*: Selected for `character` scenes.
*   **Option B: LTX-2.5 (First-Frame)**
    *   *Description*: Best for environment/scene establishment from a single keyframe.
    *   *Default*: Selected for `environment` scenes.

*   **Dynamic Behavior**:
    *   If **MiniMax H3** is selected: The UI allows uploading **multiple** reference images (ordered list). The user can reorder images via drag-and-drop.
    *   If **LTX-2.5** is selected: The UI restricts input to **one** reference image (the first frame).

### 1.4 Draft-Low â†’ Upscale-High Toggle
A toggle switch labeled "Two-Pass Generation (Draft + Upscale)":

*   **OFF (Default)**: Single pass at 512x512.
*   **ON**:
    *   **Pass 1**: Generates at 512x512 (Draft).
    *   **Pass 2**: Automatically triggers an upscale pass to 1024x1024 (or 1280x720) using 2-4 refinement steps.
    *   *UI Feedback*: When ON, the progress bar shows two distinct phases: "Generating Draft" and "Upscaling".

---

## 2. Component Spec

### 2.1 New Props & State

**`SceneCard` Component (Modified)**
*   `onReferenceChange`: Callback to update scene state.
*   `referenceSheet`: Object `{ type: 'character' | 'environment', images: string[], model: 'h3' | 'ltx', twoPass: boolean }`.

**`ReferenceSheetControl` (New Component)**
*   **Props**:
    *   `sceneType`: `'character' | 'environment'`
    *   `value`: `ReferenceSheetState`
    *   `onChange`: `(state: ReferenceSheetState) => void`
    *   `onUpload`: `(file: File) => Promise<string>` (Returns ComfyUI filename)
    *   `assets`: `Asset[]` (From parent context)
*   **State**:
    *   `selectedModel`: `'h3' | 'ltx'`
    *   `referenceImages`: `Array<{ id: string, filename: string, previewUrl: string, order: number }>`
    *   `isUploading`: `boolean`
    *   `twoPassEnabled`: `boolean`
    *   `prompt`: `string` (Specific to reference conditioning)

### 2.2 API Calls (Mirroring `routes/comfyui.py`)

1.  **Upload Image**:
    *   `POST /api/comfyui/upload`
    *   Body: `FormData` with `file` and `subfolder=reference_sheets`.
    *   Response: `{ name: string, subfolder: string, type: 'output' }`

2.  **Introspect Slots (Validation)**:
    *   `GET /api/comfyui/slots?workflow_id={template_id}`
    *   Use to verify that the selected workflow template has the required input slots (`reference_images` or `first_frame_latent`).

3.  **Submit Generation**:
    *   `POST /api/comfyui/submit`
    *   Body:
        ```json
        {
          "workflow": { /* Modified JSON from template */ },
          "prompt": { /* ComfyUI prompt object */ }
        }
        ```
    *   Response: `{ prompt_id: string }`

4.  **Poll Progress**:
    *   `GET /api/comfyui/progress/{prompt_id}`
    *   Response: `{ status: 'running' | 'completed' | 'error', progress: number, output_files: string[] }`

### 2.3 Progress States

*   **Idle**: No active generation.
*   **Uploading**: Image being sent to ComfyUI.
*   **Submitting**: Workflow JSON being sent to ComfyUI.
*   **Generating Draft**:
    *   Progress bar 0-100%.
    *   Text: "Generating 512x512 draft..."
*   **Upscaling** (Only if `twoPassEnabled`):
    *   Progress bar 0-100% (separate poll ID).
    *   Text: "Upscaling to 1024x1024..."
*   **Completed**:
    *   Display video preview.
    *   Button: "Save to Scene" (Attaches video URL to scene card).
*   **Error**:
    *   Display error message from API.
    *   Button: "Retry".

---

## 3. Workflow Slot Mapping

The UI modifies the base workflow JSON skeletons provided in the runbook.

### 3.1 MiniMax H3 (Ordered Ref-to-Video)

| UI Control | Workflow Node | Slot/Widget | Value |
| :--- | :--- | :--- | :--- |
| **Reference Images** | `id: 3` (`LoadImage`) | `widgets_values[0]` | `filename` from upload. *Note: For multiple refs, the UI must instantiate multiple `LoadImage` nodes and link them sequentially to `MiniMaxH3ReferenceToVideo` if the node supports it, OR use a `BatchImage` node if available. **Spec:** Assume single `LoadImage` for MVP; multi-ref requires dynamic node cloning.* |
| **Prompt** | `id: 4` (`MiniMaxH3PromptConditioning`) | `widgets_values[0]` | User-entered prompt string. |
| **Duration** | `id: 5` (`MiniMaxH3VideoSampler`) | `widgets_values[7]` (frames) | `48` (2s @ 24fps). |
| **Resolution** | `id: 5` (`MiniMaxH3VideoSampler`) | `widgets_values[5], [6]` | `512, 512` (Draft) or `1024, 1024` (Upscale). |
| **Steps** | `id: 5` (`MiniMaxH3VideoSampler`) | `widgets_values[2]` | `20` (Draft) or `4` (Upscale). |

### 3.2 LTX-2.5 (First-Frame)

| UI Control | Workflow Node | Slot/Widget | Value |
| :--- | :--- | :--- | :--- |
| **Reference Image** | `id: 2` (`LoadImage`) | `widgets_values[0]` | `filename` from upload. |
| **Prompt** | `id: 5` (`LTX25PromptConditioning`) | `widgets_values[0]` | User-entered prompt string. |
| **Duration** | `id: 4` (`LTX25FirstFrameConditioning`) | `widgets_values[0]` (frames) | `48`. |
| **Resolution** | `id: 6` (`LTX25VideoSampler`) | `widgets_values[5], [6]` | `512, 512` (Draft) or `1024, 1024` (Upscale). |
| **Steps** | `id: 6` (`LTX25VideoSampler`) | `widgets_values[2]` | `12` (Draft) or `4` (Upscale). |

**Upscale Pass Specifics**:
*   If `twoPassEnabled` is true, the UI submits a **second workflow** after the first completes.
*   The second workflow uses a `LoadVideo` node (from VideoHelperSuite) to load the draft output, followed by an `UpscaleModel` node, and a simplified sampler chain.
*   *Note:* The base JSON skeletons provided do not include the upscale chain. The frontend must have a **second template** (`upscale_workflow.json`) ready to inject.

---

## 4. Edge Cases

### 4.1 No GPU / Busy Check
*   **Pre-check**: Before submitting, call `GET /api/comfyui/status`.
*   If `busy: true`, disable the "Generate" button and show tooltip: "GPU is busy with another task."
*   If `gpu_available: false`, show error: "No GPU detected. Check ComfyUI logs."

### 4.2 Missing Workflow Template
*   If `GET /api/comfyui/slots` returns 404 or empty slots for the selected model type:
    *   Show error: "Workflow template not found. Please ensure the correct node packs are installed."
    *   Disable submission.

### 4.3 User Cancels
*   **During Upload**: Abort the `fetch` request.
*   **During Generation**:
    *   Call `POST /api/comfyui/cancel/{prompt_id}`.
    *   Stop polling.
    *   Reset UI to "Idle" state.
    *   Display message: "Generation cancelled."

### 4.4 Invalid Image Format
*   Client-side validation: Reject files >10MB or non-image types.
*   Server-side validation: If ComfyUI upload fails, show specific error from response.

### 4.5 Green-FMV Issue (LTX-2.5)
*   **UI Warning**: If `selectedModel === 'ltx'`, show a small info icon: "LTX-2.5 INT8 may exhibit green cast. Consider using FP16 VAE if available."
*   **Post-Processing**: If the user reports green cast, the UI should offer a "Apply Color Correction" button that triggers a post-processing workflow (ColorCorrect node) on the generated video.

---

## 5. LLM Layer's Role

### 5.1 Director Prompt Assistance
*   **Feature**: "AI Prompt Helper" button next to the prompt textarea.
*   **Input**:
    *   `sceneType`: `'character' | 'environment'`
    *   `referenceImageDescription`: (Optional) User can upload a text description of the reference image.
    *   `desiredMotion`: (Optional) User selects from dropdown: "Static", "Walking", "Camera Pan", "Dynamic Action".
*   **LLM Call**:
    *   `POST /api/llm/generate-prompt`
    *   Body:
        ```json
        {
          "scene_type": "character",
          "reference_context": "Character sheet of a medieval knight",
          "motion_style": "Walking",
          "model": "h3"
        }
        ```
*   **Output**:
    *   Returns a structured prompt string optimized for the selected model.
    *   *Example for H3*: "A medieval knight walking forward, consistent identity from reference sheet, cinematic lighting, 24fps."
    *   *Example for LTX*: "First frame establishes the scene. Camera pans slowly to the right. Environmental dynamics: wind blowing through trees."
*   **Integration**:
    *   Populates the `prompt` state in `ReferenceSheetControl`.
    *   User can edit the generated prompt before submission.

### 5.2 Error Explanation
*   If generation fails, the LLM can analyze the error log (if available via API) and provide a human-readable explanation.
*   *Example*: "Error: OOM. Try reducing frame count to 24 or disabling two-pass generation."
