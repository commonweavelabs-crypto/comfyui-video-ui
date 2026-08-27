# Local ComfyUI-Powered Storyboard Video Dashboard
## Inspired by StoryGen-Atelier (0xsline/storygen-atelier)

**Goal**: Build a fully local, ComfyUI-driven equivalent of StoryGen-Atelier's storyboard-to-video pipeline. No Google Gemini or Vertex AI. Use ComfyUI for image generation, first-last-frame interpolation, and video models. Reuse the existing comfyui-video-queue-react dashboard as the base (horizontal card timeline).

---

## 1. Core Concepts Stolen from StoryGen-Atelier (What Works Well)

### 1.1 Interpolation Chain / Sliding Window Transition Analysis
- Storyboard = sequence of keyframe images (first frame of each shot).
- For every adjacent pair (Shot N end frame → Shot N+1 start frame):
  - Analyze the visual difference.
  - Generate a motion/transition prompt.
  - Use a video model conditioned on **first frame + last frame + prompt** to create a smooth interpolation clip.
- Final shot gets a closing/hold clip.
- All generated clips are concatenated losslessly with ffmpeg (`-c copy`).

This is the killer feature. We will replicate it 100% locally with ComfyUI.

### 1.2 Storyboard Generation Flow
- User inputs: overall story prompt + desired number of shots + style.
- System generates:
  - Per-shot text prompt (for image gen + for video interp).
  - Per-shot image (keyframe) via ComfyUI.
  - Optional: user can upload/replace any keyframe image.
- Gallery + persistent logs (SQLite like the original).

### 1.3 UI Patterns We Will Adopt
- Horizontal scrolling row of job cards (already in our dashboard) — each card = one shot/scene.
- Per-card controls: edit prompt, upload/replace first-frame image, generate video clip, status, duration, actions.
- "Stitch All" button that triggers ffmpeg concat of all completed clips in order.
- Separate tabs/sections: Storyboard Editor, Gallery, Logs.
- Built-in prompt guide (we will adapt the VideoGenerationPromptGuide.md for ComfyUI workflows).
- Consistent visual style enforcement.

### 1.4 Backend Architecture (Node.js + ComfyUI API)
- Express backend (reuse pattern from StoryGen).
- SQLite for:
  - Storyboard sessions (shots array + metadata)
  - Video logs (per-clip generation)
  - Gallery items
- ComfyUI client: queue prompts via HTTP API (`/prompt`, `/history`, websocket for progress).
- ffmpeg wrapper for stitching and clip management.
- Data folders: `data/storyboards/`, `data/clips/`, `data/final-videos/`

---

## 2. High-Level Architecture (Local Version)

### 2.1 System Components
```
comfyui-storyboard-video/
├── frontend/          (existing React + Tailwind, extended)
│   ├── src/
│   │   ├── App.jsx    (main horizontal timeline of shots)
│   │   ├── components/
│   │   │   ├── ShotCard.jsx
│   │   │   ├── StoryboardGenerator.jsx
│   │   │   ├── StitchButton.jsx
│   │   │   └── Gallery.jsx
│   │   └── api.js
├── backend/           (new or extended Node.js)
│   ├── src/
│   │   ├── app.js
│   │   ├── services/
│   │   │   ├── comfyuiService.js     (queue prompts, poll results, websocket)
│   │   │   ├── storyboardService.js  (generate shots, manage state)
│   │   │   ├── interpolationService.js (build ComfyUI workflow JSON for FLF2V)
│   │   │   ├── ffmpegService.js
│   │   │   └── db/ (better-sqlite3 stores)
│   │   └── routes/
├── data/              (SQLite + generated media)
├── workflows/         (ComfyUI .json workflow templates)
│   ├── keyframe_generation.json
│   ├── first_last_frame_interp.json
│   └── ...
├── guide/             (adapted prompt guide for ComfyUI)
└── start_servers.sh
```

### 2.2 Data Model (SQLite Tables)
- `storyboards(id, title, prompt, num_shots, style, created_at, status)`
- `shots(id, storyboard_id, shot_number, image_prompt, video_prompt, first_frame_path, clip_path, duration, status)`
- `video_logs(id, shot_id, comfyui_job_id, status, output_path, error, created_at)`
- `gallery(id, type, path, metadata, created_at)`

