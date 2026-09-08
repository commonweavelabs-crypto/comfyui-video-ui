"""LLM adapter for script formatting (M5a).

Providers:
  - OpenAI-compatible HTTP endpoint (default): GLM 5.3 Flash, OpenRouter,
    OpenAI, LM Studio — anything speaking /chat/completions.
  - Ollama (local fallback).

The intelligence lives in the CONTEXT PACK (the system prompt we send);
the provider is swappable. The prompt itself lives in the frontend flow and
routes layer — this module is transport only.

API key resolution order:
  1. Environment variable named by `api_key_env` (default ZAI_API_KEY)
  2. data/llm_config.json -> {"api_key": "..."} (never committed to git)
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import httpx

from config import PROJECT_ROOT

_LLM_CONFIG_PATH = PROJECT_ROOT / "data" / "llm_config.json"

_DEFAULTS = {
    "provider": "openai-compatible",   # "openai-compatible" | "ollama"
    "model": "glm-5.3-flash",
    "base_url": "https://api.z.ai/api/paas/v4",
    "api_key_env": "ZAI_API_KEY",
    "temperature": 0.4,
    "ollama_url": "http://127.0.0.1:11434",
    "ollama_model": "glm-5.3-flash:cloud",
}


def _load_llm_config() -> dict:
    """Merged config: defaults <- llm_config.json."""
    cfg = dict(_DEFAULTS)
    if _LLM_CONFIG_PATH.exists():
        try:
            cfg.update(json.loads(_LLM_CONFIG_PATH.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            pass
    return cfg


def _resolve_api_key(cfg: dict) -> str | None:
    env_name = cfg.get("api_key_env") or "ZAI_API_KEY"
    key = os.environ.get(env_name, "")
    if key:
        return key
    if _LLM_CONFIG_PATH.exists():
        try:
            data = json.loads(_LLM_CONFIG_PATH.read_text(encoding="utf-8"))
            key = data.get("api_key", "")
            if key:
                return key
        except (OSError, json.JSONDecodeError):
            pass
    return None


async def chat_completion(system: str, user: str, max_tokens: int = 8000) -> str:
    """Send a chat completion via the configured provider. Raises on failure."""
    cfg = _load_llm_config()
    if cfg.get("provider") == "ollama":
        return await _ollama_completion(cfg, system, user)
    return await _openai_compatible_completion(cfg, system, user, max_tokens)


async def _ollama_completion(cfg: dict, system: str, user: str) -> str:
    url = cfg["ollama_url"].rstrip("/") + "/api/chat"
    payload = {
        "model": cfg.get("ollama_model", "glm-5.3-flash:cloud"),
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "stream": False,
        # num_predict CAP IS CRITICAL: without it a confused small model can
        # generate forever (observed: 77K tokens over 10 minutes until timeout).
        # 8000 tokens is ~2x the largest expected script.
        "options": {
            "temperature": cfg.get("temperature", 0.4),
            "num_predict": 8000,
        },
    }
    async with httpx.AsyncClient(timeout=600) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
    return data.get("message", {}).get("content", "")


async def _openai_compatible_completion(cfg: dict, system: str, user: str,
                                        max_tokens: int = 8000) -> str:
    api_key = _resolve_api_key(cfg)
    if not api_key:
        raise RuntimeError(
            f"No API key found. Set the {cfg.get('api_key_env', 'ZAI_API_KEY')} "
            f"environment variable or put {{\"api_key\": \"...\"}} in "
            f"data/llm_config.json."
        )
    base = cfg["base_url"].rstrip("/")
    url = f"{base}/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}"}
    payload = {
        "model": cfg.get("model", "glm-5.3-flash"),
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": cfg.get("temperature", 0.4),
        "max_tokens": max_tokens,
    }
    async with httpx.AsyncClient(timeout=600) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
    return data["choices"][0]["message"]["content"]