# UI Navigator Action Schema & Specification

## 1. Action Schema (JSON Schema draft-07)

This schema defines 18 workflow-level actions. The schema is designed for progressive disclosure: the agent first sees the `name` and `description`, then retrieves the full `parameters` and `preconditions` via the discovery mechanism before execution.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ComfyUI Video Workflow UI Actions",
  "description": "Workflow-level actions for the UI Navigator role. These actions abstract low-level API calls into high-level user intents.",
  "type": "object",
  "properties": {
    "actions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "description", "parameters", "preconditions", "api_sequence"],
        "properties": {
          "name": {
            "type": "string",
            "description": "Unique identifier for the action."
          },
          "description": {
            "type": "string",
            "description": "Human-readable description of what this action achieves."
          },
          "parameters": {
            "type": "object",
            "description": "Typed parameters required or optional for this action.",
            "additionalProperties": false
          },
          "preconditions": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "State conditions that must be true before this action can be executed."
          },
          "api_sequence": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["method", "endpoint", "description"],
              "properties": {
                "method": {
                  "type": "string",
                  "enum": ["GET", "POST", "PUT", "PATCH", "DELETE"]
                },
                "endpoint": {
                  "type": "string"
                },
                "description": {
                  "type": "string"
                },
                "body": {
                  "type": "object"
                }
              }
            },
            "description": "The ordered sequence of API calls triggered by this action."
          }
        }
      }
    }
  }
}
```

### Defined Actions

#### 1. `create_project`
- **Description**: Creates a new video project from a script text or empty state. Handles script creation, initial render settings, and navigation.
- **Parameters**:
  - `name` (string, required): The title of the project.
  - `script_content` (string, optional): The raw script text. If omitted, creates an empty project.
  - `format_preset` (string, optional): Preset key (e.g., "1080p", "720p"). Defaults to "1080p".
  - `fps` (integer, optional): Frames per second. Defaults to 24.
- **Preconditions**:
  - `projectName` must be non-empty.
  - `formatSelection.preset` must be selected.
- **API Sequence**:
  1. `POST /api/writing/scripts` with `{ title: name, content: script_content }`
  2. `PUT /api/render-settings/{scriptId}` with `{ preset: format_preset, fps: fps }`

#### 2. `open_project`
- **Description**: Loads an existing project by ID or name, setting it as the active context.
- **Parameters**:
  - `project_id` (string, optional): The unique ID of the project.
  - `project_name` (string, optional): The name of the project (used if ID is not provided).
- **Preconditions**:
  - None.
- **API Sequence**:
  1. `GET /api/writing/scripts` (if searching by name) or `GET /api/writing/scripts/{project_id}`
  2. `GET /api/render-settings/{scriptId}`
  3. `GET /api/scenes/{scriptId}`

#### 3. `set_render_settings`
- **Description**: Updates the output resolution, frame rate, or preset for the active project.
- **Parameters**:
  - `preset` (string, optional): Preset key (e.g., "1080p", "custom").
  - `fps` (integer, optional): Frames per second.
  - `width` (integer, optional): Custom width (required if preset is "custom").
  - `height` (integer, optional): Custom height (required if preset is "custom").
- **Preconditions**:
  - Active project must exist.
  - If `preset` is "custom", `width` and `height` must be provided.
- **API Sequence**:
  1. `PUT /api/render-settings/{scriptId}` with `{ preset, fps, width, height }`

#### 4. `submit_pipeline`
- **Description**: Triggers the scene generation pipeline (script to scenes) for the active project.
- **Parameters**:
  - None.
- **Preconditions**:
  - Active project must have a script.
  - Pipeline must not already be running.
- **API Sequence**:
  1. `POST /api/writing/scripts/{scriptId}/submit`

#### 5. `assign_frame`
- **Description**: Assigns a reference frame image to a specific scene.
- **Parameters**:
  - `scene_id` (string, required): The ID of the target scene.
  - `frame_id` (string, required): The ID of the frame asset.
- **Preconditions**:
  - Scene must exist.
  - Frame must exist.
- **API Sequence**:
  1. `POST /api/scenes/{scene_id}/frame` with `{ frame_id }`

#### 6. `upload_frame`
- **Description**: Uploads a new reference frame image to the project's frame catalog.
- **Parameters**:
  - `file` (binary, required): The image file data.
  - `title` (string, optional): Title for the frame.
  - `tags` (array of strings, optional): Tags for the frame.
- **Preconditions**:
  - Active project must exist.
- **API Sequence**:
  1. `POST /api/frames` (multipart/form-data)

#### 7. `generate_voice`
- **Description**: Generates audio for a specific scene using the selected voice.
- **Parameters**:
  - `scene_id` (string, required): The ID of the target scene.
  - `voice_id` (string, optional): The ID of the voice to use. If omitted, uses the scene's assigned character voice.
- **Preconditions**:
  - Scene must have dialogue.
  - Voice must be available.
- **API Sequence**:
  1. `POST /api/audio/generate` with `{ scene_id, voice_id }`

#### 8. `assign_voice`
- **Description**: Assigns a voice to a character in the active script.
- **Parameters**:
  - `character_id` (string, required): The ID of the character.
  - `voice_id` (string, required): The ID of the voice to assign.
- **Preconditions**:
  - Character must exist in the active script.
  - Voice must exist in the catalog.
- **API Sequence**:
  1. `PATCH /api/writing/scripts/{scriptId}/versions/{version}/characters/{characterId}` with `{ voice_id }`

#### 9. `auto_cast`
- **Description**: Automatically assigns voices to all characters in the active script.
- **Parameters**:
  - None.
- **Preconditions**:
  - Active script must have characters.
  - Auto-casting must not be in progress.
- **API Sequence**:
  1. `POST /api/writing/scripts/{scriptId}/versions/{version}/autocast`

#### 10. `submit_render`
- **Description**: Submits a specific scene (or all ready scenes) for rendering via ComfyUI.
- **Parameters**:
  - `scene_id` (string, optional): The ID of a specific scene. If omitted, submits all scenes in `ready`, `draft`, or `error` status.
- **Preconditions**:
  - Active project must have scenes.
  - ComfyUI must be connected.
- **API Sequence**:
  1. `POST /api/comfyui/submit` with `{ scene_id }` or `{ all: true }`

#### 11. `cancel_render`
- **Description**: Cancels an active or queued render job for a specific scene.
- **Parameters**:
  - `scene_id` (string, required): The ID of the scene to cancel.
- **Preconditions**:
  - Scene must be in `rendering` or `queued` status.
- **API Sequence**:
  1. `DELETE /api/comfyui/jobs/{scene_id}`

#### 12. `update_scene_prompt`
- **Description**: Updates the ComfyUI prompt for a specific scene.
- **Parameters**:
  - `scene_id` (string, required): The ID of the scene.
  - `prompt` (string, required): The new prompt text.
- **Preconditions**:
  - Scene must exist.
- **API Sequence**:
  1. `PUT /api/scenes/{scene_id}/prompt` with `{ prompt }`

#### 13. `reorder_scenes`
- **Description**: Changes the order of scenes in the timeline.
- **Parameters**:
  - `scene_ids` (array of strings, required): The new ordered list of scene IDs.
- **Preconditions**:
  - All scene IDs must exist in the active project.
- **API Sequence**:
  1. `PUT /api/scenes/{scriptId}/order` with `{ scene_ids }`

#### 14. `insert_scene`
- **Description**: Inserts a new empty scene at a specific position in the timeline.
- **Parameters**:
  - `after_scene_id` (string, optional): The ID of the scene after which to insert. If omitted, inserts at the beginning.
- **Preconditions**:
  - Active project must exist.
- **API Sequence**:
  1. `POST /api/scenes/{scriptId}` with `{ after_scene_id }`

#### 15. `export_video`
- **Description**: Assembles and exports the final video from the active project.
- **Parameters**:
  - `output_name` (string, optional): Name for the exported file.
  - `resolution` (string, optional): Export resolution ("720p", "1080p", "original").
  - `music_track_id` (string, optional): ID of the music track to include.
  - `music_volume` (number, optional): Volume level (0.0-1.0).
  - `include_broll` (boolean, optional): Whether to include B-roll.
- **Preconditions**:
  - Active project must have at least one scene.
  - Export must not already be in progress.
- **API Sequence**:
  1. `POST /api/export/assemble` with `{ output_name, resolution, music_track_id, music_volume, include_broll }`
  2. `GET /api/export/progress/{scriptId}` (polling until complete)

#### 16. `connect_llm`
- **Description**: Connects to an LLM provider for script formatting or generation.
- **Parameters**:
  - `provider_id` (string, required): The ID of the LLM provider.
  - `model` (string, required): The model identifier.
- **Preconditions**:
  - Provider must be available.
- **API Sequence**:
  1. `POST /api/llm/connect` with `{ provider_id, model }`

#### 17. `clean_outputs`
- **Description**: Deletes rendered outputs and intermediate files to free up disk space.
- **Parameters**:
  - None.
- **Preconditions**:
  - Cleaning must not already be in progress.
- **API Sequence**:
  1. `POST /api/comfyui/cleanup`

#### 18. `delete_project`
- **Description**: Permanently deletes a project and all associated assets.
- **Parameters**:
  - `project_id` (string, required): The ID of the project to delete.
- **Preconditions**:
  - Project must exist.
- **API Sequence**:
  1. `DELETE /api/writing/scripts/{project_id}`

---

## 2. Discovery Mechanism Specification

The agent interacts with the UI Navigator via a three-step progressive discovery protocol. This prevents overwhelming the context window with all possible parameters at once.

### Step 1: `list_actions`
- **Purpose**: Retrieve a high-level list of available actions.
- **Input**: None.
- **Output**: Array
