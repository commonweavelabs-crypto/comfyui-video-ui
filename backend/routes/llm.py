"""LLM provider detection + config API (M-E step 1: local-first onboarding).

Detects local OpenAI-compatible providers so the UI can offer a one-click
connect instead of a dead-end error. Nothing here requires a harness —
every provider below speaks plain /v1/chat/completions or /api/chat.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import llm_adapter

router = APIRouter(prefix="/api/llm", tags=["llm"])

# Probe list: local providers first (zero-config), then cloud env keys.
# Each probe: name, kind, base_url, model-listing endpoint.
_LOCAL_PROBES = [
    {"id": "ollama", "label": "Ollama", "url": "http://127.0.0.1:11434"},
    {"id": "lmstudio", "label": "LM Studio", "url": "http://127.0.0.1:1234"},
    {"id": "llamacpp", "label": "llama.cpp server", "url": "http://127.0.0.1:8080"},
    {"id": "jan", "label": "Jan", "url": "http://127.0.0.1:1337"},
]

_CLOUD_ENV_KEYS = [
    {"id": "zai", "label": "GLM (Z.ai)", "env": "ZAI_API_KEY", "base_url": "https://api.z.ai/api/paas/v4", "model": "glm-5.3-flash"},
    {"id": "openai", "label": "OpenAI", "env": "OPENAI_API_KEY", "base_url": "https://api.openai.com/v1", "model": "gpt-4o-mini"},
    {"id": "openrouter", "label": "OpenRouter", "env": "OPENROUTER_API_KEY", "base_url": "https://openrouter.ai/api/v1", "model": "openrouter/auto"},
]


async def _probe_local(client: httpx.AsyncClient, url: str) -> list[dict]:
    """Return models offered by a local provider at url, [] if unreachable."""
    # Ollama uses /api/tags; OpenAI-compatible servers use /v1/models.
    for path, pick in (
        ("/v1/models", lambda d: [
            {"id": m.get("id", ""), "label": m.get("id", "")} for m in d.get("data", [])
        ]),
        ("/api/tags", lambda d: [
            {"id": m.get("name", ""), "label": m.get("name", "")} for m in d.get("models", [])
        ]),
    ):
        try:
            resp = await client.get(url + path, timeout=2.5)
            if resp.status_code == 200:
                models = pick(resp.json())
                if models:
                    return models
        except (httpx.HTTPError, ValueError):
            continue
    return []


@router.get("/providers")
async def list_providers():
    """Detect available LLM providers + their models for the connect screen."""
    providers: list[dict] = []
    async with httpx.AsyncClient() as client:
        for probe in _LOCAL_PROBES:
            models = await _probe_local(client, probe["url"])
            if models:
                providers.append({
                    "id": probe["id"],
                    "label": probe["label"],
                    "kind": "local",
                    "url": probe["url"],
                    "models": models,
                })
        for cloud in _CLOUD_ENV_KEYS:
            if os.environ.get(cloud["env"]):
                providers.append({
                    "id": cloud["id"],
                    "label": cloud["label"],
                    "kind": "cloud",
                    "models": [{"id": cloud["model"], "label": cloud["model"]}],
                })
    current = _current_summary()
    return {"providers": providers, "current": current}


def _current_summary() -> dict | None:
    cfg = llm_adapter._load_llm_config()
    if cfg.get("provider") == "ollama":
        return {"provider": "ollama", "model": cfg.get("ollama_model"), "url": cfg.get("ollama_url")}
    if llm_adapter._resolve_api_key(cfg):
        return {"provider": "openai-compatible", "model": cfg.get("model"), "url": cfg.get("base_url")}
    return None


class ConnectBody(BaseModel):
    provider_id: str          # ollama | lmstudio | llamacpp | jan | zai | openai | openrouter | custom
    model: str
    base_url: str | None = None
    api_key: str | None = None


@router.post("/connect")
async def connect_provider(body: ConnectBody):
    """Save the chosen provider to data/llm_config.json (never committed)."""
    local = {p["id"]: p for p in _LOCAL_PROBES}
    cloud = {c["id"]: c for c in _CLOUD_ENV_KEYS}

    cfg: dict
    if body.provider_id in local:
        cfg = {
            "provider": "openai-compatible",
            "base_url": (body.base_url or local[body.provider_id]["url"]) + "/v1",
            "model": body.model,
            # Local servers need no key, but httpx must send SOMETHING for
            # providers that 401 on missing auth header; empty Bearer is fine.
            "api_key_env": "",
        }
        # Ollama keeps its native /api/chat path (streaming + options support)
        if body.provider_id == "ollama" and not body.base_url:
            cfg = {
                "provider": "ollama",
                "ollama_url": local["ollama"]["url"],
                "ollama_model": body.model,
            }
    elif body.provider_id in cloud:
        cfg = {
            "provider": "openai-compatible",
            "base_url": cloud[body.provider_id]["base_url"],
            "model": body.model,
            "api_key_env": cloud[body.provider_id]["env"],
        }
        if body.api_key:
            cfg["api_key"] = body.api_key
    else:
        # Custom endpoint (any OpenAI-compatible URL)
        if not body.base_url:
            raise HTTPException(400, "base_url required for custom provider")
        cfg = {
            "provider": "openai-compatible",
            "base_url": body.base_url.rstrip("/"),
            "model": body.model,
            "api_key_env": "",
        }
        if body.api_key:
            cfg["api_key"] = body.api_key

    path = llm_adapter._LLM_CONFIG_PATH
    existing = {}
    if path.exists():
        try:
            existing = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            pass
    # Preserve an existing api_key if the new config doesn't carry one
    if "api_key" not in cfg and "api_key" in existing:
        cfg["api_key"] = existing["api_key"]
    path.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    return {"ok": True, "current": _current_summary()}


@router.get("/status")
async def llm_status():
    """Lightweight reachability check for the Settings → AI panel."""
    current = _current_summary()
    if not current:
        return {"connected": False, "reason": "No LLM provider configured"}
    try:
        text = await llm_adapter.chat_completion(
            "Reply with exactly: PONG", "ping", max_tokens=5,
        )
        return {"connected": bool(text.strip()), "model": current.get("model"), "reply": text.strip()[:20]}
    except Exception as e:
        return {"connected": False, "model": current.get("model"), "reason": str(e)[:200]}