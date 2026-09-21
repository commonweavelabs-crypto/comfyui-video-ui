# Teacher Role Lesson-Plan Format Specification

## 1. Lesson-Plan JSON Schema

The lesson plan is a structured JSON object that defines a guided learning sequence. The Teacher AI uses this schema to generate instructions, verify user actions, and track progress.

```json
{
  "lesson_id": "string (UUID)",
  "title": "string",
  "goal": "string (Learning objective: what the user will be able to do)",
  "prerequisites": [
    {
      "type": "state | action | skill",
      "description": "string",
      "verification_api": "string (Optional: API endpoint to check state)"
    }
  ],
  "target_duration_minutes": "integer",
  "difficulty_level": "beginner | intermediate | advanced",
  "steps": [
    {
      "step_id": "integer",
      "action_ref": "string (UI Action Manual ID, e.g., 'L-01')",
      "instruction": "string (Direct command to the user)",
      "explanation": "string (Why this step matters / context)",
      "expected_result": "string (Visual or state change the user should see)",
      "verification": {
        "type": "api_state | ui_state | user_confirmation",
        "check": "string (Specific condition to verify)",
        "api_endpoint": "string (Optional: Endpoint to poll for state)",
        "success_message": "string",
        "failure_message": "string"
      }
    }
  ],
  "completion_criteria": "string (Final state required to mark lesson complete)"
}
```

## 2. Referencing UI-ACTION-MANUAL Entries

Lessons must reference specific controls from the UI Action Manual using their unique IDs (e.g., `L-01`, `W-51`, `S11`). This ensures precision and allows the Teacher AI to validate that the user is interacting with the correct element.

**Mapping Rules:**
*   **L-xx**: Landing Page actions.
*   **W-xx**: Workflow Wizard actions.
*   **SL-xx**: Script Library actions.
*   **SD-xx**: Script Document actions.
*   **T-xx**: Timeline actions.
*   **S-xx**: Scene Card actions.
*   **E-xx**: Export Panel actions.
*   **M-xx**: Music Panel actions.
*   **C-xx**: Cast Panel actions.
*   **PS-xx**: Project Settings actions.

**Example Reference:**
*   *Instruction:* "Click the 'Connect' button."
*   *Ref:* `L-11` (LlmConnectModal Connect action)
*   *Verification:* Check `llm_connected` state or successful `POST /api/llm/connect` response.

## 3. Interactive Delivery Flow

The Teacher AI follows a strict **Ask â†’ Do â†’ Verify** loop for each step.

1.  **Ask (Instruction):**
    *   Teacher presents the `instruction` and `explanation`.
    *   Teacher highlights the specific UI element (e.g., "Look for the **Model** button in the bottom right").
2.  **Do (User Action):**
    *   User performs the action in the UI.
    *   Teacher waits for user confirmation or detects state change via API polling (if available).
3.  **Verify (State Check):**
    *   **API State Check:** Teacher queries the backend (e.g., `GET /api/projects/{id}/settings`) to confirm the state change.
    *   **UI State Check:** Teacher checks for visual cues (e.g., "Did you see the green 'Connected' flash?").
    *   **User Confirmation:** If API/UI state is not directly observable, Teacher asks, "Did the modal close?"
4.  **Feedback:**
    *   **Success:** Teacher confirms progress and moves to the next step.
    *   **Failure:** Teacher provides troubleshooting tips based on `failure_message` and offers to retry.

**Verification API Examples:**
*   *LLM Connection:* `GET /api/llm/status` â†’ Check `connected: true`.
*   *Render Status:* `GET /api/comfyui/status/{scriptId}` â†’ Check `scenes[].status === 'complete'`.
*   *Project Creation:* `GET /api/scripts/{id}` â†’ Check `id` exists.

## 4. Example Lessons

### Lesson 1: Connect Your First LLM Provider

