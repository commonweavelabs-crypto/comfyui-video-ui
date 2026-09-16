# ComfyUI Video Workflow UI: Opt-In Telemetry Schema (Roadmap M-D)

## 1. Normalized Event Schema

The following JSON schema defines the normalized telemetry event. All fields are strictly derived from the local `render_stats.json` or system metadata. No raw user data is included.

```json
{
  "schema_version": "1.0.0",
  "event_type": "render_complete",
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
```

### Field-by-Field Justification

| Field | Type | Why Needed |
| :--- | :--- | :--- |
| `schema_version` | string | Enables backward compatibility and parsing logic updates. |
| `event_type` | string | Distinguishes render completion from other potential telemetry events (e.g., error logs). |
| `timestamp_utc` | string (ISO 8601) | Allows temporal analysis of performance trends and correlation with driver/software updates. |
| `hardware.gpu_name` | string | Primary key for performance matching. GPU architecture dictates compute capability. |
| `hardware.vram_gb` | float | Critical for VRAM-constrained workflows. Determines if downscaling or offloading was required. |
| `hardware.cpu_model` | string | Secondary key. CPU affects preprocessing/postprocessing and data transfer bottlenecks. |
| `hardware.os_arch` | string | OS-specific optimizations (e.g., Windows vs. Linux driver stacks) impact performance. |
| `workflow.script_id` | string | Identifies the specific workflow structure (node graph complexity). |
| `workflow.scene_id` | string | Identifies the specific scene within a script, allowing per-scene granularity. |
| `workflow.prompt_id` | string | Identifies the prompt template. Note: This is an anonymized ID, not the text. |
| `workflow.checkpoint` | string | Model architecture and size significantly impact compute time. |
| `workflow.resolution.width` | int | Compute cost scales quadratically with pixel count. |
| `workflow.resolution.height` | int | Compute cost scales quadratically with pixel count. |
| `workflow.fps` | int | Target output frame rate. |
| `workflow.frames` | int | Total number of frames to render. Directly proportional to time. |
| `workflow.duration_s` | float | Output video duration. Useful for normalizing time-per-second-of-video. |
| `performance.wall_time_s` | float | The actual observed render time. The primary target variable for prediction. |
| `performance.avg_fps` | float | Derived metric (frames / wall_time_s). Useful for quick sanity checks and UI display. |
| `performance.vram_peak_gb` | float | Observed peak memory usage. Helps identify if the machine was near VRAM limits. |
| `metadata.comfyui_version` | string | Software version changes can introduce performance regressions or improvements. |
| `metadata.python_version` | string | Python version can affect library compatibility and performance. |
| `metadata.cuda_version` | string | CUDA version affects kernel availability and performance. |

## 2. What Must NEVER Leave the Machine

The following data types are strictly prohibited from telemetry transmission.

### 1. PII (Personally Identifiable Information)
*   **Examples:** Usernames, email addresses, IP addresses, MAC addresses, hardware UUIDs, serial numbers.
*   **Justification:** Telemetry is for performance benchmarking, not user tracking. Including PII violates privacy principles and creates legal liability (GDPR/CCPA). Hardware identification is limited to model names (e.g., "RTX 4090") which are public product identifiers, not unique device IDs.

### 2. File Paths
*   **Examples:** `/home/user/projects/video/render.mp4`, `C:\Users\John\Documents\output.avi`.
*   **Justification:** File paths reveal the user's directory structure, operating system user name, and potentially sensitive project names. They provide no value for performance estimation.

### 3. Prompts (Text Content)
*   **Examples:** "A cat sitting on a mat in a sunny room", "Cyberpunk city at night with neon lights".
*   **Justification:** Prompts are creative content and may contain sensitive personal information, trade secrets, or copyrighted material. While prompt complexity can affect performance, this is captured indirectly via `prompt_id` (an anonymized hash) and `script_id`. The actual text is not needed for performance modeling.

### 4. Raw Node Graphs / Workflow JSON
*   **Examples:** Full JSON definition of the ComfyUI workflow.
*   **Justification:** The full workflow JSON is large and may contain embedded parameters, custom node configurations, or references to local files. Only the structural identifiers (`script_id`, `scene_id`) are needed to correlate performance with workflow complexity.

