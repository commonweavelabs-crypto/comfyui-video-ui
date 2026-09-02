"""Fountain-subset parser for the ComfyUI Video Workflow UI.

Parses screenplay-style plain text into structured lines (M5a blueprint):

    INT. LIVING ROOM - NIGHT     -> heading   (scene boundary)
    Angela grabs his arm.        -> direction (NOT spoken; prompt seed)
    JAMES                        -> character cue (spoken, cast a voice)
    (angry)                      -> parenthetical (acting hint)
    Don't hold my arm.           -> dialogue

NARRATOR is treated as a character (type "narrator"). Character identity is
resolved case-insensitively with extensions like (V.O.) / (CONT'D) stripped,
so "ANGELA" / "Angela" / "ANGELA (V.O.)" map to one character.
"""

from __future__ import annotations

import re
import uuid

_HEADING_RE = re.compile(r"^(INT\.|EXT\.|INT/EXT\.|I/E\.|EST\.)", re.IGNORECASE)
_CUE_RE = re.compile(r"^(FADE IN|FADE OUT|CUT TO|DISSOLVE TO|SMASH CUT|THE END)\b", re.IGNORECASE)
_CHAR_RE = re.compile(r"^[A-Z][A-Z0-9 '._\-]{0,40}$")
_EXT_RE = re.compile(r"\s*\((V\.O\.|O\.S\.|CONT'D|CONT\.)\)\s*$", re.IGNORECASE)
_PAREN_RE = re.compile(r"^\(.*\)$")


def _normalize_name(raw: str) -> str:
    """Strip (V.O.)/(CONT'D) extensions and collapse whitespace."""
    return re.sub(r"\s+", " ", _EXT_RE.sub("", raw)).strip()


def _canonical_name(raw: str) -> str:
    return _normalize_name(raw).upper() or "UNKNOWN"


def parse_fountain(text: str) -> dict:
    """Parse fountain text into structured lines + character manifest.

    Returns:
        {
          "lines": [{seq, type, character_id, text}],
          "characters": [{id, name, aliases, type, traits}],
        }
    Line types: heading | direction | character | dialogue | parenthetical
    """
    raw_lines = [ln.rstrip() for ln in text.splitlines()]
    n = len(raw_lines)

    lines_out: list[dict] = []
    char_ids: dict[str, str] = {}      # NORMALIZED NAME -> character id
    characters: list[dict] = []
    current_char: str | None = None    # raw name of the cue in play (or None)

    def get_char_id(raw_name: str) -> str:
        canonical = _canonical_name(raw_name)
        if canonical not in char_ids:
            cid = uuid.uuid4().hex[:8]
            char_ids[canonical] = cid
            characters.append({
                "id": cid,
                "name": canonical,
                "aliases": [],
                "type": "narrator" if canonical == "NARRATOR" else "character",
                "traits": {},
            })
        return char_ids[canonical]

    def char_id_for_current() -> str | None:
        if current_char is None:
            return None
        return char_ids.get(_canonical_name(current_char))

    for i, raw in enumerate(raw_lines):
        stripped = raw.strip()
        if not stripped:
            current_char = None  # blank line ends a speech block
            continue

        # 1) Scene heading — always a heading, never a character
        if _HEADING_RE.match(stripped):
            lines_out.append({"seq": len(lines_out), "type": "heading",
                              "character_id": None, "text": stripped})
            current_char = None
            continue

        # 2) Transitions (FADE OUT, CUT TO...) — direction
        if _CUE_RE.match(stripped):
            lines_out.append({"seq": len(lines_out), "type": "direction",
                              "character_id": None, "text": stripped})
            current_char = None
            continue

        # 3) Character cue: ALL-CAPS line, optionally with (V.O.)/(CONT'D)
        #    extension, that is followed by at least one non-blank line.
        core = _EXT_RE.sub("", stripped).strip()
        is_char_cue = (
            bool(_CHAR_RE.match(core))
            and core == core.upper()
            and any(ch.isalpha() for ch in core)
            and not stripped.endswith((".", "!", "?", ","))
            and (i + 1 < n and raw_lines[i + 1].strip())  # next line non-blank
        )
        if is_char_cue:
            current_char = stripped
            lines_out.append({"seq": len(lines_out), "type": "character",
                              "character_id": get_char_id(stripped),
                              "text": _canonical_name(stripped)})
            continue

        # 4) Inside a speech block: parentheticals and dialogue
        if current_char is not None:
            if _PAREN_RE.match(stripped):
                lines_out.append({"seq": len(lines_out), "type": "parenthetical",
                                  "character_id": char_id_for_current(),
                                  "text": stripped})
                continue
            lines_out.append({"seq": len(lines_out), "type": "dialogue",
                              "character_id": char_id_for_current(),
                              "text": stripped})
            continue

        # 5) Default: direction (action / environment / camera)
        lines_out.append({"seq": len(lines_out), "type": "direction",
                          "character_id": None, "text": stripped})

    return {"lines": lines_out, "characters": characters}