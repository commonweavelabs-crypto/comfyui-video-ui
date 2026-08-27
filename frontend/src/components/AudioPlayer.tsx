import { useState, useRef, useEffect } from 'react'

interface AudioPlayerProps {
  audioUrl: string | null
  sceneId: string
}

export default function AudioPlayer({ audioUrl, sceneId }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    setPlaying(false)
    setProgress(0)
    setDuration(0)
  }, [audioUrl])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
    } else {
      audio.play()
    }
  }

  const handleTimeUpdate = () => {
    const audio = audioRef.current
    if (!audio) return
    setProgress(audio.currentTime)
    setDuration(audio.duration || 0)
  }

  const formatTime = (s: number) => {
    if (!s || isNaN(s)) return '0:00'
    const mins = Math.floor(s / 60)
    const secs = Math.floor(s % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Generate fake waveform bars (deterministic based on sceneId for consistency)
  const bars = Array.from({ length: 40 }, (_, i) => {
    const seed = sceneId.charCodeAt(0) + i * 7
    return 0.2 + ((seed * 13) % 80) / 100
  })

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0

  if (!audioUrl) {
    return (
      <div className="flex items-center gap-2 h-10 bg-zinc-950 border border-dashed border-zinc-800 rounded-xl px-3">
        {/* CSS-based muted indicator — no emoji */}
        <div className="w-1 h-4 rounded-full bg-zinc-700 flex-shrink-0" />
        <span className="text-xs text-zinc-700">No audio</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2.5 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2">
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        preload="metadata"
      />

      {/* Play button — CSS-based triangle/bars, no emoji */}
      <button
        onClick={togglePlay}
        className="flex-shrink-0 w-7 h-7 rounded-lg bg-brand-600/20 hover:bg-brand-600/30 flex items-center justify-center transition-all"
      >
        {playing ? (
          <div className="flex gap-1">
            <div className="w-1 h-3 bg-brand-400 rounded-sm" />
            <div className="w-1 h-3 bg-brand-400 rounded-sm" />
          </div>
        ) : (
          <div
            className="w-0 h-0 ml-0.5"
            style={{
              borderTop: '5px solid transparent',
              borderBottom: '5px solid transparent',
              borderLeft: '8px solid #818cf8',
            }}
          />
        )}
      </button>

      {/* Waveform */}
      <div className="flex-1 flex items-center gap-[2px] h-6 overflow-hidden">
        {bars.map((h, i) => {
          const active = (i / bars.length) * 100 < progressPercent
          return (
            <div
              key={i}
              className={`flex-1 rounded-full transition-colors ${
                active ? 'bg-brand-400' : 'bg-zinc-700'
              } ${playing && active ? 'wave-bar' : ''}`}
              style={{
                height: `${h * 100}%`,
                animationDelay: `${i * 0.04}s`,
              }}
            />
          )
        })}
      </div>

      {/* Time */}
      <div className="flex-shrink-0 text-[10px] text-zinc-500 font-mono tabular-nums">
        {formatTime(progress)} / {formatTime(duration)}
      </div>
    </div>
  )
}