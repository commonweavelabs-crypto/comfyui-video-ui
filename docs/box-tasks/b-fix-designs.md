Here are the minimal fixes for the verified findings.

### B1: `submit_scene` returns raw result instead of enriched scene
**Rationale:** The function calculates the updated `scene` object but returns the raw `result` dictionary from the pipeline, causing the frontend to receive inconsistent data (missing enriched fields like URLs).

**Diff:**
```diff
--- a/routes/comfyui.py
+++ b/routes/comfyui.py
@@ -176,7 +176,7 @@ async def submit_scene(body: SubmitSceneBody):
             "scene": _enrich_scene(body.script_id, scene),
         })
 
-    return result
+    return {"success": result.get("success"), "scene": _enrich_scene(body.script_id, scene), "error": result.get("error")}
```

**Test:**
```bash
curl -X POST http://localhost:8000/api/comfyui/submit \
  -H "Content-Type: application/json" \
  -d '{"script_id": "test_script", "scene_id": "test_scene"}'
# Expected: JSON response containing "scene" object with enriched fields, not just raw pipeline keys.
```

---

### B2: Old video saved to renders array BEFORE checking if scene has a prompt
**Rationale:** The code archives the old video before validating if the scene is actually submittable (has a prompt). If submission fails due to missing prompt, the old video is orphaned in the renders array. Moving the check before the archive prevents this.

**Diff:**
```diff
--- a/routes/comfyui.py
+++ b/routes/comfyui.py
@@ -142,6 +142,10 @@ async def submit_scene(body: SubmitSceneBody):
     if not scene:
         raise HTTPException(404, "Scene not found")
 
+    # Check if scene has a prompt before archiving old video
+    if not scene.get("prompt"):
+        raise HTTPException(400, "Scene has no prompt to submit")
+
     # Save current video to renders array before starting new render
     old_video_filename = scene.get("video_filename")
     old_video_path = scene.get("video_path", "")
```

**Test:**
```bash
# Create a scene with no prompt
curl -X POST http://localhost:8000/api/scripts/test_script/scenes \
  -H "Content-Type: application/json" \
  -d '{"scene_id": "no_prompt_scene", "prompt": ""}'

# Attempt to submit
curl -X POST http://localhost:8000/api/comfyui/submit \
  -H "Content-Type: application/json" \
  -d '{"script_id": "test_script", "scene_id": "no_prompt_scene"}'
# Expected: 400 Bad Request with "Scene has no prompt to submit". Verify no new entry in renders array.
```

---

### B3: `poll_scenes` doesn't handle 'complete' status when files list is empty
**Rationale:** If ComfyUI reports "complete" but no files are found (e.g., generation failed silently or output path mismatch), the scene is marked "complete" with empty video fields, which is misleading. It should be marked as an error.

**Diff:**
```diff
--- a/routes/comfyui.py
+++ b/routes/comfyui.py
@@ -283,6 +283,12 @@ async def _do_poll(script_id: str) -> dict:
                             if fname.endswith((".mp4", ".webm", ".mov", ".avi", ".mkv")):
                                 break  # Prefer first video file
 
+                if not video_filename:
+                    scene = store.update_scene(script_id, sid, {
+                        "status": "error",
+                        "error": "Render completed but no video file found"
+                    })
+                    continue
+
                 # Add new render to renders array
                 new_render_id = uuid.uuid4().hex[:12]
                 new_render_entry = {
```

**Test:**
```bash
# Mock ComfyUI to return complete status with empty files list
# Then poll
curl -X POST http://localhost:8000/api/comfyui/poll \
  -H "Content-Type: application/json" \
  -d '{"script_id": "test_script"}'
# Expected: Scene status is "error" with message "Render completed but no video file found".
```

---

### B4: `cancel_scene` doesn't clear video_filename/video_path
**Rationale:** When canceling a render, the scene is reset to "draft", but the old `video_filename` and `video_path` remain. This causes the frontend to display a stale video that is no longer associated with the current draft state.

**Diff:**
```diff
--- a/routes/comfyui.py
+++ b/routes/comfyui.py
@@ -105,6 +105,8 @@ async def cancel_scene(script_id: str, scene_id: str):
     updated = store.update_scene(script_id, scene_id, {
         "status": "draft",
         "prompt_id": None,
+        "video_filename": None,
+        "video_path": None,
     })
     from routes.scenes import _enrich_scene
     enriched = _enrich_scene(script_id, updated)
```

