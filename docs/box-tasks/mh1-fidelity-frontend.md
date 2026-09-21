# M-H H-1 Scene-Fidelity Panel â€” Frontend Spec

**Scope:** H-1 only (prompt-element cue mapping + playback highlight + boundary edit). H-2/H-3 are out of scope; this panel *consumes* H-2's `verification` block and WS events but does not implement them.
**Stack assumption:** React 18 + TypeScript, Vite, Zustand, Tailwind, `react-window` (virtualization), native `<video>`. One sitting â‰ˆ 6â€“8 h.

---

## 1. Data model (frontend types)

These mirror the scene JSON. H-1 adds `cues[]` (versioned) alongside the existing `renders[]` and H-2's `verification` block.

```ts
// types/fidelity.ts
export type CueType =
  | 'dialogue' | 'action' | 'camera' | 'shot'
  | 'audio' | 'vfx' | 'transition' | 'environment';

export interface Cue {
  id: string;
  type: CueType;
  text: string;            // the prompt element / script fragment
  start: number;           // seconds, relative to scene render
  end: number;             // seconds
  source: 'auto' | 'manual';
  version: number;
}

export interface ScriptLine {
  id: number;
  text: string;
  start: number;           // planned/expected seconds
  end: number;
}

// H-2 block (consumed, not produced here)
export interface Verification {
  status: 'pending' | 'running' | 'completed' | 'failed';
  verdict?: 'all_lines_spoken' | 'missing_lines' | 'timing_offsets'
          | 'no_audio' | 'music_only';
  transcribed_words?: { word: string; start: number; end: number }[];
  line_matches?: {
    line_id: number;
    original_text: string;
    matched_words: string[];
    similarity: number;
    status: 'matched' | 'missing';
    offset_ms: number | null;
  }[];
  completed_at?: string;
}

export interface Scene {
  scene_id: string;
  render_path: string;
  duration: number;        // seconds, from render_stats
  script_lines: ScriptLine[];
  cues: Cue[];
  verification?: Verification;
  render_stats?: { fps: number; frames: number; completed_at: string };
}
```

**Cue color map** (the 8 SceneFlow cue types, adapted):

```ts
export const CUE_COLORS: Record<CueType, string> = {
  dialogue:    '#3b82f6', // blue
  action:      '#f59e0b', // amber
  camera:      '#8b5cf6', // violet
  shot:        '#06b6d4', // cyan
  audio:       '#ec4899', // pink
  vfx:         '#ef4444', // red
  transition:  '#10b981', // emerald
  environment: '#64748b', // slate
};
```

---

## 2. Component tree

```
SceneEditor (existing)
â””â”€â”€ SceneCard (existing, extended)
    â””â”€â”€ FidelityPanel                    â† NEW root, embedded in scene card
        â”œâ”€â”€ FidelityToolbar
        â”‚   â”œâ”€â”€ CueTypeFilter (chips)
        â”‚   â”œâ”€â”€ ModeToggle (View / Edit)
        â”‚   â””â”€â”€ Actions (Auto-generate, Reset, Save)
        â”œâ”€â”€ CueTimeline                  â† the core visual
        â”‚   â”œâ”€â”€ TimelineRuler
        â”‚   â”œâ”€â”€ CueTrack (per type, virtualized rows)
        â”‚   â”‚   â””â”€â”€ CueBlock (draggable in Edit mode)
        â”‚   â”œâ”€â”€ Playhead
        â”‚   â””â”€â”€ HighlightOverlay
        â”œâ”€â”€ ScriptCueList                â† scrollable, synced to playhead
        â”‚   â””â”€â”€ ScriptCueRow (click â†’ seek; shows H-2 match state)
        â””â”€â”€ FidelityStatus               â† empty / loading / error / verdict
```

