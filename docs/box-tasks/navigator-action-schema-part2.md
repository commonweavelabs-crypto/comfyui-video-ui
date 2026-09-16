of action summaries. Each summary contains only `name` and `description`.

```json
{
  "actions": [
    {
      "name": "create_project",
      "description": "Creates a new video project from a script text or empty state."
    },
    {
      "name": "open_project",
      "description": "Loads an existing project by ID or name, setting it as the active context."
    },
    {
      "name": "set_render_settings",
      "description": "Updates the output resolution, frame rate, or preset for the active project."
    },
    {
      "name": "submit_pipeline",
      "description": "Triggers the scene generation pipeline (script to scenes) for the active project."
    },
    {
      "name": "assign_frame",
      "description": "Assigns a reference frame image to a specific scene."
    },
    {
      "name": "upload_frame",
      "description": "Uploads a new reference frame image to the project's frame catalog."
    },
    {
      "name": "generate_voice",
      "description": "Generates audio for a specific scene using the selected voice."
    },
    {
      "name": "assign_voice",
      "description": "Assigns a voice to a character in the active script."
    },
    {
      "name": "auto_cast",
      "description": "Automatically assigns voices to all characters in the active script."
    },
    {
      "name": "submit_render",
      "description": "Submits a specific scene (or all ready scenes) for rendering via ComfyUI."
    },
    {
      "name": "cancel_render",
      "description": "Cancels an active or queued render job for a specific scene."
    },
    {
      "name": "update_scene_prompt",
      "description": "Updates the ComfyUI prompt for a specific scene."
    },
    {
      "name": "reorder_scenes",
      "description": "Changes the order of scenes in the timeline."
    },
    {
      "name": "insert_scene",
      "description": "Inserts a new empty scene at a specific position in the timeline."
    },
    {
      "name": "export_video",
      "description": "Assembles and exports the final video from the active project."
    },
    {
      "name": "connect_llm",
      "description": "Connects to an LLM provider for script formatting or generation."
    },
    {
      "name": "clean_outputs",
      "description": "Deletes rendered outputs and intermediate files to free up disk space."
    },
    {
      "name": "delete_project",
      "description": "Permanently deletes a project and all associated assets."
    }
  ]
}
```

### Step 2: `get_action_schema`
- **Purpose**: Retrieve the full schema for a specific action, including parameters, preconditions, and API sequence.
- **Input**:
  - `action_name` (string, required): The name of the action to retrieve.
- **Output**: The full action object as defined in Section 1.

```json
{
  "name": "open_project",
  "description": "Loads an existing project by ID or name, setting it as the active context.",
  "parameters": {
    "project_id": {
      "type": "string",
      "description": "The unique ID of the project.",
      "required": false
    },
    "project_name": {
      "type": "string",
      "description": "The name of the project (used if ID is not provided).",
      "required": false
    }
  },
  "preconditions": [],
  "api_sequence": [
    {
      "method": "GET",
      "endpoint": "/api/writing/scripts",
      "description": "List scripts to find ID by name (if project_name provided)"
    },
    {
      "method": "GET",
      "endpoint": "/api/writing/scripts/{project_id}",
      "description": "Fetch project details"
    },
    {
      "method": "GET",
      "endpoint": "/api/render-settings/{scriptId}",
      "description": "Fetch current render settings"
    },
    {
      "method": "GET",
      "endpoint": "/api/scenes/{scriptId}",
      "description": "Fetch scene list"
    }
  ]
}
```

### Step 3: `execute`
- **Purpose**: Executes the specified action with the provided parameters.
- **Input**:
  - `action_name` (string, required): The name of the action to execute.
  - `parameters` (object, required): The parameters for the action, conforming to the schema retrieved in Step 2.
  - `confirmation_token` (string, optional): Required for Tier 2 and Tier 3 actions. Must match the token provided in the `permission_response`.
