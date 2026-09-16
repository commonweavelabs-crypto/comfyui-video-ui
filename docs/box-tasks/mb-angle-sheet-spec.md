# M-B: Angle-Sheet Generator Design Spec

## 1. UX Flow

**Location:**
- **Scene Card (Timeline View):** Each scene card in the timeline displays the current active render thumbnail.
- **Action Button:** A secondary icon button labeled **"Generate Angles"** (icon: `rotate-ccw` or `camera-rotate`) appears in the scene card's action menu (hover/long-press).
- **Prerequisite:** The button is disabled if:
  - The scene has no source image (from M-A character sheet or manual upload).
  - A ComfyUI job is already running for this scene.
  - The user has no GPU available (checked via `/api/comfyui/slots`).

**Picker UI:**
- **Modal/Sheet:** Clicking "Generate Angles" opens a bottom sheet (mobile) or modal (desktop) titled **"Select Initial Frame Angle"**.
- **State 1: Generating:**
  - Displays a progress bar linked to the WebSocket job status.
  - Shows a spinner with text: *"Generating 4 angle variants..."*.
  - **Cancel Button:** Prominent "Cancel" button to abort the job.
- **State 2: Ready:**
  - Displays a horizontal scrollable carousel of generated angle variants (e.g., Front, Left 45Â°, Right 45Â°, Back).
  - Each thumbnail is tappable.
  - **Selection State:** The selected thumbnail has a blue border and a checkmark overlay.
  - **Confirm Button:** "Use as Initial Frame" (primary action).
  - **Discard Button:** "Discard All" (secondary action).

**Integration into Scene:**
- On "Use as Initial Frame":
  1. The selected image is uploaded to the scene's asset storage.
  2. `PATCH /api/scenes/{id}/active-render` is called with the new asset ID.
  3. The scene card thumbnail updates immediately via WebSocket broadcast.
  4. The modal closes.

---

## 2. Backend Spec

**New Routes (FastAPI):**

### `POST /api/scenes/{scene_id}/generate-angles`
- **Purpose:** Initiates angle generation for a scene.
- **Request Body:**
  ```json
  {
    "source_asset_id": "string", // Asset ID of the source image (from M-A or upload)
    "num_angles": 4,             // Optional, default 4
    "prompt_suffix": "string"    // Optional, e.g., "cinematic lighting"
  }
  ```
- **Response:**
  ```json
  {
    "job_id": "string",          // ComfyUI job handle
    "status": "pending"
  }
  ```
- **Logic:**
  1. Validate `source_asset_id` exists and belongs to the scene.
  2. Check GPU availability via `GET /api/comfyui/slots`. If no GPU, return `409 Conflict`.
  3. Build ComfyUI workflow JSON (see Section 3).
  4. Submit to ComfyUI via existing `POST /api/comfyui/submit`.
  5. Return the `job_id`.

### `GET /api/scenes/{scene_id}/angle-variants`
- **Purpose:** Retrieves generated angle variants for a scene.
- **Response:**
  ```json
  {
    "variants": [
      {
        "asset_id": "string",
        "angle_label": "Front",
        "thumbnail_url": "string"
      },
      ...
    ]
  }
  ```
- **Logic:**
  1. Query database for assets linked to `scene_id` with `type='angle_variant'`.
  2. Return list sorted by generation order.

### `PATCH /api/scenes/{scene_id}/active-render`
- **Existing Route (Updated):**
- **Request Body:**
  ```json
  {
    "asset_id": "string" // ID of the selected angle variant
  }
  ```
- **Logic:**
  1. Update scene's `active_render_asset_id`.
  2. Broadcast `scene.updated` WebSocket event.

**WebSocket Events:**
- **Event:** `comfyui.job.progress`
  - **Payload:**
    ```json
    {
      "job_id": "string",
      "scene_id": "string",
      "progress": 0.75,
      "status": "running"
    }
    ```
- **Event:** `comfyui.job.completed`
  - **Payload:**
    ```json
    {
      "job_id": "string",
      "scene_id": "string",
      "status": "completed",
      "asset_ids": ["id1", "id2", "id3", "id4"]
    }
    ```
