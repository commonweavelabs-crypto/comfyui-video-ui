#!/usr/bin/env python3
"""
ComfyUI Video Workflow UI — FastAPI Backend
Runs on port 8503. Serves the React frontend + REST API + WebSocket.

Usage:
    python main.py
"""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from config import FRONTEND_DIST, HOST, PORT
from ws_manager import manager

# ── Lifespan (startup/shutdown) ────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start WebSocket polling on startup
    await manager.start_polling()
    yield
    # Cleanup
    await manager.stop_polling()


# ── App ────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="ComfyUI Video Workflow UI",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow the React dev server and network access
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8502",
        "http://127.0.0.1:8502",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8503",
        "http://127.0.0.1:8503",
        "http://192.168.12.126:8502",
        "http://100.119.226.51:8502",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register routes ────────────────────────────────────────────────────────

from routes import scripts, scenes, comfyui, audio, frames, videos  # noqa: E402
from routes import broll, music, export  # noqa: E402
from routes import disk_usage, writing  # noqa: E402

app.include_router(scripts.router)
app.include_router(scenes.router)
app.include_router(comfyui.router)
app.include_router(audio.router)
app.include_router(frames.router)
app.include_router(videos.router)
app.include_router(broll.router)
app.include_router(music.router)
app.include_router(export.router)
app.include_router(disk_usage.router)
app.include_router(writing.router)


# ── Pipeline route (F2 — script → scene breakdown) ────────────────────────

from fastapi import APIRouter, HTTPException  # noqa: E402
from pydantic import BaseModel  # noqa: E402
from pipeline import run_pipeline_for_script  # noqa: E402

pipeline_router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])


class PipelineBody(BaseModel):
    script_id: str


@pipeline_router.post("/run")
async def run_pipeline(body: PipelineBody):
    """Run the full LTX pipeline for a script (scene breakdown, audio, prompts)."""
    import store
    if not store.get_script(body.script_id):
        raise HTTPException(404, "Script not found")

    async def progress_cb(msg):
        await manager.broadcast({"type": "pipeline_progress", **msg})

    result = await run_pipeline_for_script(body.script_id, progress_callback=progress_cb)
    return result


app.include_router(pipeline_router)


# ── WebSocket endpoint ─────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        # Send initial state
        from pipeline import check_comfyui_health
        health = await check_comfyui_health()
        await manager.send_to(ws, {"type": "connected", "health": health})

        while True:
            # Keep connection alive; client can send commands
            data = await ws.receive_text()
            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                continue

            cmd = msg.get("command")
            if cmd == "ping":
                await manager.send_to(ws, {"type": "pong"})
            elif cmd == "check_scene":
                script_id = msg.get("script_id")
                scene_id = msg.get("scene_id")
                prompt_id = msg.get("prompt_id")
                if prompt_id:
                    from pipeline import check_prompt_status
                    status = await check_prompt_status(prompt_id)
                    await manager.send_to(ws, {
                        "type": "scene_status",
                        "script_id": script_id,
                        "scene_id": scene_id,
                        **status,
                    })

    except WebSocketDisconnect:
        manager.disconnect(ws)


# ── Serve React frontend (static files) ───────────────────────────────────

if FRONTEND_DIST.exists():
    # Serve static assets (JS, CSS, images)
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    # SPA fallback — serve index.html for any non-API route
    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        # Don't intercept API or WebSocket routes
        if full_path.startswith("api/") or full_path.startswith("ws"):
            raise HTTPException(404, "Not found")
        # Check for a specific file (e.g., favicon.ico, manifest.json)
        file_path = FRONTEND_DIST / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        # Fallback to index.html for SPA routing
        index = FRONTEND_DIST / "index.html"
        if index.exists():
            return FileResponse(str(index))
        raise HTTPException(404, "Frontend not built. Run: cd frontend && npm run build")
else:
    @app.get("/")
    async def root():
        return JSONResponse({
            "message": "ComfyUI Video Workflow UI Backend",
            "status": "running",
            "frontend": "not built — run: cd frontend && npm run build",
            "api_docs": "/docs",
        })


# ── Entry point ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    print(f"""
╔══════════════════════════════════════════════════════════╗
║  ComfyUI Video Workflow UI — Backend                     ║
║  Port: {PORT}  │  ComfyUI: localhost:8000              ║
║  API docs: http://localhost:{PORT}/docs                  ║
╚══════════════════════════════════════════════════════════╝
""")
    uvicorn.run(
        "main:app",
        host=HOST,
        port=PORT,
        reload=False,
        log_level="info",
    )