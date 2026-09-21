# Frontend Hook Spec: M-D Telemetry (ComfyUI Video Workflow UI)

## 1. Consent UI

### Location
**First-Run Modal** (Primary) + **Settings > Privacy** (Secondary)

The opt-in prompt appears on the first launch of the application after installation or major version update. It is not a blocking modal; the user can dismiss it and continue using the UI without enabling telemetry. A persistent, non-intrusive banner remains at the bottom of the viewport until the user makes a choice.

### Exact Copy

**Title:** Help Improve Performance Estimates

**Body:**
> We collect anonymous, opt-in telemetry to help size DLSS5 features for your hardware. This data helps us predict render times and optimize workflows for your specific GPU and VRAM configuration.
>
> **What we collect:**
> *   Hardware: GPU model, VRAM size, CPU model, OS architecture.
> *   Usage: Render duration, resolution, frame count, checkpoint used, anonymized workflow IDs.
>
> **What we NEVER collect:**
> *   Your prompts or script text.
> *   File paths or output media.
> *   Personal information (IP, MAC, username).
>
> You can view exactly what will be sent before enabling. You can disable this at any time in Settings.

**Buttons:**
1.  **Enable Telemetry** (Primary)
2.  **View Preview** (Secondary)
3.  **No Thanks** (Tertiary)

### Data Displayed Before Opt-In
When the user clicks **"View Preview"**, a modal opens displaying the static schema fields and a sample payload (generated locally from current hardware detection) to demonstrate transparency. This matches the "Telemetry Preview" format defined in the schema doc.

---

## 2. Hook Implementation Spec: `useTelemetry`

### Hook Signature
```typescript
interface TelemetryConfig {
  enabled: boolean;
  batchIntervalMs: number; // Default: 86400000 (24h)
  maxQueueSize: number;    // Default: 1000
  endpoint: string;        // Default: '/api/telemetry/batch'
}

interface TelemetryEvent {
  schema_version: string;
  event_type: 'scene_rendered' | 'export_completed' | 'llm_connected' | 'error_shown';
  timestamp_utc: string;
  hardware: HardwareInfo;
  workflow?: WorkflowInfo;
  performance?: PerformanceInfo;
  metadata: MetadataInfo;
}

function useTelemetry(config: TelemetryConfig): {
  track: (event: Partial<TelemetryEvent>) => void;
  flush: () => Promise<void>;
  clearQueue: () => void;
  isSending: boolean;
  queueLength: number;
}
```

### Events Tracked

| Event Type | Trigger Point | Data Included |
| :--- | :--- | :--- |
| `scene_rendered` | Upon completion of a scene render in the ComfyUI backend. | `workflow` (script_id, scene_id, prompt_id, checkpoint, resolution, fps, frames, duration_s), `performance` (wall_time_s, avg_fps, vram_peak_gb). |
| `export_completed` | Upon successful export of video/audio to disk. | `workflow` (resolution, duration_s), `performance` (export_time_s). |
| `llm_connected` | Upon successful WebSocket connection to an LLM provider. | `metadata` (provider_type, model_name). *Note: No prompt content.* |
| `error_shown` | When a critical error toast/modal is displayed in the UI. | `metadata` (error_code, error_category). *Note: No stack traces or user input.* |

### Batching & Local Queue

1.  **Local Queue:**
    *   Storage: `localStorage` key `comfyui_telemetry_queue` (JSON array).
    *   Capacity: Max 1000 events. If exceeded, oldest events are discarded (FIFO).
    *   Persistence: Events survive browser refreshes until sent.

2.  **Batching Logic:**
    *   **Cadence:** Automatic flush every 24 hours (00:00 UTC local time) or when queue length > 50.
    *   **Manual Flush:** Triggered by "Send Now" button in Settings/Preview.
    *   **Payload Format:** JSON array of `TelemetryEvent` objects.
    *   **Compression:** Gzip compression applied client-side before POST (if browser supports `CompressionStream`, otherwise raw JSON).
    *   **Size Limit:** If payload > 1MB, split into multiple sequential POSTs.

3.  **Retry Logic:**
    *   Exponential backoff: 1s, 2s, 4s, 8s, 16s.
    *   Max retries: 5.
    *   On final failure: Keep events in queue, log error to console, show subtle notification in Settings.

### POST Endpoint Design

**Endpoint:** `POST /api/telemetry/batch`