**Test:**
```bash
# Submit a scene, let it complete (or mock complete), then cancel
curl -X POST http://localhost:8000/api/comfyui/cancel?script_id=test_script&scene_id=test_scene
# Expected: Response scene object has "video_filename": null and "video_path": null.
```

---

### B5: `submit_all_scenes` doesn't stop or report on first failure
**Rationale:** The loop continues processing subsequent scenes even if one fails. This can lead to partial submissions and confusing state. It should stop on first failure to maintain atomicity of the batch operation.

**Diff:**
```diff
--- a/routes/comfyui.py
+++ b/routes/comfyui.py
@@ -215,6 +215,10 @@ async def submit_all_scenes(body: SubmitAllBody):
             "scene": _enrich_scene(body.script_id, scene),
         })
 
+        if not result.get("success"):
+            raise HTTPException(400, f"Failed to submit scene {sid}: {result.get('error', 'Unknown error')}")
+
         results.append({"scene_id": sid, **result})
 
     return {"submitted": len(results), "results": results}
```

**Test:**
```bash
# Create multiple scenes, make one fail (e.g., no prompt)
curl -X POST http://localhost:8000/api/comfyui/submit-all \
  -H "Content-Type: application/json" \
  -d '{"script_id": "test_script", "only_status": "ready"}'
# Expected: 400 Bad Request with error message for the failed scene. Subsequent scenes are not submitted.
```

---

### Race Condition: poll + WebSocket both updating the same scene concurrently
**Rationale:** Concurrent `store.update_scene` calls from poll and WebSocket events can cause lost updates. Adding a mutex around scene updates ensures atomicity.

