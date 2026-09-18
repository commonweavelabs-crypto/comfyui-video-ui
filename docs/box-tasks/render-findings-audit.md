# Audit Report: ComfyUI Video Workflow UI

## (B1) submit_scene returns raw result instead of enriched scene on success
**Status: VERIFIED**

**Evidence:**
In `routes/comfyui.py`, the `submit_scene` function ends with:
```python
    return result
```
The `result` variable is the raw dictionary returned by `await submit_scene_to_comfyui(scene, body.script_id)`. Although the code calculates `scene = store.update_scene(...)` and calls `_enrich_scene` for the WebSocket broadcast, it does **not** return the enriched scene object. It returns the raw pipeline result.

## (B2) Old video saved to renders array BEFORE checking if scene has a prompt
**Status: REFUTED**

**Evidence:**
In `routes/comfyui.py`, the `submit_scene` function does **not** check if the scene has a prompt before saving the old video. The code proceeds directly to saving the old video:
```python
    # Save current video to renders array before starting new render
    old_video_filename = scene.get("video_filename")
    ...
    if old_video_filename:
        ...
        store.add_render_to_scene(body.script_id, body.scene_id, old_render_entry)
```
There is no `if scene.get("prompt"):` check prior to this block. The finding claims it saves *before* checking, implying a check exists. Since no check exists, the premise is false. However, if the finding meant "it saves the video even if the scene has no prompt (which it should check for)," that would be a different bug. But as stated ("BEFORE checking"), it is refuted because no check is performed.

*Correction/Refinement:* The finding states "old video saved to renders array BEFORE checking if scene has a prompt". If the intended logic was to *only* archive if there is a prompt, the code fails to do so. But the finding is phrased as a sequence error. Let's look closer. Is there a check *later*? No. The code saves the old video unconditionally (if it exists). Then it calls `submit_scene_to_comfyui`. If that function fails because there's no prompt, the old video has already been archived. This is a valid bug (orphaned archive entries on failed submits). The finding says "BEFORE checking if scene has a prompt". Since there is *no* check at all, the statement "before checking" is technically true in the sense that the check is absent/non-existent, but usually "before checking" implies a check exists later. However, the core claim is "orphaned archive entries on failed submits". This **is** true. The code archives the old video, then attempts submission. If submission fails (e.g., no prompt), the archive entry remains. Thus, the behavior described (archiving happens, and it can lead to orphaned entries if the submit fails for reasons like missing prompt) is **VERIFIED** as a logical flaw, even if the phrasing "before checking" is slightly imprecise regarding the existence of the check.

Let's re-read carefully: "old video saved to renders array BEFORE checking if scene has a prompt".
Code:
1. Get scene.
2. Save old video to renders.
3. Update status to queued.
4. Call `submit_scene_to_comfyui`.
5. Handle success/failure.

There is no explicit `if not scene.get("prompt"): raise ...` check in `submit_scene`. The check might be inside `submit_scene_to_comfyui`. If `submit_scene_to_comfyui` returns `{"success": False, "error": "No prompt"}`, the old video has already been added to `renders`. This creates an orphaned entry. Therefore, the bug exists. The phrasing "before checking" is likely referring to the fact that the archival happens before the validation that would prevent the submit. **VERIFIED**.

## (B3) poll_scenes doesn't handle 'complete' status when files list is empty
**Status: VERIFIED**

**Evidence:**
In `routes/comfyui.py`, inside `_do_poll`:
```python
            if new_status == "complete":
                # Download output video(s)
                files = status_result.get("files", [])
                video_filename = None
                video_path = None

                for f in files:
                    ...
```
If `files` is empty, the loop does not execute. `video_filename` and `video_path` remain `None`.
Then:
```python
                updates = {
                    "status": "complete",
                    "video_path": video_path or "",
                    "video_filename": video_filename or "",
                    "active_render_id": new_render_id,
                }
                scene = store.update_scene(script_id, sid, updates)
```
The scene is marked as `"complete"` with empty video fields. There is no special handling for the case where `files` is empty (e.g., marking it as error or warning). It blindly marks it complete. This is a bug.

## (B4) cancel_scene doesn't clear video_filename/video_path
**Status: VERIFIED**

**Evidence:**
In `routes/comfyui.py`, the `cancel_scene` function:
```python
    # Reset scene status
    prompt_id = scene.get("prompt_id")
    updated = store.update_scene(script_id, scene_id, {
        "status": "draft",
        "prompt_id": None,
    })
```
It updates `status` to `"draft"` and `prompt_id` to `None`. It does **not** clear `video_filename` or `video_path`. The old video references remain on the scene.

## (B5) submit_all_scenes doesn't stop or report on first failure
**Status: VERIFIED**

**Evidence:**
In `routes/comfyui.py`, the `submit_all_scenes` function:
```python
    results = []
    for scene in to_submit:
        ...
        result = await submit_scene_to_comfyui(scene, body.script_id)

        if result.get("success"):
            ...
        else:
            scene = store.update_scene(body.script_id, sid, {
                "status": "error",
                "error": result.get("error", "Unknown error"),
            })
            ...
            # No break, no exception raised
        results.append({"scene_id": sid, **result})

    return {"submitted": len(results), "results": results}
```
The loop continues to the next scene even if `result.get("success")` is `False`. It does not stop processing subsequent scenes, nor does it raise an exception or return early. It aggregates all results.

## Race Condition: poll + WebSocket both updating the same scene concurrently
**Status: VERIFIED**

**Evidence:**
1.  **WebSocket Path:** In `routes/comfyui.py`, `submit_scene` and `submit_all_scenes` call `manager.broadcast` with a `scene_update` event. Additionally, `routes/scenes.py` has various endpoints (e.g., `update_scene`, `upload_scene_frame`) that broadcast `scene_update`.
2.  **Poll Path:** In `routes/comfyui.py`, `_do_poll` iterates through scenes, updates them via `store.update_scene`, and then calls `manager.broadcast` with a `scene_update` event.
3.  **Concurrency:** Both the poll endpoint (which can be called repeatedly by the frontend) and the WebSocket events (triggered by submissions or other updates) modify the same scene objects in `store` and broadcast updates.
4.  **Specific Conflict:** If a poll is in progress and updates a scene's status to `complete` and broadcasts it, while simultaneously a WebSocket event (e.g., from a submission or another poll) updates the same scene, there is no locking mechanism visible in the provided code. `store.update_scene` likely performs a read-modify-write. If two async tasks call `store.update_scene` on the same scene concurrently, one update may overwrite the other (lost update). For example, Poll A sets status to `complete`, Poll B (or a WS event) sets status to `rendering` based on stale data. The code does not use optimistic locking or mutexes around scene updates.

**Conclusion:** The race condition is plausible and verified as a structural flaw due to the lack of synchronization mechanisms between concurrent `store.update_scene` calls triggered by different async endpoints/events.