- **Output**:
  - `status` (string): "success", "error", or "pending_confirmation".
  - `data` (object, optional): Result data from the API sequence.
  - `error` (object, optional): Error details if status is "error".
  - `permission_response` (object, optional): Returned if the action requires confirmation and no valid token was provided.

**Preconditions & Confirmation Semantics**:
- The UI Navigator validates preconditions before execution. If a precondition fails, the action returns `status: "error"` with a descriptive message.
- For Tier 2 (confirm-first) and Tier 3 (double-confirm) actions, if `confirmation_token` is missing or invalid, the action does not execute. Instead, it returns `status: "pending_confirmation"` along with a `permission_response` object containing a unique `confirmation_token` and the details required for user approval.
- The agent must present the confirmation details to the user. Upon user approval, the agent re-calls `execute` with the same `action_name`, `parameters`, and the provided `confirmation_token`.

**Error/Unknown Action Handling**:
- If `action_name` is not found in the registry, `execute` returns `status: "error"` with `error.code: "UNKNOWN_ACTION"` and `error.message: "Action 'xyz' does not exist."`
- If parameters are missing or invalid, `status: "error"` with `error.code: "INVALID_PARAMETERS"` and a list of validation errors is returned.

---

## 3. Permission Layer

Actions are categorized into three permission tiers to balance automation with safety.

### Tier 1: Auto-Execute
- **Scope**: Read-only actions and low-risk state polls.
- **Actions**: `open_project`, `list_actions`, `get_action_schema`, progress polling (implicit in `export_video` and `submit_pipeline` monitoring).
- **Behavior**: Executes immediately without user confirmation.

### Tier 2: Confirm-First
- **Scope**: Mutations with low cost or easily reversible.
- **Actions**: `set_render_settings`, `update_scene_prompt`, `reorder_scenes`, `insert_scene`, `connect_llm`, `assign_frame`, `assign_voice`, `upload_frame`.
- **Behavior**: Requires a single user confirmation. The UI displays a confirmation card summarizing the change.

### Tier 3: Double-Confirm + Explicit Reason
- **Scope**: Destructive, expensive, or long-running operations.
- **Actions**: `delete_project`, `clean_outputs`, `cancel_render` (mid-pipeline), `submit_render` (queueing many jobs), `export_video`, `generate_voice` (spending TTS tokens).
- **Behavior**: Requires explicit user confirmation with a reason. The UI displays a high-visibility warning card. The user must type or select a reason (e.g., "I am sure") to proceed.

### Permission Response Shape

When an action requires confirmation, the `execute` endpoint returns:

```json
{
  "status": "pending_confirmation",
  "permission_response": {
    "action_name": "set_render_settings",
    "parameters": {
      "fps": 24
    },
    "tier": 2,
    "confirmation_token": "conf_abc123xyz",
    "summary": "Change frame rate to 24 fps for project 'test2'.",
    "reason_required": false
  }
}
```

For Tier 3:

```json
{
  "status": "pending_confirmation",
  "permission_response": {
    "action_name": "delete_project",
    "parameters": {
      "project_id": "proj-uuid-123"
    },
    "tier": 3,
    "confirmation_token": "conf_def456uvw",
    "summary": "Permanently delete project 'test2' and all assets.",
    "reason_required": true,
    "reason_prompt": "Please confirm you want to delete this project."
  }
}
```

### UI Rendering of Confirmation Cards

- **Tier 2 Card**:
  - Title: "Confirm Action"
  - Body: Human-readable summary of the change.
  - Buttons: [Cancel] [Confirm]
  - On Confirm: Sends `execute` with `confirmation_token`.

- **Tier 3 Card**:
  - Title: "âš ï¸ High-Risk Action"
  - Body: Warning message + summary.
  - Input: Text field for reason (if `reason_required` is true).
  - Buttons: [Cancel] [I Understand, Proceed]
  - On Proceed: Sends `execute` with `confirmation_token` and `reason` (if applicable).

---

## 4. Worked Example

**User Intent**: "Open my test2 project and set frame rate to 24."

### Step 1: `list_actions`
*Agent calls `list_actions` to discover available actions.*