- **Event:** `comfyui.job.failed`
  - **Payload:**
    ```json
    {
      "job_id": "string",
      "scene_id": "string",
      "status": "failed",
      "error": "string"
    }
    ```

---

## 3. Workflow Template Requirements

**ComfyUI Graph Structure:**
- **Input Node:** `LoadImage` (source image from M-A or upload).
- **Conditioning Node:** `CLIPTextEncode` (positive prompt: "character, {angle_label}, high detail, 8k").
- **Negative Prompt Node:** `CLIPTextEncode` (negative prompt: "blurry, low quality, distorted").
- **KSampler:**
  - `steps`: 25
  - `cfg`: 7.0
  - `sampler_name`: "dpmpp_2m"
  - `scheduler`: "karras"
  - `denoise`: 0.75 (for angle variation, not full regeneration)
- **Angle Prompt Injection:**
  - Use `PromptTemplate` node or dynamic prompt injection to vary the angle label (e.g., "front view", "left profile", "right profile", "back view").
  - **Implementation:** The backend generates 4 separate workflow JSONs, one for each angle, or uses a batch node if supported. **Recommended:** 4 separate submissions for reliability.

**Slot Structure:**
- **Required Slots:**
  - `image`: Source image asset ID.
  - `prompt`: Positive prompt string.
  - `negative_prompt`: Negative prompt string.
  - `seed`: Random integer (generated per angle).
  - `steps`: Integer (25).
  - `cfg`: Float (7.0).

**Template File:** `workflows/angle_generation.json`
- Contains the base graph with placeholder slots.
- Backend fills slots dynamically per angle.

---

## 4. Storage

**Database Schema (PostgreSQL):**

### `assets` Table (Existing, Extended)
- `id`: UUID
- `scene_id`: UUID (nullable)
- `type`: String (`'source'`, `'angle_variant'`, `'render'`)
- `file_path`: String
- `metadata`: JSONB (e.g., `{"angle_label": "Front", "job_id": "..."}`)
- `created_at`: Timestamp

### `scenes` Table (Existing, Extended)
- `active_render_asset_id`: UUID (FK to `assets`)
- `angle_generation_status`: String (`'idle'`, `'generating'`, `'ready'`, `'failed'`)

**Storage Logic:**
1. **Generation:**
   - On job completion, save 4 new assets with `type='angle_variant'` and `scene_id` set.
   - Update `scene.angle_generation_status` to `'ready'`.
2. **Selection:**
   - On user selection, update `scene.active_render_asset_id` to the selected variant's ID.
   - Do **not** delete other variants; they remain available for re-selection.
3. **Cleanup:**
   - Optional: Delete old angle variants if new generation is triggered (configurable).

---

## 5. Edge Cases

### 1. No GPU Available
- **Detection:** `GET /api/comfyui/slots` returns `gpu_available: false`.
- **Action:**
  - Backend returns `409 Conflict` with message: *"GPU is busy. Try again later."*
  - UI disables "Generate Angles" button and shows tooltip.
  - If job is already running, queue it (optional) or reject. **Recommended:** Reject to avoid long waits.

### 2. Angle Generation Failure
- **Detection:** WebSocket `comfyui.job.failed` event.
- **Action:**
  - Update `scene.angle_generation_status` to `'failed'`.
  - UI shows error toast: *"Angle generation failed. Please try again."*
  - Retain source image; user can retry.
  - Log error details for debugging.

### 3. User Cancels Mid-Generation
- **Detection:** User clicks "Cancel" in picker UI.
- **Action:**
  - Call `POST /api/comfyui/cancel/{job_id}`.
  - Update `scene.angle_generation_status` to `'idle'`.
  - UI closes modal, reverts to previous state.
  - Any partially generated assets are discarded (not saved to DB).

### 4. Source Image Missing
- **Detection:** `source_asset_id` is null or invalid.
- **Action:**
  - UI disables "Generate Angles" button.
  - Tooltip: *"Upload a source image first."*

### 5. Concurrent Jobs
- **Detection:** Scene already has a running ComfyUI job.
- **Action:**
  - UI disables "Generate Angles" button.
  - Tooltip: *"Another job is running for this scene."*
