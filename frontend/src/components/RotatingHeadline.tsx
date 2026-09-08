// Rotating landing headline — the director's voice cycles through inviting
// lines (Gui 2026-09-08: "always inviting the user, always being friendly").
// Fades between lines every 8s; pauses while the user is typing (handled by
// parent via `paused` prop when the composer has text).

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

const ROTATE_MS = 8000

export default function RotatingHeadline({ paused = false }: { paused?: boolean }) {
  const [index, setIndex] = useState(0)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (paused) return
    const t = setInterval(() => {
      setFading(true)
      // Swap text at full transparency, then fade back in
      setTimeout(() => {
        setIndex((i) => (i + 1) % HEADLINES.length)
        setFading(false)
      }, 450)
    }, ROTATE_MS)
    return () => clearInterval(t)
  }, [paused])

  return (
    <h1
      className={`text-3xl font-semibold tracking-tight text-zinc-100 transition-opacity duration-500 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {HEADLINES[index]}
    </h1>
  )
}