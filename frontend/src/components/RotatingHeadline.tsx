// Rotating landing headline - the director's voice cycles through inviting
// lines (Gui 2026-09-08). Typewriter: types in, holds, DELETES letter by
// letter, then types the next line.
//
// Layout stability + centering: the container's width is measured ONCE from
// the longest line (off-screen measurer) and pinned in px, so NOTHING below
// ever moves. Lines are centered inside that fixed width.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const HEADLINES = [
  "Let\'s write your next movie idea",
  'The more detail you give me, the better the movie',
  'Every great film starts with one scene \u2014 got one?',
  "Pitch me anything \u2014 I\'ll make it cinematic",
  'What are we shooting today?',
  'Your idea + my camera = magic',
  'Got a story stuck in your head? Let it out',
  'From spark to screenplay \u2014 right here',
  "I\'m your director. Give me what you got",
  'Action! What story are we telling?',
]

const TYPE_MS = 28
const DELETE_MS = 14
const HOLD_MS = 5000
const BLINK_MS = 530

type Phase = 'typing' | 'holding' | 'deleting'

export default function RotatingHeadline({ paused = false }: { paused?: boolean }) {
  const [index, setIndex] = useState(0)
  const [count, setCount] = useState(0)
  const [phase, setPhase] = useState<Phase>('typing')
  const [caretOn, setCaretOn] = useState(true)
  const [fixedW, setFixedW] = useState<number | null>(null)
  const measurerRef = useRef<HTMLSpanElement>(null)

  // Measure the longest line once with the same font, pin container width
  useLayoutEffect(() => {
    if (fixedW != null) return
    const el = measurerRef.current
    if (!el) return
    const widths = HEADLINES.map((h) => {
      el.textContent = h
      return el.getBoundingClientRect().width
    })
    setFixedW(Math.ceil(Math.max(...widths)) + 6) // +6: caret width + margin, so a full line + caret never wraps
  }, [fixedW])

  useEffect(() => {
    if (paused) return
    const line = HEADLINES[index]
    let t: ReturnType<typeof setTimeout>
    if (phase === 'typing') {
      if (count < line.length) t = setTimeout(() => setCount((c) => c + 1), TYPE_MS)
      else setPhase('holding')
    } else if (phase === 'holding') {
      t = setTimeout(() => setPhase('deleting'), HOLD_MS)
    } else {
      if (count > 0) t = setTimeout(() => setCount((c) => c - 1), DELETE_MS)
      else {
        setIndex((i) => (i + 1) % HEADLINES.length)
        setPhase('typing')
      }
    }
    return () => clearTimeout(t)
  }, [phase, count, index, paused])

  useEffect(() => {
    const t = setInterval(() => setCaretOn((v) => !v), BLINK_MS)
    return () => clearInterval(t)
  }, [])

  const line = HEADLINES[index]
  const done = phase !== 'typing'

  return (
    <h1
      className="text-3xl font-semibold tracking-tight text-zinc-100 text-center"
      style={fixedW ? { width: fixedW, marginLeft: 'auto', marginRight: 'auto' } : { minHeight: '1.2em' }}
      aria-live="polite"
    >
      {/* hidden measurer: same font styles as the h1 */}
      <span
        ref={measurerRef}
        className="absolute invisible whitespace-nowrap pointer-events-none"
        aria-hidden="true"
      />
      {fixedW != null ? (
        <>
          {line.slice(0, count)}
          <span
            className={`inline-block w-[2px] h-[1em] align-[-0.08em] ml-[2px] bg-emerald-400 ${
              done && !caretOn ? 'opacity-0' : 'opacity-100'
            }`}
          />
        </>
      ) : null}
    </h1>
  )
}