**Why this shape:** the timeline is the primary surface (SceneFlow's core idea = time-mapped cues). The script list is secondary and doubles as the H-2 word-click surface. `FidelityStatus` is a single slot that swaps content by state, keeping the parent clean.

---

## 3. Per-component props / state

### `FidelityPanel` (root)
- **Props:** `scene: Scene`, `onSceneUpdate: (patch: Partial<Scene>) => void`
- **State (local):**
  - `mode: 'view' | 'edit'`
  - `activeCueTypes: Set<CueType>` (filter)
  - `currentTime: number` (driven by video, mirrored here)
  - `isPlaying: boolean`
  - `draftCues: Cue[]` (edit-mode working copy; committed on Save)
  - `autoGenStatus: 'idle' | 'running' | 'done' | 'error'`
- **Derived:** `visibleCues = draftCues.filter(c => activeCueTypes.has(c.type))`
- **Responsibilities:** owns the `<video>` element (via ref), subscribes to WS, owns the single source of truth for `currentTime`.

### `FidelityToolbar`
- **Props:** `mode`, `onModeChange`, `activeCueTypes`, `onToggleType(type)`, `onAutoGenerate`, `onReset`, `onSave`, `canSave`, `autoGenStatus`
- **State:** none (fully controlled)

### `CueTimeline`
- **Props:** `cues: Cue[]`, `duration: number`, `currentTime: number`, `mode`, `onSeek(t)`, `onCueChange(cue: Cue)`, `onCueMove(id, newStart, newEnd)`
- **State:** `hoverCueId: string | null`
- **Layout:** horizontal time axis; one row per active cue type. Width = `duration * PX_PER_SEC` (e.g. 60 px/s), horizontally scrollable, auto-scrolls to follow playhead.

### `CueBlock`
- **Props:** `cue`, `pxPerSec`, `isHovered`, `isEditing`, `onClick`, `onDragStart`, `onDragEnd`
- **State:** `dragState: { type: 'move' | 'resize-left' | 'resize-right' } | null`
- **Interaction (Edit mode only):**
  - Drag body â†’ move (clamped to `[0, duration]`, min width 0.2 s)
  - Drag left/right edge â†’ resize
  - Snap to 0.1 s grid; snap to neighboring cue edges within 0.15 s
- **Render:** colored bar, `title` tooltip with `text`, label if width > 80 px

### `Playhead`
- **Props:** `currentTime`, `duration`, `pxPerSec`, `onSeek`
- **Interaction:** click/drag on ruler seeks.

### `ScriptCueList`
- **Props:** `scene`, `currentTime`, `onSeek(t)`, `onWordClick(word, t)`
- **State:** `activeLineId` (derived from `currentTime`)
- **Behavior:** virtualized list; row auto-scrolls into view as playhead crosses it. Each word is a `<button>`; click â†’ `onWordClick`. Word color reflects H-2 match state (matched = normal, missing = red strikethrough) when `verification` exists.

### `FidelityStatus`
- **Props:** `state: 'empty' | 'loading' | 'error' | 'ready'`, `error?: string`, `verification?: Verification`, `onRetry?`
- **Renders:** one of the four states (see Â§6).

---

## 4. API calls (real endpoints)

Base: `/api`. All return JSON.

| Action | Method | Endpoint | Notes |
|---|---|---|---|
| Load scene (incl. cues + verification) | `GET` | `/api/scenes/{scene_id}` | Returns full `Scene`. |
| Trigger H-2 verification | `POST` | `/api/scenes/{scene_id}/verify` | Body: `{ model_size?: 'tiny'\|'base', threshold?: number }`. Returns `202 { job_id }`. |
| Get H-2 result | `GET` | `/api/scenes/{scene_id}/verification` | Returns the `verification` block. |
| Save cues (H-1 edit) | `PUT` | `/api/scenes/{scene_id}/cues` | Body: `{ cues: Cue[], version: number }`. Optimistic-lock on `version`. |
| Auto-generate cues (opt-in vision) | `POST` | `/api/scenes/{scene_id}/cues/auto` | Body: `{ frame_step?: number }`. Returns `202 { job_id }`. Expensive; gated behind a confirm. |
| Render media URL | â€” | `/media/{scene_id}` | `<video src>`; served by backend static handler. |

**Zustand slice (`useFidelityStore`):**

```ts
interface FidelityState {
  scene: Scene | null;
  loading: boolean;
  error: string | null;
  verificationStatus: Record<string, { stage: string; progress: number; message: string }>;

  loadScene: (sceneId: string) => Promise<void>;
  saveCues: (sceneId: string, cues: Cue[], version: number) => Promise<void>;
  triggerVerify: (sceneId: string, opts?: { model_size?: string; threshold?: number }) => Promise<void>;
  triggerAutoCues: (sceneId: string, opts?: { frame_step?: number }) => Promise<void>;
  handleWsEvent: (payload: WsEvent) => void;
}
```

`loadScene` sets `loading=true`, `GET /api/scenes/{id}`, on success sets `scene`, on failure sets `error`. `saveCues` does the `PUT`, then refetches to reconcile `version` (handles 409 conflict â†’ toast "reloaded, re-apply edits").

---

## 5. WebSocket event handling

Single WS connection (existing app-level socket). The panel filters events by `scene_id`.

**Event envelope:**
```json
{ "event": "verification_progress", "scene_id": "scene_001",
  "data": { "stage": "transcribing", "progress": 0.5, "message": "Transcribing audio..." } }
```

**Events the panel consumes:**

| Event | Action |
|---|---|
| `verification_started` | Set `verificationStatus[scene_id] = { stage:'started', progress:0, message:'Verification started' }`. |
| `verification_progress` | Update `verificationStatus[scene_id]` with `data.stage/progress/message`. |
| `verification_completed` | Clear `verificationStatus[scene_id]`; `GET /api/scenes/{id}/verification` â†’ merge into `scene.verification`. |
| `verification_failed` | Clear status; set `scene.verification = { status:'failed' }`; surface error in `FidelityStatus`. |
| `cues_auto_started` / `cues_auto_progress` / `cues_auto_completed` / `cues_auto_failed` | Same pattern as verification, driving `autoGenStatus`. On completed, refetch scene to pick up new `cues[]`. |

**Handler (in store):**
```ts
handleWsEvent: (p) => {
  const { event, scene_id, data } = p;
  if (scene_id !== get().scene?.scene_id) return;
  switch (event) {
    case 'verification_started':
      set(s => ({ verificationStatus: { ...s.verificationStatus,
        [scene_id]: { stage:'started', progress:0, message:'Verification started' } } })); break;
    case 'verification_progress':
      set(s => ({ verificationStatus: { ...s.verificationStatus,
        [scene_id]: { stage:data.stage, progress:data.progress, message:data.message } } })); break;
    case 'verification_completed':
      set(s => { const v = {...s.verificationStatus}; delete v[scene_id]; return { verificationStatus: v }; });
      get().loadScene(scene_id); break;
    case 'verification_failed':
      set(s => { const v = {...s.verificationStatus}; delete v[scene_id];
        return { verificationStatus: v,
          scene: s.scene ? { ...s.scene, verification: { status:'failed' } } : s.scene }; });
      break;
    // cues_auto_* analogous, updating autoGenStatus
  }
}
```

**App-level wiring:** the existing socket dispatches every message to `useFidelityStore.handleWsEvent`. No per-panel socket.

---

## 6. Empty / loading / error states

`FidelityStatus` renders exactly one of:

- **`loading`** (scene not yet fetched): skeleton timeline (gray bars) + "Loading sceneâ€¦" spinner.
- **`error`** (fetch failed or `verification_failed`): red banner with `error` message + **Retry** button (calls `loadScene`). If `verification.status === 'failed'`, show "Verification failed â€” retry" with a **Re-run** button calling `triggerVerify`.
- **`empty`** (scene loaded, `cues.length === 0`): centered message "No cues yet." + two buttons: **Auto-generate** (calls `triggerAutoCues`, with confirm modal noting cost) and **Add manually** (switches to Edit mode). If `verification` is `no_audio`, show a gray "No audio track" note and disable word-click.
- **`ready`**: renders the full timeline + script list.

**In-flight overlays (not full-state swaps):**
- Verification running â†’ thin progress bar at top of panel: `progress * 100%` + `message` (from `verificationStatus`).
- Auto-gen running â†’ same bar, label "Generating cuesâ€¦".

**Verdict badge** (top-right of panel, when `verification` present):
- `all_lines_spoken` â†’ green "âœ“ All lines spoken"
- `missing_lines` â†’ amber "âš  Missing lines"
- `timing_offsets` â†’ blue "Â± Timing offsets"
- `no_audio` â†’ gray "No audio track"
- `music_only` â†’ purple "ðŸŽµ Music only"
- absent â†’ neutral "No verification" + **Verify** button.

---

## 7. Playback + highlight mechanics

- `FidelityPanel` owns `<video ref={videoRef} src={/media/{scene_id}} />`.
- `timeupdate` â†’ `setCurrentTime(e.target.currentTime)`.
- **Active cue** = cues where `start <= currentTime < end`. `HighlightOverlay` draws a translucent band across those rows; `ScriptCueList` highlights the matching line and auto-scrolls it into view.
- **Seek:** `onSeek(t)` sets `videoRef.currentTime = t`. Used by Playhead drag, CueBlock click, and word click.
- **Word click (H-2):** `onWordClick(word, t)` â†’ seek to `t`. `t` resolved from `verification.transcribed_words` (first word whose normalized text matches and belongs to the line's `matched_words`). If no timestamp (line missing / no verification), word is non-clickable and styled missing.
- **Auto-scroll follow:** while playing, timeline `scrollLeft` tracks `currentTime * pxPerSec - viewport/2`, unless the user has manually scrolled (pause follow for 3 s after manual scroll).

---

## 8. Edit Mode (manual boundary drag)

- `ModeToggle` flips `mode`. In **Edit**, `draftCues` is seeded from `scene.cues`.
- `CueBlock` drag/resize updates `draftCues` locally (no API call per frame).
- **Save** (`onSave`): `saveCues(scene_id, draftCues, scene.cues[0]?.version ?? 0)`. On success, `scene.cues = draftCues`, `mode = 'view'`. On 409, refetch and toast.
- **Reset** (`onReset`): `draftCues = scene.cues` (discard edits).
- **Add cue:** in Edit mode, a "+ Add cue" button appends a default cue at `currentTime` (type = first active type, width 1 s, `source:'manual'`).
- **Delete:** in Edit mode, `Ã—` on a cue block removes it from `draftCues`.
- All edits are local until Save; no partial persistence.

---

## 9. Embedding in the scene editor

- `SceneCard` already renders scene metadata + render preview. Add a collapsible **Fidelity** section (default open when a scene is selected).
- `SceneCard` passes `scene` and `onSceneUpdate` down. `FidelityPanel` is self-contained; it does not mutate the card's other state.
- **Sizing:** panel is a fixed-height region (â‰ˆ 320 px) inside the card; timeline scrolls horizontally, script list scrolls vertically. On narrow cards, the script list collapses to a toggle.
- **Lifecycle:** `FidelityPanel` mounts when its scene is selected; `loadScene` fires on mount and on `scene_id` change. Unmount cancels in-flight follow-scroll; WS subscription is app-level so nothing leaks.
- **No SceneFlow code** is imported â€” only the cue-type taxonomy and time-mapping UX are borrowed.

---

## 10. Implementation checklist (one sitting)

1. `types/fidelity.ts` + `CUE_COLORS`.
2. `useFidelityStore` (Zustand) with the 5 actions + `handleWsEvent`.
3. `FidelityPanel` root: video ref, time loop, mode, filter, draftCues.
4. `CueTimeline` + `CueBlock` (drag/resize with clamping + snap).
5. `Playhead` + `HighlightOverlay`.
6. `ScriptCueList` (virtualized) + word-click seek + H-2 styling.
7. `FidelityToolbar` + `FidelityStatus` (4 states + verdict badge + progress bar).
8. Wire WS dispatch in app socket â†’ store.
9. Wire `SceneCard` to mount `FidelityPanel`.
10. Manual QA: play/seek, drag boundaries, save, run verify, watch WS progress, empty/error paths.

**Out of scope (H-2/H-3):** whisper worker, fuzzy matcher, audio extraction, SRT/ffmpeg burn-in. This panel only reads `verification` and triggers the existing endpoints.