### 2.3 ComfyUI Workflow Integration (Key Replacement for Gemini/Veo)

**A. Keyframe Generation**
- Use existing image-to-video or text-to-image workflows in ComfyUI.
- We will create a dedicated workflow JSON that takes:
  - Text prompt + style
  - Optional reference image (for consistency)
  - Outputs: high-quality keyframe image

**B. First-Last Frame Interpolation (Core Magic)**
ComfyUI has excellent support (from research):
- `ComfyUI-Frame-Interpolation` nodes (Fannovel16)
- Model-specific nodes: `WanFirstLastFrameToVideo`, LTX First-Last, etc.
- Generic approach: Load two images (end of previous shot + start of next shot) → condition video model → generate clip.

We will maintain a library of workflow templates in `/workflows/`:
- `flf2v_wan22.json` (recommended for quality)
- `frame_interpolation_film.json`
- `ltx_first_last.json`

The backend will:
1. Load the template.
2. Inject the two frame paths + combined prompt.
3. Queue to ComfyUI.
4. Poll `/history` until complete.
5. Download the resulting video clip.

**C. Transition Prompt Generation**
Since no Gemini, options:
- Use local LLM (Ollama via existing setup) to analyze two images (vision) + generate transition description.
- Or simple rule-based + user-editable prompt per transition.
- Or reuse the prompt guide style but route through local model.

**D. Stitching**
- Collect all generated clip paths in order.
- Use fluent-ffmpeg or direct ffmpeg command with concat demuxer.
- Output: `final_story_{timestamp}.mp4`

---

## 3. Detailed Feature Breakdown (Minimum Prototype Scope)

### Phase 1 (Minimum Prototype - This Task)
- Copy of existing dashboard preserved.
- Storyboard session: Create new storyboard with story prompt + num shots.
- Horizontal timeline of ShotCards.
- Each ShotCard:
  - Editable image prompt (for keyframe).
  - Upload / generate keyframe image (via ComfyUI).
  - Generate video clip button (first-last stub for now; single shot uses image-to-video).
  - Status badge, duration, preview.
- "Generate All Keyframes" button.
- "Stitch All Clips" button (ffmpeg concat of whatever clips exist).
- Basic SQLite logging of generations.
- Gallery tab showing past final videos.

### Phase 2 (Future)
- Full sliding-window interpolation (analyze adjacent shots, generate transition clips automatically).
- Local LLM for transition prompt generation.
- Consistent style enforcement across shots.
- Per-shot video model selection.
- Advanced prompt guide integration.
- Export options, project save/load.

---

## 4. Implementation Plan (Next Steps After This Document)

1. **Backend Setup** (new `backend/` folder in the project)
   - Express + better-sqlite3 + fluent-ffmpeg + undici (for ComfyUI API).
   - comfyuiService.js with queue/poll/download helpers.
   - interpolationService.js that loads workflow JSON and injects first/last frame.

2. **Frontend Extensions**
   - Add "New Storyboard" modal with prompt + shot count.
   - ShotCard component with image upload, prompt editor, generate buttons.
   - Global "Stitch" action that calls backend `/stitch` endpoint.

3. **Workflow Templates**
   - Create minimal working `first_last_frame_interp.json` (or use existing ComfyUI workflows).
   - Keyframe generation workflow.

4. **Integration with Existing ComfyUI**
   - Assume ComfyUI is running on localhost:8188 (standard).
   - Use the same comfyui-video-queue-react patterns for job tracking.

---

## 5. Risks & Mitigations
- ComfyUI API complexity: Start with simple queue + history polling; add websocket later.
- Workflow JSON fragility: Version and document every template.
- Performance: Interpolation can be slow — show progress per card.
- Consistency: Use ControlNet / IPAdapter in workflows for style matching between shots.

This architecture directly steals the best ideas (interpolation chain, per-shot cards, gallery/logs, prompt guide) while replacing the Google stack with ComfyUI + local models. It builds on the horizontal card dashboard you already like.