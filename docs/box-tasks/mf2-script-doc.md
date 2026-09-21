# M-F2: Script Page as Document â€” Specification

## 1. Document Model

### 1.1 Core Abstraction
The script is treated as a **versioned, block-based document** rather than a raw text blob. The Fountain source (`routes/writing.py` output) is the canonical string, but the UI operates on a parsed, normalized block structure.

**Data Structure:**
```typescript
interface ScriptDocument {
  id: string;
  version: number;
  rawFountain: string; // Canonical source of truth
  blocks: ScriptBlock[]; // Parsed, editable units
  lastSavedAt: timestamp;
  dirty: boolean;
}

interface ScriptBlock {
  id: string; // Stable UUID, persists across re-parses
  type: 'scene_heading' | 'action' | 'dialogue' | 'transition' | 'parenthetical';
  content: string; // Raw text for this block
  startLine: number; // Line index in rawFountain
  endLine: number;
  sceneId?: string; // Link to Scene entity if applicable
}
```

### 1.2 Fountain Parsing Strategy
- **Parser:** Use `fountain-parser` (or equivalent) to convert `rawFountain` into a tree.
- **Block Mapping:**
  - `INT. DAY` â†’ `scene_heading`
  - `Character Name` â†’ `dialogue` (speaker)
  - `(beat)` â†’ `parenthetical`
  - `Action text` â†’ `action`
  - `CUT TO:` â†’ `transition`
- **Stable IDs:** Each block is assigned a UUID on first parse. On re-parse, blocks are matched by content hash + position to preserve IDs where possible. If a block is deleted/merged, its ID is marked `orphaned`.

### 1.3 Source of Truth
- **`rawFountain`** is the only persisted state in the backend.
- **`blocks`** are derived in-memory for the UI.
- On save, the UI serializes `blocks` back to Fountain syntax and updates `rawFountain`.

---

## 2. Inline-Edit UX

### 2.1 Editor Component
- **Component:** `ScriptEditor` (React)
- **Rendering:** Each `ScriptBlock` is rendered as a `<div>` with `contentEditable` or a lightweight `CodeMirror`/`Monaco` instance per block.
- **Visual Hints:**
  - `scene_heading`: Bold, uppercase, distinct background.
  - `dialogue`: Indented, speaker name in bold.
  - `action`: Standard text.
  - `transition`: Italic, right-aligned.

### 2.2 Cursor & Selection Behavior
- **Focus:** Clicking a block focuses it. Cursor placement is standard text editing.
- **Selection:** User can select text within a block or across multiple blocks (using native browser selection API).
- **Keyboard:**
  - `Enter` in `action`/`dialogue`: Creates a new block of the same type.
  - `Backspace` at start of block: Merges with previous block.
  - `Tab`: Indents dialogue/parenthetical.

### 2.3 Autosave & Dirty State
- **Debounce:** 1000ms after last keystroke.
- **Flow:**
  1. User edits a block â†’ `dirty = true`.
  2. Debounce timer starts.
  3. On timer end:
     - Serialize `blocks` â†’ `newRawFountain`.
     - POST `/api/scripts/{id}` with `newRawFountain`.
     - Backend updates `rawFountain`, increments `version`.
     - UI sets `dirty = false`, updates `lastSavedAt`.
- **Dirty Indicator:** Small dot in header: "Unsaved changes" vs. "Saved".
- **Conflict Handling:** If backend version > local version (e.g., another user edited), show a banner: "Script was updated by another user. Reload?" (No auto-merge in v1).

### 2.4 Undo/Redo
- **In-Memory Stack:** Maintain a local undo stack of `ScriptDocument` snapshots (max 50).
- **Trigger:** `Ctrl+Z` / `Ctrl+Shift+Z`.
- **Persistence:** Undo does not trigger autosave until the user makes a new edit or explicitly saves.

---

## 3. Screenwriter Selection-Edit Flow

### 3.1 Trigger
- User selects text (within or across blocks).
- Clicks "Ask Screenwriter" button (appears in floating toolbar near selection).
- Or: `Ctrl+K` opens prompt bar with selection context.

### 3.2 Prompt Interface
- **Modal/Popover:**
  - **Context:** Displays selected text.
  - **Instruction:** Text input (e.g., "Punch up the dialogue," "Make it more noir," "Shorten this action").
  - **Tone/Style:** Optional dropdown (e.g., "Standard," "Noir," "Comedy").
- **Submit:** Sends to `/api/screenwriter/rewrite` with:
  - `scriptId`
  - `selectedText`
  - `instruction`
  - `context` (surrounding 2 blocks before/after for coherence).