### 5. Output Media
*   **Examples:** Video files, image frames, audio tracks.
*   **Justification:** Media files are large, sensitive, and irrelevant to performance metrics. Only metadata (resolution, duration, frame count) is transmitted.

## 3. Show-What-Is-Sent Preview Format

When the user enables telemetry, the UI must display a preview of exactly what will be sent. This preview is generated locally before any network transmission.

**UI Component: "Telemetry Preview" Modal**

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  TELEMETRY PREVIEW                                              â”‚
â”‚  Status: Opt-In Enabled                                         â”‚
â”‚  Last Sent: 2023-10-27 14:30:00 UTC                             â”‚
â”‚  Next Send: 2023-10-28 14:30:00 UTC (Daily Batch)              â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  DATA TO BE SENT (Next Batch)                                   â”‚
â”‚                                                                  â”‚
â”‚  1. Render Event #1                                             â”‚
â”‚     Time: 2023-10-27T14:30:00Z                                  â”‚
â”‚     GPU: NVIDIA GeForce RTX 4090                                â”‚
â”‚     VRAM: 24.0 GB                                               â”‚
â”‚     Checkpoint: sd_xl_base_1.0.safetensors                      â”‚
â”‚     Resolution: 1920x1080                                       â”‚
â”‚     Frames: 240                                                 â”‚
â”‚     Wall Time: 120.5s                                           â”‚
â”‚     Script ID: script_001                                       â”‚
â”‚     Scene ID: scene_001                                         â”‚
â”‚     Prompt ID: prompt_001                                       â”‚
â”‚                                                                  â”‚
â”‚  2. Render Event #2                                             â”‚
â”‚     Time: 2023-10-27T15:15:00Z                                  â”‚
â”‚     GPU: NVIDIA GeForce RTX 4090                                â”‚
â”‚     VRAM: 24.0 GB                                               â”‚
â”‚     Checkpoint: sd_xl_base_1.0.safetensors                      â”‚
â”‚     Resolution: 1280x720                                        â”‚
â”‚     Frames: 120                                                 â”‚
â”‚     Wall Time: 45.2s                                            â”‚
â”‚     Script ID: script_002                                       â”‚
â”‚     Scene ID: scene_001                                         â”‚
â”‚     Prompt ID: prompt_002                                       â”‚
â”‚                                                                  â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  [Export JSON]  [Send Now]  [Disable Telemetry]                â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

**Key Features:**
*   **Export JSON:** Allows the user to download the exact payload before sending.
*   **Send Now:** Manual trigger for immediate submission.
*   **Disable Telemetry:** Immediate opt-out.
*   **No PII/Paths/Prompts:** The preview explicitly shows that no sensitive data is included.

## 4. Local Estimate Algorithm Spec

The local estimate algorithm predicts render time for a new machine/workflow combination using community data.

### Input
*   **Target Machine:** `gpu_name`, `vram_gb`, `cpu_model`, `os_arch`
*   **Target Workflow:** `script_id`, `scene_id`, `checkpoint`, `width`, `height`, `fps`, `frames`

### Matching Keys (Priority Order)
1.  **Exact Match:** `gpu_name` + `vram_gb` + `script_id` + `scene_id` + `checkpoint` + `width` + `height` + `fps` + `frames`
2.  **Resolution-Adjusted Match:** Same as above, but `width` and `height` are normalized to a reference resolution (e.g., 1080p) using a quadratic scaling factor.
3.  **GPU-Class Match:** Same `script_id` + `scene_id` + `checkpoint` + normalized resolution, but any `gpu_name` in the same performance tier (e.g., "RTX 4090", "RTX 4080").
4.  **Checkpoint-Only Match:** Same `checkpoint` + normalized resolution, any GPU.
5.  **Global Average:** Average wall time for all renders with the same `script_id` + `scene_id`.

### Fallbacks
*   If no data exists for the target `script_id`, use the global average for the `checkpoint`.
*   If no data exists for the `checkpoint`, use the global average for all renders.
*   If no data exists, display "Insufficient data" and do not provide an estimate.