**Input**: None

**Output**:
```json
{
  "actions": [
    { "name": "open_project", "description": "Loads an existing project by ID or name..." },
    { "name": "set_render_settings", "description": "Updates the output resolution, frame rate..." },
    ...
  ]
}
```

### Step 2: `get_action_schema` for `open_project`
*Agent retrieves schema for `open_project`.*

**Input**:
```json
{
  "action_name": "open_project"
}
```

**Output**:
```json
{
  "name": "open_project",
  "description": "Loads an existing project by ID or name, setting it as the active context.",
  "parameters": {
    "project_id": { "type": "string", "required": false },
    "project_name": { "type": "string", "required": false }
  },
  "preconditions": [],
  "api_sequence": [
    { "method": "GET", "endpoint": "/api/writing/scripts", "description": "List scripts" },
    { "method": "GET", "endpoint": "/api/writing/scripts/{project_id}", "description": "Fetch project" },
    { "method": "GET", "endpoint": "/api/render-settings/{scriptId}", "description": "Fetch settings" },
    { "method": "GET", "endpoint": "/api/scenes/{scriptId}", "description": "Fetch scenes" }
  ]
}
```

### Step 3: `execute` `open_project`
*Agent executes `open_project` with `project_name: "test2"`. This is Tier 1 (auto-execute).*

**Input**:
```json
{
  "action_name": "open_project",
  "parameters": {
    "project_name": "test2"
  }
}
```

**Output**:
```json
{
  "status": "success",
  "data": {
    "project_id": "proj-8f3a2b1c-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
    "name": "test2",
    "render_settings": {
      "preset": "1080p",
      "fps": 30,
      "width": 1920,
      "height": 1080
    },
    "scenes": [
      { "id": "scene-1a2b3c4d", "title": "Intro" },
      { "id": "scene-5e6f7a8b", "title": "Main" }
    ]
  }
}
```

### Step 4: `get_action_schema` for `set_render_settings`
*Agent retrieves schema for `set_render_settings`.*

**Input**:
```json
{
  "action_name": "set_render_settings"
}
```

**Output**:
```json
{
  "name": "set_render_settings",
  "description": "Updates the output resolution, frame rate, or preset for the active project.",
  "parameters": {
    "preset": { "type": "string", "required": false },
    "fps": { "type": "integer", "required": false },
    "width": { "type": "integer", "required": false },
    "height": { "type": "integer", "required": false }
  },
  "preconditions": [
    "Active project must exist."
  ],
  "api_sequence": [
    { "method": "PUT", "endpoint": "/api/render-settings/{scriptId}", "description": "Update settings" }
  ]
}
```

### Step 5: `execute` `set_render_settings`
*Agent executes `set_render_settings` with `fps: 24`. This is Tier 2 (confirm-first).*

**Input**:
```json
{
  "action_name": "set_render_settings",
  "parameters": {
    "fps": 24
  }
}
```

**Output**:
```json
{
  "status": "pending_confirmation",
  "permission_response": {
    "action_name": "set_render_settings",
    "parameters": {
      "fps": 24
    },
    "tier": 2,
    "confirmation_token": "conf_9z8y7x6w5v4u",
    "summary": "Change frame rate to 24 fps for project 'test2'.",
    "reason_required": false
  }
}
```

*UI displays confirmation card. User clicks [Confirm].*

### Step 6: `execute` `set_render_settings` (with token)
*Agent re-executes with the confirmation token.*

**Input**:
```json
{
  "action_name": "set_render_settings",
  "parameters": {
    "fps": 24
  },
  "confirmation_token": "conf_9z8y7x6w5v4u"
}
```

**Output**:
```json
{
  "status": "success",
  "data": {
    "project_id": "proj-8f3a2b1c-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
    "render_settings": {
      "preset": "1080p",
      "fps": 24,
      "width": 1920,
      "height": 1080
    }
  }
}
```

### Final Assistant Confirmation Message
"Project 'test2' is now open. Frame rate has been updated to 24 fps."