### 3.3 LLM Rewrite
- **Backend:**
  - Constructs prompt: "Rewrite the following script segment: [selectedText]. Instruction: [instruction]. Context: [context]. Return only the rewritten text in Fountain format."
  - Calls LLM.
  - Parses response into new `ScriptBlock[]`.
- **Response:** Returns `diff` object:
  ```json
  {
    "originalBlocks": [...],
    "newBlocks": [...],
    "diff": [
      { "type": "replace", "blockId": "abc", "oldContent": "...", "newContent": "..." },
      { "type": "insert", "afterBlockId": "abc", "newBlock": {...} },
      { "type": "delete", "blockId": "def" }
    ]
  }
  ```

### 3.4 Diff View
- **UI:** Replaces the selected blocks with a **diff preview** panel.
- **Visuals:**
  - **Red:** Deleted/changed text (strikethrough).
  - **Green:** Added/changed text (highlight).
  - **Neutral:** Unchanged context.
- **Actions:**
  - **Accept:** Applies `newBlocks` to the document. Triggers autosave.
  - **Reject:** Discards diff. Restores original blocks.
  - **Regenerate:** Re-runs LLM with same prompt (optional).

### 3.5 Undo Safety
- **Snapshot:** Before applying "Accept," push a full `ScriptDocument` snapshot to the undo stack.
- **Rollback:** If user clicks "Undo" after accepting, the document reverts to the pre-rewrite state.
- **Persistence:** The rewrite is a single atomic transaction in the document history.

---

## 4. Scene Breakdown Sync

### 4.1 Critical Constraint
**Renders reference `sceneId`. If scenes shift, renders break.**

### 4.2 Re-Parse Triggers
- **On Save:** Every time `rawFountain` is updated (autosave or manual save), the backend re-parses the script.
- **On Load:** When the script page is opened.

### 4.3 Scene Sync Algorithm
1. **Parse:** Generate new `Scene[]` from `rawFountain`.
2. **Match:** Compare new scenes to existing `Scene` entities in DB.
   - **Match Criteria:**
     - `sceneId` (if stable ID preserved).
     - `headingText` (exact match).
     - `position` (index in script).
3. **Update Strategy:**
   - **Unchanged Scene:** No action.
   - **Modified Scene (text changed, ID same):** Update `Scene.content`, `Scene.heading`. **Do not invalidate renders** if only dialogue/action changed (renders may still be valid). *Note: If action changes significantly, flag renders as "stale" but do not delete.*
   - **Deleted Scene:** Mark `Scene` as `archived`. **Do not delete renders** immediately. Flag associated renders as "orphaned."
   - **New Scene:** Create new `Scene` entity. No renders.
   - **Shifted Scene (ID changed due to re-parse):** **CRITICAL.** If a scene's ID changes, all renders referencing the old ID are now orphaned.
     - **Mitigation:** Use **stable scene IDs** based on `headingText + index` hash. If a scene is inserted before, subsequent scenes shift index. To prevent ID churn:
       - **Rule:** Scene IDs are **immutable** once created.
       - **New Scenes:** Get new IDs.
       - **Deleted Scenes:** Keep ID, mark `archived`.
       - **Renamed Scenes:** If heading changes, keep old ID, update `headingText`.
       - **This ensures renders always reference a valid `sceneId` unless the scene is explicitly deleted.**

### 4.4 Render Impact
- **Stale Flag:** When a scene's `content` changes, all associated `Render` objects are flagged `stale = true`.
- **UI Indicator:** In the Scene Breakdown panel, stale scenes show a warning icon: "Renders may be outdated."
- **User Action:** User can manually "Re-render" or "Discard" stale renders.
- **Auto-Cleanup:** None. Orphaned renders are kept for 30 days, then purged by cron job.

### 4.5 Sync Flow Diagram
```
User Edits Script
       |
       v
Autosave (rawFountain updated)
       |
       v
Backend Re-Parses Script
       |
       v
Compare New Scenes vs. DB Scenes
       |
       +---> Unchanged: No-op
       +---> Modified: Update Scene, Flag Renders Stale
       +---> Deleted: Archive Scene, Orphan Renders
       +---> New: Create Scene
       |
       v
Update DB (Scenes, Renders)
       |
       v
UI Updates Scene Breakdown Panel
```

---

## 5. Edge Cases

### 5.1 Multi-User Editing
- **Scenario:** Two users edit the same script.
- **Handling:** Last-write-wins. If User A saves after User B, User A's version overwrites. User B sees a conflict banner on next load.
- **Future:** Implement OT (Operational Transformation) or CRDT for real-time collaboration. Out of scope for M-F2.

### 5.2 Large Scripts
- **Scenario:** 100+ page script.
- **Handling:**
  - **Virtualization:** Render only visible blocks in the editor.
  - **Parsing:** Parse in chunks if >5000 lines.
  - **Autosave:** Debounce increases to 2000ms for large docs.