```json
{
  "lesson_id": "les-001-connect-llm",
  "title": "Connect Your First LLM Provider",
  "goal": "Successfully connect an LLM provider to enable script formatting and generation features.",
  "prerequisites": [
    {
      "type": "state",
      "description": "User is on the Landing Page.",
      "verification_api": "GET /api/llm/status"
    }
  ],
  "target_duration_minutes": 3,
  "difficulty_level": "beginner",
  "steps": [
    {
      "step_id": 1,
      "action_ref": "L-03",
      "instruction": "Click the **Model** button located in the footer of the Composer box on the Landing page.",
      "explanation": "This opens the LlmConnectModal, which is required to configure your AI provider.",
      "expected_result": "A modal window titled 'Connect LLM Provider' appears.",
      "verification": {
        "type": "ui_state",
        "check": "Modal is visible",
        "success_message": "Great! The modal is open.",
        "failure_message": "I don't see the modal. Please ensure you clicked the 'Model' button."
      }
    },
    {
      "step_id": 2,
      "action_ref": "L-11",
      "instruction": "In the modal, select a **Provider** (e.g., Ollama or OpenAI) and a specific **Model** from the grid.",
      "explanation": "You must select both a provider and a model to establish a connection.",
      "expected_result": "The selected provider and model are highlighted.",
      "verification": {
        "type": "user_confirmation",
        "check": "User confirms selection",
        "success_message": "Perfect. Which model did you choose?",
        "failure_message": "Please select a provider and model before continuing."
      }
    },
    {
      "step_id": 3,
      "action_ref": "L-11",
      "instruction": "Click the **Connect** button at the bottom of the modal.",
      "explanation": "This initiates the connection handshake with the LLM service.",
      "expected_result": "A green 'Connected' flash appears, and the modal closes.",
      "verification": {
        "type": "api_state",
        "check": "llm_status.connected === true",
        "api_endpoint": "GET /api/llm/status",
        "success_message": "Connection successful! You can now use LLM features.",
        "failure_message": "Connection failed. Please check your API key or endpoint settings."
      }
    }
  ],
  "completion_criteria": "LLM provider is connected and status is 'connected'."
}
```

### Lesson 2: Submit Your First Render

```json
{
  "lesson_id": "les-002-submit-render",
  "title": "Submit Your First Render",
  "goal": "Submit a scene to the ComfyUI render queue and monitor its completion.",
  "prerequisites": [
    {
      "type": "state",
      "description": "User has a project with at least one scene in 'ready' or 'draft' status.",
      "verification_api": "GET /api/scripts/{scriptId}/scenes"
    }
  ],
  "target_duration_minutes": 5,
  "difficulty_level": "beginner",
  "steps": [
    {
      "step_id": 1,
      "action_ref": "T-3",
      "instruction": "In the **Timeline** header, click the **Submit All Ready** button.",
      "explanation": "This submits all scenes that are ready for rendering to the ComfyUI queue.",
      "expected_result": "Scene status badges change from 'ready' to 'queued' (yellow).",
      "verification": {
        "type": "api_state",
        "check": "scenes[].status === 'queued' or 'rendering'",
        "api_endpoint": "GET /api/comfyui/status/{scriptId}",
        "success_message": "Scenes are now in the queue.",
        "failure_message": "No scenes were submitted. Ensure at least one scene is in 'ready' status."
      }
    },
    {
      "step_id": 2,
      "action_ref": "S-10",
      "instruction": "Monitor the **Render Progress Bar** on the scene card.",
      "explanation": "The bar shows real-time progress of the ComfyUI job.",
      "expected_result": "The orange bar fills up, and the status changes to 'rendering' then 'complete' (green).",
      "verification": {
        "type": "api_state",
        "check": "scenes[].status === 'complete'",
        "api_endpoint": "GET /api/comfyui/status/{scriptId}",
        "success_message": "Render complete! You can now preview the video.",
        "failure_message": "Render is still in progress. Please wait."
      }
    },
    {
      "step_id": 3,
      "action_ref": "S-3",
      "instruction": "Click the **Video Player** on the scene card to play the rendered video.",
      "explanation": "This allows you to verify the quality of the render.",
      "expected_result": "The video plays.",
      "verification": {
        "type": "user_confirmation",
        "check": "User confirms video plays",
        "success_message": "Excellent! Your first render is successful.",
        "failure_message": "If the video doesn't play, check the error message on the scene card."
      }
    }
  ],
  "completion_criteria": "At least one scene has status 'complete' and video is playable."
}
```

## 5. Adaptation Rules: Beginner vs. Experienced Paths

The Teacher AI adjusts the lesson plan based on the user's proficiency level.

### Beginner Path
*   **Granularity:** Breaks down complex actions into micro-steps (e.g., "Click the button" vs. "Submit the render").
*   **Context:** Provides extensive `explanation` text for every step.
*   **Verification:** Relies heavily on `user_confirmation` and visual cues.
*   **Error Handling:** Offers detailed troubleshooting steps for common errors (e.g., "If you see a 502 error, check your API key").
*   **Pacing:** Slower pace, with pauses for user confirmation after each step.

### Experienced Path
*   **Granularity:** Combines related steps (e.g., "Select provider and model, then connect").
*   **Context:** Minimal `explanation`, assuming user understands the workflow.
*   **Verification:** Relies on `api_state` checks for faster progression.
*   **Error Handling:** Provides concise error codes and direct links to documentation.
*   **Pacing:** Faster pace, with batched instructions (e.g., "Perform steps 1-3, then let me know when done").

### Dynamic Adaptation Logic
1.  **Initial Assessment:** Teacher asks, "Are you new to this app or have you used it before?"
2.
