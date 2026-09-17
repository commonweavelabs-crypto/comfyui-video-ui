# Pre-flight Review: First End-to-End Test (M-C) â€” Render + Export Flow

## 1. Flow-Blocking Bugs

### B1. `submit_scene` returns raw `result` on success, not the enriched scene
**File:** `routes/comfyui.py`, lines 262â€“268
```python
    return result
```
The endpoint returns the raw `submit_scene_to_comfyui` result (e.g. `{"success": True, "prompt_id": "..."}`) on success, but the frontend likely expects the enriched scene object (with `scene_id`, `status`, `prompt_id`, `initial_frame_url`, etc.) to update its local state. On failure it also returns `result` (line 268), which may lack a `scene` key. The frontend cannot reconcile its scene list from this response. The broadcast (lines 255â€“259) sends the enriched scene, but the HTTP response does not. A first-time user's UI will show stale state until the next poll.

**Fix:** Return `{"success": True, "scene": _enrich_scene(...)}` on success and `{"success": False, "error": ..., "scene": _enrich_scene(...)}` on failure.

### B2. `submit_scene` saves old video to renders array *before* checking if the scene has a prompt
**File:** `routes/comfyui.py`, lines 237â€“250
```python
    old_video_filename = scene.get("video_filename")
    old_video_path = scene.get("video_path", "")
    old_prompt_id = scene.get("prompt_id")
    if old_video_filename:
        old_render_entry = { ... }
        store.add_render_to_scene(body.script_id, body.scene_id, old_render_entry)
```
If the scene has no `prompt` (empty string), `submit_scene_to_comfyui` will likely fail, but the old video has already been archived into the `renders` array. The scene status is then set to `"error"` (line 264), but the render entry persists. On retry, the same old video is archived again, creating duplicate render entries. This corrupts the render history and confuses the user when they later pick an "active render."

**Fix:** Validate that `scene.get("prompt")` is non-empty before archiving the old video. Move the archive step to after a successful `submit_scene_to_comfyui` call, or guard it with a prompt check.

### B3. `poll_scenes` does not handle `"complete"` status when `files` list is empty
**File:** `routes/comfyui.py`, lines 310â€“326
```python
            if new_status == "complete":
                files = status_result.get("files", [])
                video_filename = None
                video_path = None
                for f in files:
                    ...
                new_render_entry = {
                    "video_filename": video_filename or "",
                    "video_path": video_path or "",
                    ...
                }
```
If `check_prompt_status` returns `"complete"` but `files` is empty (e.g., ComfyUI produced no output, or the output was a non-video format not in the extension list), `video_filename` and `video_path` remain `None`. The scene is updated to `"complete"` with empty video fields. The frontend will show a "complete" scene with no video to export. The user sees a green checkmark but cannot download or assemble. This is a silent failure that will confuse a first-time user.

**Fix:** If `video_filename` is `None` after the loop, set status to `"error"` with a message like `"Render completed but no video file was found in ComfyUI output."`

### B4. `cancel_scene` does not clear `video_filename` or `video_path`
**File:** `routes/comfyui.py`, lines 148â€“155
```python
    updated = store.update_scene(script_id, scene_id, {
        "status": "draft",
        "prompt_id": None,
    })
```
When a user cancels a render, the scene status is reset to `"draft"` and `prompt_id` is cleared, but `video_filename` and `video_path` from the previous render remain. The scene still shows a video URL. If the user then submits a new render, the old video is archived (correctly), but if they cancel again before a new render completes, the stale video persists. More critically, if the user cancels and then tries to export, they will export the old video, not realizing the render was cancelled.

**Fix:** Also clear `video_filename` and `video_path` on cancel, or at minimum set them to `None`.

### B5. `submit_all_scenes` does not stop on first failure
**File:** `routes/comfyui.py`, lines 280â€“310
```python
    for scene in to_submit:
        ...
        result = await submit_scene_to_comfyui(scene, body.script_id)
        if result.get("success"):
            ...
        else:
            ...
        results.append({"scene_id": sid, **result})
```
If scene 1 fails (e.g., ComfyUI is down), scenes 2 through N are still submitted. Each will also fail, but the user sees a response with `submitted: N` and a list of errors. The frontend may interpret `submitted: N` as "all good" and show a success toast. The user does not realize that none of the scenes were actually queued.

