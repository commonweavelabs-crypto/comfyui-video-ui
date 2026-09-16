# M-F2: Script Page as a Document (Paged View) Design Spec

## 1. Data Model

### 1.1 Page/Chunk Relationship
The script is decomposed into immutable `Page` objects. Each `Page` maps 1:1 to a single LLM processing chunk.

**`Page` Entity:**
```typescript
interface ScriptPage {
  id: string;              // UUID
  index: number;           // 0-based sequential index
  content: string;         // Raw Fountain text for this page
  charCount: number;       // Cached length for validation
  sceneStartIndex: number; // Index of first scene in this page (for boundary validation)
  sceneEndIndex: number;   // Index of last scene in this page
  createdAt: timestamp;
  updatedAt: timestamp;
}
```

**`Script` Entity (Updated):**
```typescript
interface Script {
  id: string;
  title: string;           // Cleaned title (no "Fountain" prefix)
  pages: ScriptPage[];     // Ordered array
  metadata: {
    totalChars: number;
    lastChunkedAt: timestamp;
  };
}
```

### 1.2 Storage Changes
- **Migration from Blob to Array:** Existing scripts store content as a single `string` blob. New schema stores `pages: ScriptPage[]`.
- **Indexing:** `pages` is a dense array. `index` must match array position. Reordering requires re-indexing all subsequent pages.
- **Validation Constraint:** Each page must contain complete scene boundaries. A scene header (`INT.`, `EXT.`, etc.) cannot appear in the middle of a page unless it is the first line of that page.

## 2. UI Behavior Spec

### 2.1 Pagination View
- **Default View:** "Paged" mode is the default for scripts > 10,000 chars.
- **Page Display:**
  - Render one page at a time in the main editor pane.
  - Header bar displays: `Page {index + 1} of {totalPages}`.
  - Footer bar displays: `{charCount} / 3000 chars` with a color indicator (green < 2500, yellow 2500â€“3000, red > 3000).
- **Navigation:**
  - `Prev Page` / `Next Page` buttons.
  - Keyboard shortcuts: `Alt+Left` / `Alt+Right`.
  - Page jump dropdown: Select any page index to navigate directly.

### 2.2 Add-Page UX
- **Trigger:** "Add Page" button in the header bar.
- **Behavior:**
  1. Create a new empty `ScriptPage` at the end of the array.
  2. Focus the editor on the new page.
  3. If the previous page is > 3000 chars, display a warning toast: "Previous page exceeds chunk limit. Consider splitting."
- **Auto-Split (Optional):** If the user pastes content > 3000 chars into a page, trigger a modal: "Content exceeds 3K limit. Split at next scene boundary?"
  - **Yes:** Automatically split at the nearest scene boundary within the limit.
  - **No:** Allow overflow (flagged for error in chunking pipeline).

### 2.3 Page Navigation & Editing
- **Editing:** Users edit content within the current page only.
- **Cross-Page Edits:** If a user edits a scene that spans multiple pages (see Edge Cases), the UI locks the page and prompts: "Scene spans multiple pages. Edit in Page {n} or split scene?"
- **Save:** Changes are saved per-page. `charCount` is recalculated on blur.

## 3. Chunking Integration

### 3.1 Page-to-Chunk Mapping
- **Direct Mapping:** Each `ScriptPage` is passed directly as a chunk to the LLM pipeline.
- **No Re-Chunking:** The existing 3K-char scene-boundary chunker is bypassed for paged scripts. The page boundaries *are* the chunk boundaries.
- **Pipeline Input:**
  ```json
  {
    "script_id": "uuid",
    "chunks": [
      {
        "page_id": "page-uuid-1",
        "index": 0,
        "content": "INT. ROOM - DAY\n\nJANE walks in.",
        "char_count": 1200
      },
      {
        "page_id": "page-uuid-2",
        "index": 1,
        "content": "EXT. STREET - NIGHT\n\n...",
        "char_count": 2800
      }
    ]
  }
  ```

### 3.2 Boundary Rules (3K Finding)
- **Max Chunk Size:** 3000 characters.
- **Scene Boundary Rule:** Chunks must start and end at scene boundaries.
  - **Start:** First line of the page must be a scene header (`INT.`, `EXT.`, `INT/EXT.`, `FADE IN:`, etc.) or a continuation marker if the scene started on the previous page (see Edge Cases).
  - **End:** Last line of the page must be a scene break or a complete action/dialogue block. No scene header may appear as the last line unless it is the only content (empty page).
