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
import llm_adapter
from config import PROJECT_ROOT
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
    try:
        raw = await chat_completion(system, prompt)
    except HTTPException:
        raise
    except Exception as e:
        # Unreachable/unconfigured LLM -> 502 so the UI opens the connect
        # modal (M-E) instead of a dead-end 500.
        raise HTTPException(502, f"The LLM could not be reached: {e}") from e
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


def _log_llm_request(source: str, prompt: str, response: dict | str | None, error: str | None = None, elapsed_s: float = 0.0) -> None:
    """Append a request log line to data/llm_logs/YYYY-MM-DD.jsonl (testing aid:
    lets us see exactly what the user asked and what the model replied)."""
    from datetime import datetime, timezone
    try:
        log_dir = PROJECT_ROOT / "data" / "llm_logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "source": source,
            "model": llm_adapter._load_llm_config().get("ollama_model") or llm_adapter._load_llm_config().get("model"),
            "elapsed_s": round(elapsed_s, 2),
            "prompt": (prompt or "")[:2000],
            "response": (json.dumps(response, ensure_ascii=False)[:3000] if response else None),
            "error": (error or "")[:500],
        }
        with open(log_dir / f"{datetime.now(timezone.utc).date()}.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except OSError:
        pass  # logging must never break the pipeline


@router.post("/format")
async def format_script(body: FormatBody):
    """Format an idea/prompt into a structured script via the LLM (no save)."""
    import time
    t0 = time.monotonic()
    try:
        data = await _format_with_llm(body.prompt)
    except HTTPException as e:
        _log_llm_request("format", body.prompt, None, error=e.detail, elapsed_s=time.monotonic() - t0)
        raise
    parsed = parse_fountain(data["script"])
    _merge_character_manifest(parsed, data.get("characters", []))
    _log_llm_request("format", body.prompt, {"title": data.get("title"), "script": data["script"]}, elapsed_s=time.monotonic() - t0)
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


# ── Voice casting (M5a-6) ─────────────────────────────────────────────────

import sys

from config import AUDIO_DIR

AUDIO_PREVIEW_DIR = AUDIO_DIR / "previews"


def _load_voices_catalog() -> list[dict]:
    from config import SCRIPTS_CATALOG_PATH
    voices_path = SCRIPTS_CATALOG_PATH.parent / "voices_catalog.json"
    if not voices_path.exists():
        return []
    try:
        data = json.loads(voices_path.read_text(encoding="utf-8"))
        return data.get("voices", data) if isinstance(data, dict) else data
    except (OSError, json.JSONDecodeError):
        return []


def _score_voice(character: dict, voice: dict, used_voice_ids: set[str]) -> int:
    """Score a catalog voice for a character: gender match +2, age overlap
    +1, unused +3, design voices preferred over personal clones +1.
    Higher is better."""
    traits = character.get("traits") or {}
    want_g = (traits.get("gender") or "").lower()
    # Common-name heuristic when the LLM didn't provide a gender
    if not want_g:
        want_g = _GENDER_BY_NAME.get((character.get("name") or "").split()[0].upper(), "")
    want_a = (traits.get("age_band") or "").lower()
    vt = voice.get("traits", {}) or {}
    s = 0
    vg = (vt.get("gender") or "").lower()
    va = (vt.get("age_band") or "").lower()
    if want_g and vg[:3] == want_g[:3]:
        s += 2
    if want_a and want_a[:3] in va:
        s += 1
    if voice.get("voice_id") not in used_voice_ids:
        s += 3
    # Prefer designed voices over clones of specific real people for
    # fictional characters (clones are for their named person / user choice)
    if not str(voice.get("voice_id", "")).startswith("clone-"):
        s += 1
    return s


# Minimal common first-name gender map (autocast heuristic only — the
# settings doc view and LLM manifest remain the source of truth)
_GENDER_BY_NAME = {
    "JAMES": "male", "JOHN": "male", "MICHAEL": "male", "DAVID": "male",
    "PETER": "male", "MARCUS": "male", "KAI": "male", "ROBERT": "male",
    "THOMAS": "male", "DANIEL": "male", "MARK": "male", "PAUL": "male",
    "STEVE": "male", "CHARLES": "male", "LUKE": "male", "MAX": "male",
    "ANGELA": "female", "MARY": "female", "SARAH": "female", "MAYA": "female",
    "ELEANOR": "female", "SOFIA": "female", "RUTH": "female", "ANNA": "female",
    "EMMA": "female", "LISA": "female", "MARIA": "female", "LINDA": "female",
    "NARRATOR": "",  # narrator takes any voice
}


def _auto_assign_voice(character: dict, used_voice_ids: set[str]) -> str | None:
    """Pick the best unused voice for a character by gender/age traits."""
    catalog = _load_voices_catalog()
    if not catalog:
        return None
    best = max(catalog, key=lambda v: _score_voice(character, v, used_voice_ids), default=None)
    return best.get("voice_id") if best else None


@router.post("/scripts/{script_id}/versions/{version}/autocast")
async def auto_cast(script_id: str, version: int):
    """Auto-assign a voice to every unassigned character (by traits)."""
    blob = script_store.get_script_version(script_id, version)
    if not blob:
        raise HTTPException(404, "Script not found")
    catalog = _load_voices_catalog()
    if not catalog:
        raise HTTPException(503, "Voice catalog not found")

    used = {c["voice_id"] for c in blob.get("characters", []) if c.get("voice_id")}
    assigned = []
    for c in blob.get("characters", []):
        if c.get("voice_id") and c.get("voice_locked"):
            used.add(c["voice_id"])
            continue
        best = max(catalog, key=lambda v: _score_voice(c, v, used), default=None)
        if best:
            script_store.update_character(script_id, version, c["id"], {"voice_id": best["voice_id"]})
            used.add(best["voice_id"])
            assigned.append({"character_id": c["id"], "name": c["name"], "voice_id": best["voice_id"]})
    return {"success": True, "assignments": assigned}


class PreviewBody(BaseModel):
    text: str
    voice_id: str | None = None
    character_name: str = ""


@router.post("/voice-preview")
async def voice_preview(body: PreviewBody):
    """Generate a short preview of a voice speaking the given text via VoxCPM2."""
    catalog = _load_voices_catalog()
    voice = next((v for v in catalog if v.get("voice_id") == body.voice_id), None)
    if not voice:
        raise HTTPException(404, "Voice not found in catalog")
    control = (voice.get("control_prompts") or ["clear measured speaking voice"])[0]

    import subprocess
    import tempfile
    out_name = f"preview_{uuid.uuid4().hex[:8]}.mp3"
    out_path = AUDIO_PREVIEW_DIR / out_name
    out_path.parent.mkdir(parents=True, exist_ok=True)

    text = body.text.strip() or f"Hello, I am the voice of {body.character_name or 'this character'}."
    text = text[:300]  # keep previews short

    try:
        result = subprocess.run(
            [sys.executable, "-m", "voxcpm", "design",
             "--text", text, "--control", control,
             "--cfg-value", "2.0", "--inference-timesteps", "10",
             "--output", str(out_path)],
            capture_output=True, text=True, timeout=300,
        )
        if result.returncode != 0 or not out_path.exists():
            raise RuntimeError((result.stderr or result.stdout or "VoxCPM failed")[-400:])
        return {"success": True, "preview_url": f"/api/writing/previews/{out_name}"}
    except subprocess.TimeoutExpired:
        raise HTTPException(504, "Voice preview timed out (300s)")
    except FileNotFoundError:
        raise HTTPException(503, "VoxCPM not available — install with: pip install voxcpm")


@router.get("/previews/{filename}")
async def serve_preview(filename: str):
    """Serve a generated voice preview file."""
    from fastapi.responses import FileResponse
    path = AUDIO_PREVIEW_DIR / filename
    if not path.exists():
        raise HTTPException(404, "Preview not found")
    return FileResponse(str(path), media_type="audio/mpeg")