**Fix:** Break out of the loop on first failure, or return `submitted: 0` with a clear error message. At minimum, the response should include a top-level `"all_success": false` flag.

---

## 2. Race Conditions in Polling / WebSocket

### R1. Poll and WebSocket event can both update the same scene concurrently
**File:** `routes/comfyui.py` (`_do_poll`, lines 295â€“370) and `ws_manager` (event routing via `manager.index_prompt`)
The poll endpoint iterates over all scenes and calls `store.update_scene` for each. Simultaneously, the WebSocket event handler (triggered by ComfyUI's native event socket) can also call `store.update_scene` for the same scene when a render completes. Both paths read the scene, compute updates, and write back. If they interleave:
- Poll reads scene (status `"rendering"`), checks ComfyUI, gets `"complete"`, prepares update.
- WS event fires, reads scene (status `"rendering"`), prepares update with timing data.
- Poll writes `"complete"` + video.
- WS writes `"rendering"` + timing (overwriting the `"complete"` status).

The scene is now stuck in `"rendering"` forever. The next poll will re-check and eventually fix it, but the user sees a stuck progress bar.

**Fix:** Use optimistic concurrency control (e.g., a version counter or `updated_at` check) in `store.update_scene`, or serialize scene updates through a single async lock per scene.

### R2. `submit_scene` and `poll` can race on the `prompt_id` field
**File:** `routes/comfyui.py`, lines 237â€“268 (submit) and lines 295â€“370 (poll)
If the user submits a scene and immediately triggers a poll (e.g., the frontend polls on a timer), the poll may read the scene before `prompt_id` is set (it is set on line 252, after `submit_scene_to_comfyui` returns). The poll sees `prompt_id = None` and skips the scene. This is benign but can cause a one-poll-cycle delay. More dangerously, if the user submits scene A, then quickly submits scene B, and a poll runs in between, the poll may read scene A with the old `prompt_id` (from a previous render) and incorrectly check the status of the old prompt.

**Fix:** Set `prompt_id` atomically with the status change, or use a transactional update.

### R3. `delete_render` and `poll` can race on the `renders` array
**File:** `routes/scenes.py`, lines 310â€“370 (delete_render) and `routes/comfyui.py`, lines 310â€“340 (poll)
If the user deletes a render while a poll is in progress, the poll may add a new render entry to the `renders` array based on a stale read. The delete operation reads the scene, removes the target render, and writes back. The poll reads the scene (before the delete), adds a new render, and writes back. The delete's removal is lost. The user deletes a render, but it reappears on the next poll.

**Fix:** Use a lock or optimistic concurrency on the `renders` array.

---

## 3. Silent Failures That Would Confuse a First-Time User

### S1. `check_prompt_status` returning `"unknown"` is treated as non-terminal
**File:** `routes/comfyui.py`, lines 300â€“305
```python
        if prompt_id and current_status in ("queued", "rendering", "unknown"):
            status_result = await check_prompt_status(prompt_id)
            new_status = status_result.get("status", "unknown")
```
If `check_prompt_status` returns `"unknown"` (e.g., ComfyUI is temporarily unreachable, or the prompt_id is not found in history), the scene remains in `"queued"` or `"rendering"` indefinitely. The poll does not escalate to an error state. The user sees a scene stuck at 0% progress with no error message. They cannot tell if ComfyUI is down, if the prompt was lost, or if the render is just slow.

**Fix:** After N consecutive `"unknown"` polls (e.g., 5), escalate to `"error"` with a message like `"ComfyUI status unknown for 5 consecutive polls. Check ComfyUI health."`

### S2. `download_comfyui_output` failure is silently ignored
**File:** `routes/comfyui.py`, lines 315â€“320
```python
                    if fname.endswith((".mp4", ".webm", ".mov", ".avi", ".mkv", ".gif")) or not video_filename:
                        dl_result = await download_comfyui_output(f, script_id, sid)
                        if dl_result.get("success"):
                            video_filename = dl_result["video_filename"]
                            video_path = dl_result["video_path"]
```
If `download_comfyui_output` fails (e.g., disk full, permission error, network timeout), the loop continues to the next file. If all files fail, `video_filename` remains `None`. The scene is set to `"complete"` with empty video fields (see B3). The user sees a "complete" status but no video. There is no error message.

**Fix:** Collect download errors and include them in the scene's `error` field if no video was successfully downloaded.

### S3. `generate_audio` failure returns HTTP 500 but the scene status is not updated
**File:** `routes/scenes.py`, lines 240â€“260
```python
    if result.get("success"):
        ...
    else:
        await manager.broadcast({
            "type": "audio_progress",
            ...
            "status": "error",
            "error": result.get("error"),
        })
        raise HTTPException(500, result.get("error", "Audio generation failed"))
```
The scene's `status` is not updated to `"error"` in the store. The frontend receives a 500 and a WS broadcast with `"status": "error"`, but if the user refreshes the page, the scene status is still `"draft"` (or whatever it was before). The error is lost. The user sees a scene with no audio and no error message.

**Fix:** Update the scene status to `"error"` in the store before raising the HTTPException.

### S4. `upload_scene_frame` and `upload_scene_audio` do not validate file type
**File:** `routes/scenes.py`, lines 195â€“210 (frame) and lines 215â€“240 (audio)
If the user uploads a `.txt` file as a frame, or a `.mp4` file as audio, the file is saved and the scene is updated. The frontend will try to render the image or play the audio and fail. There is no error message. The user sees a broken preview and does not know why.

**Fix:** Validate the file extension (and optionally MIME type) before saving. Return a 400 with a clear message if the type is invalid.

---

## 4. Top 3 Fixes Ranked

### Fix 1: Handle empty `files` list in `_do_poll` (B3 + S2)
**Why first:** This is the most likely failure mode in a first end-to-end test. ComfyUI may complete a render but produce no video file (e.g., wrong output node, empty output directory). The scene is marked `"complete"` with no video, and the user cannot export. This is a silent failure that will immediately block the test.

**Change:** In `routes/comfyui.py`, `_do_poll`, after the `for f in files` loop:
```python
                if video_filename is None:
                    scene = store.update_scene(script_id, sid, {
                        "status": "error",
                        "error": "Render completed but no video file was found in ComfyUI output.",
                    })
                    from routes.scenes import _enrich_scene
                    await manager.broadcast({
                        "type": "scene_update",
                        "script_id": script_id,
                        "scene": _enrich_scene(script_id, scene),
                    })
                    continue
```

### Fix 2: Return enriched scene in `submit_scene` response (B1)
**Why second:** The frontend cannot update its local state from the HTTP response. It must rely on the WS broadcast, which may be missed or delayed. In a first test, the user submits a scene and sees no immediate UI feedback. They may think the submit failed.

**Change:** In `routes/comfyui.py`, `submit_scene`, replace the final `return result` with:
```python
    from routes.scenes import _enrich_scene
    if result.get("success"):
        scene = store.get_scene(body.script_id, body.scene_id)
        return {"success": True, "scene": _enrich_scene(body.script_id, scene)}
    else:
        scene = store.get_scene(body.script_id, body.scene_id)
        return {"success": False, "error": result.get("error", "Unknown error"), "scene": _enrich_scene(body.script_id, scene)}
```

### Fix 3: Escalate `"unknown"` poll status to `"error"` after N retries (S1)
**Why third:** If ComfyUI is down or the prompt_id is lost, the scene is stuck in `"queued"`/`"rendering"` forever. The user sees a progress bar at 0% with no error. In a first test, this is the most common "why is nothing happening?" scenario.

**Change:** In `routes/comfyui.py`, `_do_poll`, track consecutive unknown polls per scene (e.g., in the scene's `unknown_poll_count` field). After 5 consecutive `"unknown"` results:
```python
            elif new_status == "unknown":
                unknown_count = scene.get("unknown_poll_count", 0) + 1
                if unknown_count >= 5:
                    scene = store.update_scene(script_id, sid, {
                        "status": "error",
                        "error": f"ComfyUI status unknown for {unknown_count} consecutive polls. Check ComfyUI health.",
                        "unknown_poll_count": 0,
                    })
                else:
                    scene = store.update_scene(script_id, sid, {"unknown_poll_count": unknown_count})
                from routes.scenes import _enrich_scene
                await manager.broadcast({
                    "type": "scene_update",
                    "script_id": script_id,
                    "scene": _enrich_scene(script_id, scene),
                })
```
Reset `unknown_poll_count` to 0 when the status is `"rendering"` or `"complete"`.