### 5.3 LLM Failure
- **Scenario:** Screenwriter API times out or returns malformed Fountain.
- **Handling:**
  - Show error toast: "Screenwriter failed. Try again."
  - Do not modify the document.
  - Log error for debugging.

### 5.4 Fountain Syntax Errors
- **Scenario:** User types invalid Fountain (e.g., missing scene heading).
- **Handling:**
  - **Parser:** Tolerant parser. Treats invalid lines as `action` blocks.
  - **Validation:** On save, if parser fails, show inline error: "Invalid Fountain syntax at line X."
  - **Block IDs:** Invalid blocks get temporary IDs. On next valid parse, they are re-matched.

### 5.5 Scene ID Churn
- **Scenario:** User deletes a scene in the middle of the script.
- **Handling:**
  - Deleted scene ID is archived.
  - Subsequent scenes keep their IDs (no shift).
  - Renders for deleted scene are orphaned.
  - Renders for subsequent scenes remain valid.

### 5.6 Undo After Save
- **Scenario:** User edits, autosave triggers, then hits Undo.
- **Handling:**
  - Undo reverts local state to pre-edit.
  - `dirty = true` again.
  - Next autosave sends the reverted state to backend.
  - Backend version increments again.

### 5.7 Empty Script
- **Scenario:** User deletes all text.
- **Handling:**
  - `blocks = []`.
  - `rawFountain = ""`.
  - Scene breakdown shows "No scenes found."
  - Screenwriter button disabled.

### 5.8 Network Failure
- **Scenario:** Autosave fails due to network error.
- **Handling:**
  - `dirty = true` remains.
  - Show toast: "Save failed. Retrying..."
  - Retry with exponential backoff (1s, 2s, 4s, max 30s).
  - If 3 retries fail, show "Save failed. Data may be lost."
  - Local state is preserved in memory.

---

## 6. API Endpoints

### 6.1 GET `/api/scripts/{id}`
- **Response:** `ScriptDocument` (with `rawFountain` and `blocks`).

### 6.2 POST `/api/scripts/{id}`
- **Body:** `{ "rawFountain": string, "version": number }`
- **Response:** Updated `ScriptDocument`.
- **Error:** 409 Conflict if version mismatch.

### 6.3 POST `/api/screenwriter/rewrite`
- **Body:**
  ```json
  {
    "scriptId": "string",
    "selectedText": "string",
    "instruction": "string",
    "context": "string"
  }
  ```
- **Response:**
  ```json
  {
    "diff": [...],
    "newBlocks": [...],
    "originalBlocks": [...]
  }
  ```

### 6.4 GET `/api/scenes?scriptId={id}`
- **Response:** `Scene[]` with `stale` flags.

---

## 7. UI Components

### 7.1 `ScriptEditor`
- **Props:** `document`, `onSave`, `onSelect`.
- **State:** `focusedBlockId`, `selection`.
- **Features:**
  - Block rendering.
  - Autosave logic.
  - Selection handling.

### 7.2 `ScreenwriterToolbar`
- **Props:** `selection`, `onRewrite`.
- **Features:**
  - Appears on selection.
  - Prompt input.
  - Submit button.

### 7.3 `DiffPreview`
- **Props:** `diff`, `onAccept`, `onReject`.
- **Features:**
  - Side-by-side or inline diff.
  - Accept/Reject buttons.

### 7.4 `SceneBreakdownPanel`
- **Props:** `scenes`, `onSelectScene`.
- **Features:**
  - List of scenes.
  - Stale indicators.
  - Click to scroll to scene in editor.

---

## 8. Testing Strategy

### 8.1 Unit Tests
- **Parser:** Test Fountain parsing with valid/invalid inputs.
- **Diff Algorithm:** Test diff generation for insert/delete/replace.
- **Scene Sync:** Test scene matching with ID stability.

### 8.2 Integration Tests
- **Autosave:** Simulate edits, verify POST calls.
- **Screenwriter Flow:** Mock LLM, verify diff preview and accept/reject.
- **Scene Sync:** Edit script, verify scene updates and render flags.

### 8.3 E2E Tests
- **User Flow:** Edit script â†’ Autosave â†’ Ask Screenwriter â†’ Accept â†’ Verify scene breakdown.
- **Undo Flow:** Edit â†’ Save â†’ Undo â†’ Verify state.
- **Conflict Flow:** Two users edit â†’ Verify conflict banner.

---

## 9. Future Enhancements

- **Real-Time Collaboration:** WebSocket-based OT/CRDT.
- **Version History:** Full git-like history for scripts.
- **AI Suggestions:** Proactive suggestions for weak scenes.
- **Render Automation:** Auto-re-render stale scenes on save (optional).