**Request Headers:**
```http
Content-Type: application/json
X-Telemetry-Version: 1.0.0
X-Client-Id: <anonymized_hash_of_local_installation_id>
```
*Note: `X-Client-Id` is a locally generated, random UUID stored in `localStorage`. It is NOT a hardware serial or PII. It allows correlation of events from the same machine without identifying the user.*

**Request Body:**
```json
{
  "schema_version": "1.0.0",
  "events": [
    { ...TelemetryEvent... },
    { ...TelemetryEvent... }
  ]
}
```

**Response:**
*   `200 OK`: `{ "status": "success", "received_count": 10 }`
*   `400 Bad Request`: `{ "status": "error", "message": "Invalid schema" }`
*   `500 Internal Server Error`: Retry logic applies.

**Mirroring Existing Routes:**
This endpoint mirrors the structure of `/api/workflow/execute` in terms of authentication (none, as it's public opt-in) and error handling, but is stateless and idempotent.

---

## 3. What is NEVER Collected

The following data types are strictly prohibited from telemetry transmission and must be stripped from any event object before queuing:

1.  **Prompts & Script Content:**
    *   Raw text of prompts, scripts, or LLM conversations.
    *   Only `prompt_id` (anonymized hash) and `script_id` (anonymized hash) are sent.

2.  **Personal Identifiable Information (PII):**
    *   Usernames, email addresses, IP addresses, MAC addresses, hardware UUIDs, serial numbers.
    *   Hardware identification is limited to public model names (e.g., "RTX 4090").

3.  **File Paths & Local System Info:**
    *   Absolute or relative file paths (e.g., `/home/user/video.mp4`).
    *   Home directory names, OS username.

4.  **Output Media:**
    *   Video files, image frames, audio tracks, or thumbnails.
    *   Only metadata (resolution, duration, frame count) is transmitted.

5.  **Raw Node Graphs:**
    *   Full JSON definition of the ComfyUI workflow.
    *   Only structural identifiers (`script_id`, `scene_id`) are sent.

---

## 4. Off-Switch

### Settings Location
**Settings > Privacy > Telemetry**

### Controls
1.  **Toggle:** "Enable Anonymous Telemetry" (Default: Off).
2.  **Button:** "View What Will Be Sent" (Opens Preview Modal).
3.  **Button:** "Send Now" (Manual flush).
4.  **Button:** "Purge All Local Data" (Immediate deletion).

### Immediate Purge Behavior
When the user toggles **Off** or clicks **"Purge All Local Data"**:
1.  The `useTelemetry` hook immediately stops tracking new events.
2.  The local queue (`localStorage` key `comfyui_telemetry_queue`) is cleared synchronously.
3.  Any in-flight network requests are aborted.
4.  A confirmation toast is displayed: "Telemetry disabled. All local data purged."

---

## 5. Storage Schema

### Local Queue Structure (`telemetry_queue.json`)

```json
{
  "version": "1.0.0",
  "last_flushed_at": "2023-10-27T14:30:00Z",
  "events": [
    {
      "schema_version": "1.0.0",
      "event_type": "scene_rendered",
      "timestamp_utc": "2023-10-27T14:30:00Z",
      "hardware": {
        "gpu_name": "NVIDIA GeForce RTX 4090",
        "vram_gb": 24.0,
        "cpu_model": "AMD Ryzen 9 7950X",
        "os_arch": "linux-x86_64"
      },
      "workflow": {
        "script_id": "script_001",
        "scene_id": "scene_001",
        "prompt_id": "prompt_001",
        "checkpoint": "sd_xl_base_1.0.safetensors",
        "resolution": {
          "width": 1920,
          "height": 1080
        },
        "fps": 24,
        "frames": 240,
        "duration_s": 10.0
      },
      "performance": {
        "wall_time_s": 120.5,
        "avg_fps": 2.0,
        "vram_peak_gb": 22.5
      },
      "metadata": {
        "comfyui_version": "0.2.5",
        "python_version": "3.10.12",
        "cuda_version": "12.1"
      }
    }
  ]
}
```

### Field Mapping to Schema Doc
*   `hardware`: Matches Section 1 `hardware` object.
*   `workflow`: Matches Section 1 `workflow` object. Note: `script_id`, `scene_id`, `prompt_id` are anonymized hashes generated locally.
*   `performance`: Matches Section 1 `performance` object.
*   `metadata`: Matches Section 1 `metadata` object.

### Versioning
*   `schema_version`: Must match the current supported version (1.0.0).
*   If the local queue contains events with an older schema version, the hook must attempt to migrate them to the current version before sending. If migration fails, discard the event.