**Diff:**
```diff
--- a/routes/comfyui.py
+++ b/routes/comfyui.py
@@ -1,6 +1,7 @@
 """ComfyUI integration routes â€” submit scenes, poll status, queue (F5, F6) + /status, /poll."""
 
 from __future__ import annotations
+import asyncio
 
 import uuid
 
@@ -15,6 +16,9 @@ from config import COMFYUI_URL
 
 router = APIRouter(prefix="/api/comfyui", tags=["comfyui"])
 
+# Global lock for scene updates to prevent race conditions
+scene_update_lock = asyncio.Lock()
+
 
 class SubmitSceneBody(BaseModel):
     script_id: str
@@ -102,12 +106,14 @@ async def cancel_scene(script_id: str, scene_id: str):
         except Exception:
             pass
 
-    # Reset scene status
-    prompt_id = scene.get("prompt_id")
-    updated = store.update_scene(script_id, scene_id, {
-        "status": "draft",
-        "prompt_id": None,
-    })
+    # Reset scene status with lock
+    async with scene_update_lock:
+        prompt_id = scene.get("prompt_id")
+        updated = store.update_scene(script_id, scene_id, {
+            "status": "draft",
+            "prompt_id": None,
+        })
     from routes.scenes import _enrich_scene
     enriched = _enrich_scene(script_id, updated)
     await manager.broadcast({
@@ -165,12 +171,14 @@ async def submit_scene(body: SubmitSceneBody):
     result = await submit_scene_to_comfyui(scene, body.script_id)
 
     if result.get("success"):
         # Register for ComfyUI event routing (roadmap #2)
         manager.index_prompt(result["prompt_id"], body.script_id, body.scene_id)
-        scene = store.update_scene(body.script_id, body.scene_id, {
-            "status": "queued",
-            "prompt_id": result["prompt_id"],
-        })
+        async with scene_update_lock:
+            scene = store.update_scene(body.script_id, body.scene_id, {
+                "status": "queued",
+                "prompt_id": result["prompt_id"],
+            })
         from routes.scenes import _enrich_scene
         await manager.broadcast({
             "type": "scene_update",
@@ -178,10 +186,12 @@ async def submit_scene(body: SubmitSceneBody):
             "scene": _enrich_scene(body.script_id, scene),
         })
     else:
-        scene = store.update_scene(body.script_id, body.scene_id, {
-            "status": "error",
-            "error": result.get("error", "Unknown error"),
-        })
+        async with scene_update_lock:
+            scene = store.update_scene(body.script_id, body.scene_id, {
+                "status": "error",
+                "error": result.get("error", "Unknown error"),
+            })
         from routes.scenes import _enrich_scene
         await manager.broadcast({
             "type": "scene_update",
@@ -205,10 +215,12 @@ async def submit_all_scenes(body: SubmitAllBody):
         if result.get("success"):
             # Register for ComfyUI event routing (roadmap #2)
             manager.index_prompt(result["prompt_id"], body.script_id, sid)
-            scene = store.update_scene(body.script_id, sid, {
-                "status": "queued",
-                "prompt_id": result["prompt_id"],
-            })
+            async with scene_update_lock:
+                scene = store.update_scene(body.script_id, sid, {
+                    "status": "queued",
+                    "prompt_id": result["prompt_id"],
+                })
             from routes.scenes import _enrich_scene
             await manager.broadcast({
                 "type": "scene_update",
@@ -216,10 +228,12 @@ async def submit_all_scenes(body: SubmitAllBody):
                 "scene": _enrich_scene(body.script_id, scene),
             })
         else:
-            scene = store.update_scene(body.script_id, sid, {
-                "status": "error",
-                "error": result.get("error", "Unknown error"),
-            })
+            async with scene_update_lock:
+                scene = store.update_scene(body.script_id, sid, {
+                    "status": "error",
+                    "error": result.get("error", "Unknown error"),
+                })
             from routes.scenes import _enrich_scene
             await manager.broadcast({
                 "type": "scene_update",
@@ -283,10 +297,12 @@ async def _do_poll(script_id: str) -> dict:
                             if fname.endswith((".mp4", ".webm", ".mov", ".avi", ".mkv")):
                                 break  # Prefer first video file
 
-                # Add new render to renders array
-                new_render_id = uuid.uuid4().hex[:12]
-                new_render_entry = {
-                    "render_id": new_render_id,
-                    "prompt_id": prompt_id,
-                    "video_filename": video_filename or "",
-                    "video_path": video_path or "",
-                    "created": store._now(),
-                    "duration": scene.get("duration", 0),
-                    "render_time_seconds": scene.get("render_elapsed"),
-                }
-                store.add_render_to_scene(script_id, sid, new_render_entry)
-
-                updates = {
-                    "status": "complete",
-                    "video_path": video_path or "",
-                    "video_filename": video_filename or "",
-                    "active_render_id": new_render_id,
-                }
-                scene = store.update_scene(script_id, sid, updates)
+                async with scene_update_lock:
+                    # Add new render to renders array
+                    new_render_id = uuid.uuid4().hex[:12]
+                    new_render_entry = {
+                        "render_id": new_render_id,
+                        "prompt_id": prompt_id,
+                        "video_filename": video_filename or "",
+                        "video_path": video_path or "",
+                        "created": store._now(),
+                        "duration": scene.get("duration", 0),
+                        "render_time_seconds": scene.get("render_elapsed"),
+                    }
+                    store.add_render_to_scene(script_id, sid, new_render_entry)
+
+                    updates = {
+                        "status": "complete",
+                        "video_path": video_path or "",
+                        "video_filename": video_filename or "",
+                        "active_render_id": new_render_id,
+                    }
+                    scene = store.update_scene(script_id, sid, updates)
                 from routes.scenes import _enrich_scene
                 await manager.broadcast({
                     "type": "scene_update",
@@ -294,8 +310,10 @@ async def _do_poll(script_id: str) -> dict:
                     "scene": _enrich_scene(script_id, scene),
                 })
             elif new_status == "rendering":
-                scene = store.update_scene(script_id, sid, {"status": "rendering"})
+                async with scene_update_lock:
+                    scene = store.update_scene(script_id, sid, {"status": "rendering"})
                 # Compute timing data for rendering scene
                 timing = await compute_scene_timing(scene)
                 scene.update(timing)
@@ -303,10 +321,12 @@ async def _do_poll(script_id: str) -> dict:
                     "scene": _enrich_scene(script_id, scene),
                 })
             elif new_status in ("error", "lost"):
                 # Terminal failure states â€” mark error so the scene can be
                 # resubmitted instead of polling forever (pollable-handle contract).
-                scene = store.update_scene(script_id, sid, {
-                    "status": "error",
-                    "error": status_result.get("error", "Render failed"),
-                })
+                async with scene_update_lock:
+                    scene = store.update_scene(script_id, sid, {
+                        "status": "error",
+                        "error": status_result.get("error", "Render failed"),
+                    })
                 from routes.scenes import _enrich_scene
                 await manager.broadcast({
                     "type": "scene_update",
```

**Test:**
```bash
# Start two concurrent poll requests
curl -X POST http://localhost:8000/api/comfyui/poll -H "Content-Type: application/json" -d '{"script_id": "test_script"}' &
curl -X POST http://localhost:8000/api/comfyui/poll -H "Content-Type: application/json" -d '{"script_id": "test_script"}' &
wait
# Expected: No lost updates. Scene states are consistent.
```
