# Nexus Skill Extraction -> Director engine design
_Source: Pj Accetturo's "The Nexus Skill" (full doc archived: link-archive
gdoc-20260923-nexus-skill-pjaccetturo; security-scanned CLEAN). Credit: Pj
Accetturo (@pjacefilms), shared by Pj via comment-DM. Newsletter:
pjace.beehiiv.com. We build OUR OWN version from his ideas - the original
skill remains his. Companion to docs/AI-FILM-CRAFT-RULES.md._

## Quality rating: 9/10
The most complete open AI-film prompting system we've seen. It's not tips -
it's an entire production grammar: identity blocks, staging law, lens table,
physics, performance beats, self-QA. Directly adoptable as Director rules.

## What Pj's system does (the full architecture)
1. **Five hard rules:** exact scene count (count before + after); 4,000-char
   hard ceiling per scene prompt, TOOL-VERIFIED; no em dashes; restate staging
   in EVERY cut (who is left/right, relative scale, distance to landmark);
   deliver-only (no commentary, max one clarifying question)
2. **@TAG reference blocks:** physical anchor + psychological engine (one
   clause) + vocal profile + signature tic + trigger/crack-in-the-mask + eye
   life + SCOPE TAG ("Character appearance only." / "Prop only." etc). If an
   image reference exists: "Already image referenced. Voice only." - spend
   budget on action, not re-description
3. **Staging law:** intimate human moment + ONE specific world detail (never
   paragraph worldbuilding; generic = reads as film set)
4. **Spatial blocking lock:** measurable distances ("within 1 meter, hand on
   the door handle"), never near/beside/nearby; body direction and GAZE
   direction are separate axes, both written
5. **Lens by observable outcome** (not mm/f-stop): 84deg wide intimate / 47deg
   documentary / 29deg medium portrait / 18deg tight close-up / 107deg
   environmental / 8deg distant observation. Lock lens per shot; hard cuts
   between lens characters, never drift
6. **Lighting = priority constraint** (backlit: subject between camera and
   bright bg; no flat frontal key; no beauty fill)
7. **Physics lock:** gravity, mass, inertia, weight transfer; cloth and hair
   lag; liquids cling/drip/pool
8. **Cut list grammar:** `CUT - [shot type] [@ref] [frame position], [speed] -
   [action with staging restated] - [off-frame consequence]`; 3-5 cuts/scene,
   ~800 chars per cut (never <400); cut ends when the moment is complete
9. **Performance = objective vs obstacle:** never emotion labels; reactions
   begin BEFORE the partner's line ends; beat changes show in body (pause,
   posture, tempo, gaze); hands get physical tasks, and STOPPING the task is
   the beat accent; eye life mandatory (saccades, blink-by-state, catchlights)
10. **Voice line fixed verbatim** per character (one line, quoted, never
    rewritten per scene); sound design physical + scene-specific, never musical
11. **Feedback shorthand:** plain-language complaints map to concrete fixes
    ("too floaty" -> physics lock; "eyes dead" -> eye life; "statue/knight" ->
    remove mask-language from face coverings)
12. **Silent self-QA** before output: tags active, first frame complete, gaze +
    body clear, lens locked, lighting not flat, beats visible, char count, no
    em dashes

## OUR version - what maps to the comfyui-video-ui Director
- **Director system prompt** = Pj's architecture adapted to our video models
  (Wan/LTX/etc), NOT his word-for-word text: our 5 hard rules, our @TAG schema
  matching OUR reference-image system, our cut grammar emitting OUR UI's
  shot objects (not raw text prompts)
- **Adopt as-is (ideas):** exact-count rule; char ceiling w/ tool-verify; no
  em dashes; staging restated per cut; measurable distances; gaze/body
  separate; lens-by-outcome table; physics lock; objective-vs-obstacle
  performance; eye life; voice-verbatim; physical sound design; silent self-QA
- **Adapt:** 4,000-char ceiling -> OUR models' prompt limits (per-model config);
  cut counts -> our shot-length economics; feedback shorthand -> OUR error
  taxonomy from real ComfyUI outputs (M-C testing builds this)
- **Skip:** Dreamina/Seedance-specific assumptions; his exact output format
- **Emotion engine tie-in (Rule 1 of AI-FILM-CRAFT-RULES.md):** Pj's
  "objective vs obstacle" IS the emotion engine's deeper grammar - emotion
  labels never appear; the Director translates emotion -> objective + tactic +
  visible beat change
- **Character sheets tie-in:** his @TAG blocks + "Already image referenced.
  Voice only." = exactly our per-story-state character sheets (Rule 2); scope
  tags solve reference-mixing (a prop ref never bleeds into a face)
- **Scale locks tie-in:** his "relative scale in every cut + measurable
  distances" = the scale-lock rule (Rule 3) formalized
