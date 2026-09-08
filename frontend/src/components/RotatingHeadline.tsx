// Rotating landing headline — the director's voice cycles through inviting
// lines (Gui 2026-09-08: "always inviting the user, always being friendly").
//
// Animation: typewriter effect — letters appear one by one with a blinking
// terminal caret (Gui: "as if the letters are being typed"). Each line holds
// for a few seconds after typing completes, then the next line types out.
//
// Layout stability (Gui: "the text underneath must not move"): the h1 is
// CSS-grid stacked — all lines render invisibly in the same grid cell so the
// container always sizes to the LONGEST line; only the active line is visible.
// Zero layout shift on rotation, no matter the line lengths.
//
// Pauses while the user is typing (parent passes `paused` from composer state).

import { useEffect, useState } from 'react'

const HEADLINES = [
  "Let's write your next movie idea",
  'The more detail you give me, the better the movie',
  'Every great film starts with one scene — got one?',
  "Pitch me anything — I'll make it cinematic",
  'What are we shooting today?',
  'Your idea + my camera = magic',
  'Got a story stuck in your head? Let it out',
  'From spark to screenplay — right here',
  "I'm your director. Give me what you got",
  'Action! What story are we telling?',
]

const TYPE_MS = 28          // per-character speed (fast, lively)
const HOLD_MS = 3500        // how long a fully-typed line stays
const BLINK_MS = 530        // caret blink cadence (classic terminal ~530ms)

export default function RotatingHeadline({ paused = false }: { paused?: boolean }) {
  const [index, setIndex] = useState(0)
  const [typed, setTyped] = useState(0)
  const [caretOn, setCaretOn] = useState(true)

  // Typing progress for the current line
  useEffect(() => {
    setTyped(0)
    if (paused) return
    const line = HEADLINES[index]
    const t = setInterval(() => {
      setTyped((n) => {
        if (n >= line.length) {
          clearInterval(t)
          return n
        }
        return n + 1
      })
    }, TYPE_MS)
    return () => clearInterval(t)
  }, [index, paused])

  // Advance to the next line after typing completes + hold time
  useEffect(() => {
    if (paused) return
    const line = HEADLINES[index]
    if (typed < line.length) return
    const t = setTimeout(() => setIndex((i) => (i + 1) % HEADLINES.length), HOLD_MS)
    return () => clearTimeout(t)
  }, [typed, index, paused])

  // Caret blink
  useEffect(() => {
    const t = setInterval(() => setCaretOn((v) => !v), BLINK_MS)
    return () => clearInterval(t)
  }, [])

  const line = HEADLINES[index]
  const done = typed >= line.length

  return (
    <h1 className="text-3xl font-semibold tracking-tight text-zinc-100 grid" aria-live="polite">
      {/* Invisible sizers: every line occupies the same grid cell, so the
          container is sized by the longest line and never shifts. */}
      {HEADLINES.map((h, i) => (
        <span key={i} className="invisible col-start-1 row-start-1 whitespace-nowrap" aria-hidden="true">
          {h}
        </span>
      ))}
      {/* Visible typing line */}
      <span className="visible col-start-1 row-start-1 whitespace-nowrap" aria-hidden={false}>
        {line.slice(0, typed)}
        <span
          className={`inline-block w-[2px] h-[1em] align-[-0.08em] ml-[2px] bg-emerald-400 ${
            done && !caretOn ? 'opacity-0' : 'opacity-100'
          }`}
        />
      </span>
    </h1>
  )
}