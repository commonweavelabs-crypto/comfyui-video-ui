# Emotion Engine + Environment (Physical) Engine - blueprint v0.1
_Drafted 2026-09-23 from: Pj Accetturo's Nexus Skill (credited, archived),
AI-FILM-CRAFT-RULES.md (behavior-not-emotion / state sheets / scale locks),
and Gui's environment-physics insight (wind/fog/hair/leaves must be PROMPTED
or they freeze). Status: BLUEPRINT - to be implemented in the Director._

## Part 1 - EMOTION ENGINE (dialogue-free, behavior-first)

**Input:** the script's emotional intent ("she's afraid").

**Layer E1 - Objective translation (from Pj):** emotion -> what the character
WANTS in this beat, against what obstacle. Emotion labels never reach the prompt.
  schema: {emotion: afraid, objective: reach the door unseen, obstacle:
  creaky floor between her and the door, tactic: move between creaks}

**Layer E2 - Emotion->behavior mapping table (the original emotion engine):
  lookup table emotion -> 3 observable behaviors + 1 suppression tell.
  Example: fear -> {eyes dart to exits; breathing shallow, audible; grip
  tightens on prop} + {covers it with stillness}. The suppression tell is the
  pro move: real people mask emotions; two-layer behavior (surface vs leak).

**Layer E3 - Beat grammar (from Pj):** every beat change must SHOW: pause,
  posture change, tempo shift, gaze change. Reactions begin before the
  partner's line ends. Hands get a physical task; stopping the task = accent.
**Layer E4 - Eye life (mandatory):** micro-saccades; blink rate/quality tied
  to state; catchlights; eyes reach target one beat before the head turns.

**Layer E5 - Leakage ladder (intensity control):** the Director states HOW
  visible the emotion is: fully contained / leaking (one behavior escapes) /
  breaking point (behavior takes over). Same emotion, three intensities,
  three different prompts.

## Part 2 - ENVIRONMENT (PHYSICAL) ENGINE (Gui's insight, formalized)

**The law: NOTHING in frame is static unless prompted.** Air, light, cloth,
hair, water, foliage - each has a default ambient behavior the Director
states explicitly. If the Director doesn't say "the breeze moves it", the
model renders stillness (or worse, random motion).

**The ambient matrix (per scene, Director fills 1 line each):**
- AIR: none / light breeze / steady wind / gusts -> consequences: hair moves,
  cloth billsows, leaves flutter, dust motes, fog drifts
- FOG/MIST: none / ground mist / heavy fog -> drifts, thins, curls at edges;
  light shafts visible through it
- LIGHT: constant / flickering (fire) / passing clouds -> shadow behavior
- WATER: still / rippling / running -> reflections, spray
- CLOTH: drape / sway (matches AIR line)
- HAIR: matches AIR line (the character's hair reacts to the scene's air)
- CROWD/BG LIFE: none / ambient pedestrians / birds
**Composition rule:** ambient behavior goes in ONE compact line per element,
not a paragraph; and it must be CAUSAL: "the light breeze moves her hair and
the fog drifts slowly past the doorway" - one cause, several effects.

**Physics lock (from Pj, extended):** gravity, mass, inertia, weight
transfer, cloth/hair lag, liquids cling-drip-pool. Extended with Gui's law:
ambient motion is not decoration - it is part of staging (fog hides a
movement; wind reveals shape under cloth).

## Part 3 - HOW THE DIRECTOR USES BOTH (per scene, in order)
1. read script beat -> E1 (objective/obstacle/tactic) -> E2 behaviors ->
   E5 intensity -> E4 eye life
2. fill ambient matrix (1 line per present element, causal phrasing)
3. restate staging (Pj rule 4) + relative scale + measurable distances
4. emit cuts: behavior + ambient motion in every cut that contains them
5. silent self-QA: emotion labels absent? eye life present? ambient matrix
   filled? physics respected? char count under ceiling?

## Implementation hooks (comfyui-video-ui)
- Director prompt template: sections EMOTION / AMBIENT / STAGING / CUTS / QA
- Emotion lookup table (E2) ships as editable JSON in the UI (users extend it)
- Ambient matrix = a checklist in the shot editor (one dropdown per element)
- Character sheets (per story state) carry the vocal profile + tic + eye-life
  defaults so every scene inherits them
