"""Structured script routes (M5a): LLM formatting, versions, casting.

These are the NEW scripts (distinct from legacy /api/scripts which back the
existing projects/timelines). Prefix: /api/writing (deliberately different
from /api/scripts to avoid any collision during the transition).
"""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import script_store
from context_pack import get_context_pack
from fountain_parser import parse_fountain
from llm_adapter import chat_completion

router = APIRouter(prefix="/api/writing", tags=["writing"])

# data/writing/{script_id}/... — structured scripts live beside legacy ones
from config import DATA_DIR
WRITING_DIR = DATA_DIR / "writing"


class FormatBody(BaseModel):
    """Create a script from an idea / rough text via the LLM."""
    prompt: str
    title: str | None = None


class CreateFromBody(BaseModel):
    """Create a script from already-formatted fountain text (no LLM call)."""
    title: str
    raw_text: str


class UpdateBody(BaseModel):
    title: str | None = None
    raw_text: str | None = None
    reparse: bool = True


class CharacterUpdateBody(BaseModel):
    voice_id: str | None = None
    voice_locked: bool | None = None
    traits: dict | None = None


def _extract_json(text: str) -> dict:
    """Pull the JSON object out of an LLM response (tolerates fences/prose)."""
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    else:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end > start:
            text = text[start:end + 1]
    return json.loads(text)


async def _format_with_llm(prompt: str) -> dict:
    """Call the LLM with the context pack. Returns {title, characters, script}."""
    system = get_context_pack()
    raw = await chat_completion(system, prompt)
    try:
        data = _extract_json(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(502, f"LLM returned unparseable output: {e}")
    if not data.get("script"):
        raise HTTPException(502, "LLM response missing 'script' field")
    return data


def _merge_character_manifest(parsed: dict, manifest: list[dict]) -> None:
    """Merge LLM character traits into parser output by canonical name."""
    by_name = {(c.get("name") or "").upper(): c for c in manifest or []}
    for c in parsed.get("characters", []):
        extra = by_name.get(c["name"])
        if extra:
            c["traits"] = {
                "gender": extra.get("gender", ""),
                "age_band": extra.get("age_band", ""),
                "description": extra.get("description", ""),
            }
            if extra.get("type") == "narrator":
                c["type"] = "narrator"


@router.post("/format")
async def format_script(body: FormatBody):
    """Format an idea/prompt into a structured script via the LLM (no save)."""
    data = await _format_with_llm(body.prompt)
    parsed = parse_fountain(data["script"])
    _merge_character_manifest(parsed, data.get("characters", []))
    return {
        "title": data.get("title", "Untitled"),
        "raw_text": data["script"],
        "lines": parsed["lines"],
        "characters": parsed["characters"],
    }


@router.post("/scripts")
async def create_script(body: dict):
    """Create + save a script. With 'prompt': formats via LLM first.
    With 'raw_text': parses directly (no LLM call)."""
    prompt = body.get("prompt")
    raw_text = body.get("raw_text")
    title = body.get("title")

    if prompt:
        data = await _format_with_llm(prompt)
        raw_text = data["script"]
        title = title or data.get("title", "Untitled")
    elif not raw_text:
        raise HTTPException(400, "Provide either 'prompt' (LLM format) or 'raw_text'")

    parsed = parse_fountain(raw_text)
    _merge_character_manifest(parsed, body.get("characters", []))
    if not title:
        title = f"Script {datetime.now().strftime('%Y-%m-%d %H:%M')}"

    script_id = f"w{uuid.uuid4().hex[:8]}"
    blob = script_store.create_script_version(script_id, title, raw_text, parsed)
    return {"script_id": script_id, **blob}


@router.get("/scripts/{script_id}")
async def get_script(script_id: str, version: int | None = None):
    blob = script_store.get_script_version(script_id, version)
    if not blob:
        raise HTTPException(404, "Script not found")
    return {"script_id": script_id, **blob}


@router.get("/scripts/{script_id}/versions")
async def list_versions(script_id: str):
    return {"versions": script_store.list_script_versions(script_id)}


@router.put("/scripts/{script_id}")
async def update_script(script_id: str, body: UpdateBody):
    """Save an edit — auto-forks to a new version when the current version
    has linked projects (copy-on-write per the blueprint)."""
    if not body.raw_text:
        raise HTTPException(400, "raw_text required")
    parsed = parse_fountain(body.raw_text)
    blob = script_store.update_script_content(script_id, body.title, body.raw_text, parsed)
    return {"script_id": script_id, **blob, "forked": blob.get("version", 1) > 1}


@router.patch("/scripts/{script_id}/versions/{version}/characters/{character_id}")
async def patch_character(script_id: str, version: int, character_id: str,
                          body: CharacterUpdateBody):
    c = script_store.update_character(
        script_id, version, character_id, body.model_dump(exclude_none=True))
    if not c:
        raise HTTPException(404, "Character not found")
    return c


@router.post("/scripts/{script_id}/link-project")
async def link_project_route(script_id: str, body: dict):
    version = body.get("version")
    project_id = body.get("project_id")
    if not version or not project_id:
        raise HTTPException(400, "version and project_id required")
    script_store.link_project(script_id, int(version), project_id)
    return {"success": True}