- **Validation:** Before sending to LLM, validate each page:
  1. `charCount <= 3000`.
  2. `content` does not end with a scene header.
  3. `content` does not start with a scene header if `index > 0` and the previous page ended mid-scene (handled via Edge Cases).

## 4. Title Cleanup Rules

### 4.1 LLM Title Generation
- **Input:** First 500 chars of the script.
- **Output:** Raw title string from LLM.

### 4.2 Cleanup Pipeline
1. **Trim Whitespace:** `title.trim()`.
2. **Strip "Fountain" Prefix:**
   - Regex: `/^fountain\s*/i`
   - If match, remove prefix and trim again.
   - Example: `"Fountain: The Last Stand"` â†’ `"The Last Stand"`.
   - Example: `"fountain the last stand"` â†’ `"the last stand"` (then capitalize first letter).
3. **Capitalize First Letter:** Ensure first letter is uppercase.
4. **Length Limit:** Truncate to 100 chars if exceeded.
5. **Default:** If empty after cleanup, use `"Untitled"`.

### 4.3 Integration
- Apply cleanup when:
  1. LLM generates a new title.
  2. User manually edits the title (optional: apply same rules on save).
- Store cleaned title in `Script.title`.

## 5. Migration Plan for Existing Scripts

### 5.1 Detection
- Scripts with `pages` field `null` or `undefined` are legacy.
- Scripts with `content` field are legacy.

### 5.2 Migration Steps
1. **Parse Content:** Use existing Fountain parser to extract scenes.
2. **Chunk into Pages:**
   - Iterate scenes.
   - Accumulate scenes into a buffer.
   - When buffer `charCount` approaches 3000, check if the next scene would exceed the limit.
   - If yes, flush buffer as a new `ScriptPage`.
   - If no, add scene to buffer.
   - Flush remaining buffer as the final page.
3. **Assign IDs:** Generate UUIDs for each page.
4. **Update Script:**
   - Set `pages` array.
   - Remove `content` field.
   - Set `metadata.totalChars` to sum of page `charCount`.
5. **Title Cleanup:** Apply Section 4 rules to existing `title`.

### 5.3 Rollback
- Keep `content` field in database for 30 days post-migration.
- If migration fails, restore from `content`.

## 6. Edge Cases

### 6.1 Scenes Spanning Pages
- **Scenario:** A single scene is > 3000 chars.
- **Handling:**
  1. **Prevention:** UI prevents adding a scene > 3000 chars to a single page.
  2. **Splitting:** If a scene must span pages, it is split at the nearest dialogue/action boundary within the 3K limit.
  3. **Continuation Marker:** The second page starts with a continuation marker: `CONTINUED:` (Fountain standard).
  4. **LLM Context:** The chunking pipeline passes both pages as separate chunks. The LLM is instructed to treat `CONTINUED:` as a continuation of the previous scene.
  5. **UI Warning:** Display a warning icon on the page header: "Scene continues from previous page."

### 6.2 Page Deletion
- **Trigger:** "Delete Page" button.
- **Validation:**
  1. If page contains a scene that spans to the next page, prompt: "Deleting this page will break scene continuity. Proceed?"
  2. If page is the only page, disable deletion.
- **Behavior:**
  1. Remove page from array.
  2. Re-index all subsequent pages (`index` decremented by 1).
  3. Recalculate `metadata.totalChars`.
  4. If the deleted page was the last page, remove the `CONTINUED:` marker from the new last page if present.

### 6.3 Page Reorder
- **Trigger:** Drag-and-drop in page list sidebar.
- **Validation:**
  1. Reordering is only allowed if no scenes span across the reordered pages.
  2. If a scene spans pages, disable drag-and-drop for those pages.
- **Behavior:**
  1. Move page in array.
  2. Re-index all pages.
  3. Update `sceneStartIndex` and `sceneEndIndex` for affected pages.
  4. Recalculate `metadata.totalChars` (unchanged, but validate).

### 6.4 Empty Pages
- **Scenario:** User adds a page but does not type anything.
- **Handling:**
  1. Allow empty pages in UI.
  2. Exclude empty pages from LLM chunking pipeline.
  3. Display a placeholder: "Empty page. Add content or delete."

### 6.5 Character Count Overflow
- **Scenario:** User edits a page to > 3000 chars.
- **Handling:**
  1. UI displays red warning: "Page exceeds 3K limit."
  2. Disable "Send to LLM" button for this script until resolved.
  3. Suggest splitting at next scene boundary.