### Confidence Display
*   **High Confidence:** â‰¥ 10 exact matches.
*   **Medium Confidence:** â‰¥ 5 resolution-adjusted matches.
*   **Low Confidence:** â‰¥ 3 GPU-class matches.
*   **Very Low Confidence:** < 3 matches. Display "Estimate may be inaccurate."

### Algorithm Pseudocode
```python
def estimate_render_time(target, community_data):
    # 1. Exact Match
    matches = filter(community_data, 
        gpu=target.gpu_name, 
        vram=target.vram_gb, 
        script=target.script_id, 
        scene=target.scene_id, 
        checkpoint=target.checkpoint, 
        width=target.width, 
        height=target.height, 
        fps=target.fps, 
        frames=target.frames)
    
    if len(matches) >= 10:
        return mean(matches.wall_time_s), "High"
    
    # 2. Resolution-Adjusted Match
    ref_width, ref_height = 1920, 1080
    scale_factor = (target.width * target.height) / (ref_width * ref_height)
    
    matches = filter(community_data,
        gpu=target.gpu_name,
        vram=target.vram_gb,
        script=target.script_id,
        scene=target.scene_id,
        checkpoint=target.checkpoint,
        fps=target.fps,
        frames=target.frames)
    
    if len(matches) >= 5:
        adjusted_times = [m.wall_time_s * scale_factor for m in matches]
        return mean(adjusted_times), "Medium"
    
    # 3. GPU-Class Match
    gpu_class = get_gpu_class(target.gpu_name)
    matches = filter(community_data,
        gpu_class=gpu_class,
        script=target.script_id,
        scene=target.scene_id,
        checkpoint=target.checkpoint,
        fps=target.fps,
        frames=target.frames)
    
    if len(matches) >= 3:
        adjusted_times = [m.wall_time_s * scale_factor for m in matches]
        return mean(adjusted_times), "Low"
    
    # 4. Checkpoint-Only Match
    matches = filter(community_data,
        checkpoint=target.checkpoint,
        fps=target.fps,
        frames=target.frames)
    
    if len(matches) >= 3:
        adjusted_times = [m.wall_time_s * scale_factor for m in matches]
        return mean(adjusted_times), "Very Low"
    
    # 5. Global Average
    matches = filter(community_data,
        script=target.script_id,
        scene=target.scene_id)
    
    if len(matches) >= 3:
        adjusted_times = [m.wall_time_s * scale_factor for m in matches]
        return mean(adjusted_times), "Very Low"
    
    return None, "Insufficient Data"
```

## 5. Batch Format and Submission Cadence Recommendation

### Batch Format
*   **Format:** JSON array of normalized events.
*   **Compression:** Gzip compressed to reduce bandwidth.
*   **Encryption:** TLS 1.3 in transit.
*   **Size Limit:** Max 1MB per batch. If exceeded, split into multiple batches.

### Submission Cadence
*   **Default:** Daily at 00:00 UTC.
*   **Manual:** User can trigger "Send Now" from the preview modal.
*   **Throttling:** Max 1 batch per hour to prevent network congestion.
*   **Retry Logic:** Exponential backoff for failed submissions (1s, 2s, 4s, 8s, 16s). Max 5 retries.

### Local Storage
*   Telemetry events are stored locally in `telemetry_queue.json` until sent.
*   Queue is cleared after successful submission.
*   Max queue size: 1000 events. If exceeded, oldest events are discarded.

## 6. Schema Versioning Plan

### Versioning Strategy
*   **Semantic Versioning:** `MAJOR.MINOR.PATCH`
*   **MAJOR:** Breaking changes (e.g., removing a field, changing a field type).
*   **MINOR:** Additive changes (e.g., adding a new optional field).
*   **PATCH:** Bug fixes or documentation updates.

### Compatibility Rules
*   **Backward Compatibility:** New versions must be able to parse old versions.
*   **Forward Compatibility:** Old versions must ignore unknown fields in new versions.
*   **Deprecation:** Fields are deprecated for 2 MAJOR versions before removal.

### Version History
*   **1.0.0:** Initial release.
*   **1.1.0:** Added `hardware.cpu_model` and `metadata.cuda_version`.
*   **2.0.0:** Removed `hardware.os_arch` (replaced by `hardware.os_name` and `hardware.os_version`).
