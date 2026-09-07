import { useState, useRef, useEffect } from 'react'
import type { Scene } from '../types'
import { STATUS_META } from '../types'
import { videosApi, audioApi, type VoiceOption } from '../api'
import AudioPlayer from './AudioPlayer'

// Voice options — fetched from the voice catalog on mount
let _cachedVoices: VoiceOption[] | null = null

/** Format seconds into a human-readable time string: "6m", "45s", "12m30s" */
function formatTimeRemaining(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  if (s === 0) return `${m}m`
  return `${m}m${s}s`
}

interface SceneCardProps {
  scene: Scene
  scriptId: string
  onPromptChange: (sceneId: string, prompt: string) => void
  onDurationChange: (sceneId: string, duration: number) => void
  onRenderOverrideChange: (sceneId: string, field: 'width' | 'height' | 'fps', value: number | null) => void
  onSubmit: (sceneId: string) => void
  onDelete: (sceneId: string) => void
  onFrameUpload: (sceneId: string, file: File) => void
  onFrameAssign: (frame: any, sceneId: string) => void
  onAudioUpload: (sceneId: string, file: File) => void
  onGenerateAudio: (sceneId: string, voiceId?: string) => void
  onFeedback: (sceneId: string, feedback: string) => void
  onRerender: (sceneId: string) => void
  onCancelRender: (sceneId: string) => void
  onBrollUpload: (sceneId: string, file: File) => void
  onBrollRemove: (sceneId: string) => void
  onBrollVolumeChange: (sceneId: string, volume: number) => void
  onSwitchRender: (sceneId: string, renderId: string) => void
  onDeleteRender: (sceneId: string, renderId: string) => void
}

export default function SceneCard({
  scene,
  scriptId,
  onPromptChange,
  onDurationChange,
  onRenderOverrideChange,
  onSubmit,
  onDelete,
  onFrameUpload,
  onFrameAssign,
  onAudioUpload,
  onGenerateAudio,
  onFeedback,
  onRerender,
  onCancelRender,
  onBrollUpload,
  onBrollRemove,
  onBrollVolumeChange,
  onSwitchRender,
  onDeleteRender,
}: SceneCardProps) {
  const [editingPrompt, setEditingPrompt] = useState(false)
  const [promptDraft, setPromptDraft] = useState(scene.prompt)
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedbackDraft, setFeedbackDraft] = useState(scene.feedback)
  const [dragOverFrame, setDragOverFrame] = useState(false)
  const [feedbackSaved, setFeedbackSaved] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [showVoiceSelect, setShowVoiceSelect] = useState(false)
  const [selectedVoice, setSelectedVoice] = useState('')
  const [videoPlaying, setVideoPlaying] = useState(false)
  const [voiceOptions, setVoiceOptions] = useState<VoiceOption[]>(_cachedVoices || [])
  const [brollVolume, setBrollVolume] = useState(scene.broll_volume ?? 1.0)
  const [brollPlaying, setBrollPlaying] = useState(false)
  const brollInputRef = useRef<HTMLInputElement>(null)
  const brollVideoRef = useRef<HTMLVideoElement>(null)
  const brollVolumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch voice catalog on mount (cached across cards)
  useEffect(() => {
    if (_cachedVoices) {
      setVoiceOptions(_cachedVoices)
      return
    }
    audioApi.listVoices().then((voices) => {
      _cachedVoices = voices
      setVoiceOptions(voices)
    }).catch(() => {})
  }, [])
  const frameInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const meta = STATUS_META[scene.status] || STATUS_META.unknown

  const handlePromptSave = () => {
    onPromptChange(scene.id, promptDraft)
    setEditingPrompt(false)
  }

  const handlePromptCancel = () => {
    setPromptDraft(scene.prompt)
    setEditingPrompt(false)
  }

  const handleFrameSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onFrameUpload(scene.id, file)
    e.target.value = ''
  }

  const handleAudioSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onAudioUpload(scene.id, file)
    e.target.value = ''
  }

  const handleFeedbackSave = () => {
    onFeedback(scene.id, feedbackDraft)
    setFeedbackSaved(true)
    setShowFeedback(false)
    setTimeout(() => setFeedbackSaved(false), 2000)
  }

  const handleToggleVideoPlay = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play()
      setVideoPlaying(true)
    } else {
      video.pause()
      setVideoPlaying(false)
    }
  }

  const handleGenerateWithVoice = () => {
    onGenerateAudio(scene.id, selectedVoice || undefined)
    setShowVoiceSelect(false)
  }

  const handleBrollSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onBrollUpload(scene.id, file)
    e.target.value = ''
  }

  const handleBrollVolumeChange = (value: number) => {
    setBrollVolume(value)
    if (brollVolumeTimerRef.current) clearTimeout(brollVolumeTimerRef.current)
    brollVolumeTimerRef.current = setTimeout(() => {
      onBrollVolumeChange(scene.id, value)
    }, 500)
  }

  const handleToggleBrollPlay = () => {
    const video = brollVideoRef.current
    if (!video) return
    if (video.paused) {
      video.play()
      setBrollPlaying(true)
    } else {
      video.pause()
      setBrollPlaying(false)
    }
  }

  const canSubmit = scene.status === 'ready' || scene.status === 'draft' || scene.status === 'error'
  const isComplete = scene.status === 'complete'
  const isRendering = scene.status === 'rendering'
  const isError = scene.status === 'error'

  // Build video URL: use scene.video_url if provided, else construct from filename
  const videoUrl =
    scene.video_url ||
    (scene.video_filename && scriptId ? videosApi.fileUrl(scriptId, scene.video_filename) : null)

  return (
    <div
      className={`flex-shrink-0 w-[340px] min-w-[340px] bg-zinc-900 border-2 ${meta.border} rounded-2xl overflow-hidden shadow-2xl transition-all`}
    >
      {/* Card Header: Scene number + Status badge */}
      <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center">
            <span className="text-xs font-mono font-bold text-zinc-400">
              {scene.scene_number}
            </span>
          </div>
          <span className="text-[10px] text-zinc-600 tracking-[0.5px] uppercase">
            Scene
          </span>
        </div>
        <div
          className={`px-3 py-0.5 rounded-full text-[10px] font-medium tracking-[0.8px] flex items-center gap-2 ${meta.bg} ${meta.text}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`} />
          {meta.label}
        </div>
      </div>

      {/* Visual area: video, image, or placeholder */}
      <div className="px-4 pt-4">
        {/* Render version selector — shown when multiple renders exist */}
        {isComplete && scene.renders && scene.renders.length > 1 && (
          <div className="flex items-center gap-1 mb-2 flex-wrap">
            <span className="text-[9px] text-zinc-600 tracking-[0.5px] uppercase mr-1">Renders</span>
            {scene.renders.map((r, idx) => {
              const isActive = r.render_id === scene.active_render_id
              const dateStr = r.created
                ? new Date(r.created).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : ''
              return (
                <div key={r.render_id} className="flex items-center gap-0.5">
                  <button
                    onClick={() => onSwitchRender(scene.id, r.render_id)}
                    title={dateStr}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-medium transition-all ${
                      isActive
                        ? 'bg-zinc-700 text-zinc-100'
                        : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
                    }`}
                  >
                    v{idx + 1}
                  </button>
                  <button
                    onClick={() => onDeleteRender(scene.id, r.render_id)}
                    title="Delete this render version"
                    className="px-1 py-0.5 rounded-md text-[10px] text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                  >
                    x
                  </button>
                </div>
              )
            })}
          </div>
        )}
        {isComplete && videoUrl ? (
          /* Video player for completed scenes — replaces the initial frame */
          <div className="relative rounded-xl overflow-hidden border border-zinc-800 bg-black group">
            <video
              key={videoUrl}
              ref={videoRef}
              className="w-full h-[180px] object-contain cursor-pointer"
              src={videoUrl}
              poster={scene.initial_frame_url || undefined}
              onClick={handleToggleVideoPlay}
              onEnded={() => setVideoPlaying(false)}
              preload="metadata"
              playsInline
            />
            {/* Play/pause overlay */}
            {!videoPlaying && (
              <div
                className="absolute inset-0 flex items-center justify-center cursor-pointer bg-black/20"
                onClick={handleToggleVideoPlay}
              >
                <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                  <div
                    className="w-0 h-0 ml-0.5"
                    style={{
                      borderTop: '10px solid transparent',
                      borderBottom: '10px solid transparent',
                      borderLeft: '16px solid #18181b',
                    }}
                  />
                </div>
              </div>
            )}
            {videoPlaying && (
              <div
                className="absolute inset-0 flex items-center justify-center cursor-pointer"
                onClick={handleToggleVideoPlay}
              >
                <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center">
                  <div className="flex gap-1.5">
                    <div className="w-1.5 h-8 bg-white/90 rounded-sm" />
                    <div className="w-1.5 h-8 bg-white/90 rounded-sm" />
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : scene.initial_frame_url ? (
          /* Initial frame image — also accepts drag-and-drop replacement */
          <div
            className="relative rounded-xl overflow-hidden border border-zinc-800 cursor-pointer group"
            onClick={() => frameInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'copy'
              setDragOverFrame(true)
            }}
            onDragLeave={() => setDragOverFrame(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOverFrame(false)
              const frameData = e.dataTransfer.getData('application/x-frame')
              if (frameData) {
                try {
                  const frame = JSON.parse(frameData)
                  onFrameAssign(frame, scene.id)
                } catch { /* ignore parse errors */ }
              }
            }}
          >
            <img
              src={scene.initial_frame_url}
              alt={`Scene ${scene.scene_number} initial frame`}
              className="w-full h-[180px] object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none'
                const parent = (e.target as HTMLImageElement).parentElement
                if (parent) {
                  parent.classList.add('bg-zinc-950')
                  parent.innerHTML += '<div class="absolute inset-0 flex flex-col items-center justify-center text-zinc-600"><div class="text-xs">Frame not found</div><div class="text-[10px] mt-1">Click or drag to replace</div></div>'
                }
              }}
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
              <span className="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                Click to replace frame
              </span>
            </div>
          </div>
        ) : (
          /* Placeholder — upload or drag frame here */
          <div
            onClick={() => frameInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'copy'
              setDragOverFrame(true)
            }}
            onDragLeave={() => setDragOverFrame(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOverFrame(false)
              const frameData = e.dataTransfer.getData('application/x-frame')
              if (frameData) {
                try {
                  const frame = JSON.parse(frameData)
                  onFrameAssign(frame, scene.id)
                } catch { /* ignore parse errors */ }
              }
            }}
            className={`h-[180px] bg-zinc-950 border border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-zinc-600 transition-all group ${
              dragOverFrame ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-700'
            }`}
          >
            {/* CSS-based frame icon — no emoji */}
            <div className={`w-10 h-10 mb-2 border-2 rounded-lg flex items-center justify-center transition-colors ${dragOverFrame ? 'border-blue-500' : 'border-zinc-700 group-hover:border-zinc-600'}`}>
              <div className={`w-5 h-5 border-2 rounded-sm transition-colors ${dragOverFrame ? 'border-blue-500' : 'border-zinc-700 group-hover:border-zinc-600'}`} />
            </div>
            <div className={`text-xs ${dragOverFrame ? 'text-blue-400' : 'text-zinc-500'}`}>
              {dragOverFrame ? 'Drop frame here' : 'Add initial frame'}
            </div>
            <div className="text-[10px] text-zinc-700 mt-0.5">Click to upload or drag from Frames tab</div>
          </div>
        )}
        <input
          ref={frameInputRef}
          type="file"
          accept="image/*"
          onChange={handleFrameSelect}
          className="hidden"
        />
      </div>

      {/* Render progress bar — real timing data */}
      {isRendering && (
        <div className="px-4 pt-3">
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-500 rounded-full transition-all duration-500 soft-pulse"
              style={{ width: `${Math.max(5, scene.render_progress || 0)}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5 text-[10px]">
            <span className="text-orange-400">
              {scene.render_elapsed != null
                ? `Rendering — ${Math.floor(scene.render_elapsed)}s elapsed`
                : 'Rendering on ComfyUI...'}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-zinc-500">
                {scene.render_estimated_remaining != null
                  ? `est. ${formatTimeRemaining(scene.render_estimated_remaining)} remaining`
                  : `${scene.render_progress || 0}%`}
              </span>
              <button
                onClick={() => onCancelRender(scene.id)}
                className="text-[10px] px-2 py-0.5 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Queued scene — show estimated render time */}
      {scene.status === 'queued' && (
        <div className="px-4 pt-3">
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-yellow-500/40 rounded-full"
              style={{ width: '3%' }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5 text-[10px] text-yellow-400">
            <span>
              Queued
              {scene.render_estimated_remaining != null
                ? ` — est. ~${formatTimeRemaining(scene.render_estimated_remaining)}`
                : ''}
            </span>
            <button
              onClick={() => onCancelRender(scene.id)}
              className="text-[10px] px-2 py-0.5 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Error message */}
      {isError && scene.error_message && (
        <div className="px-4 pt-3">
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
            <div className="text-xs text-red-400 font-medium mb-0.5">Error</div>
            <div className="text-[11px] text-red-400/80 line-clamp-3">{scene.error_message}</div>
          </div>
        </div>
      )}

      {/* Prompt — editable */}
      <div className="px-4 pt-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-medium text-zinc-500 tracking-[1px] uppercase">
            Prompt
          </span>
          {!editingPrompt && (
            <button
              onClick={() => {
                setPromptDraft(scene.prompt)
                setEditingPrompt(true)
              }}
              className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-all"
            >
              Edit
            </button>
          )}
        </div>
        {editingPrompt ? (
          <div>
            <textarea
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              autoFocus
              className="w-full h-24 bg-zinc-950 border border-zinc-800 focus:border-zinc-700 rounded-xl px-3 py-2.5 text-xs resize-none placeholder:text-zinc-600 focus:outline-none text-zinc-200 leading-relaxed"
            />
            <div className="flex gap-2 mt-1.5">
              <button
                onClick={handlePromptSave}
                className="flex-1 bg-brand-600 hover:bg-brand-500 text-white text-xs py-1.5 rounded-lg font-medium transition-all"
              >
                Save
              </button>
              <button
                onClick={handlePromptCancel}
                className="px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs py-1.5 rounded-lg font-medium transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-[13px] leading-relaxed text-zinc-300 line-clamp-4 min-h-[50px]">
            {scene.prompt || (
              <span className="text-zinc-600 italic">No prompt yet — pipeline will generate one</span>
            )}
          </p>
        )}
      </div>

      {/* Dialogue preview (if available) */}
      {scene.dialogue && (
        <div className="px-4 pt-2">
          <div className="bg-zinc-950/50 border border-zinc-800/50 rounded-lg px-3 py-2">
            <div className="text-[9px] text-zinc-600 tracking-[0.8px] uppercase mb-0.5">Dialogue</div>
            <p className="text-[11px] text-zinc-400 italic line-clamp-2">{scene.dialogue}</p>
          </div>
        </div>
      )}

      {/* Audio player */}
      <div className="px-4 pt-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-medium text-zinc-500 tracking-[1px] uppercase">
            Audio
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={() => setShowVoiceSelect(!showVoiceSelect)}
              className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-all"
              title="Generate audio via VoxCPM2"
            >
              Generate
            </button>
            <button
              onClick={() => audioInputRef.current?.click()}
              className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-all"
            >
              Upload
            </button>
          </div>
        </div>

        {/* Voice selection dropdown (shown when Generate is clicked) */}
        {showVoiceSelect && (
          <div className="mb-2 flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-2">
            <select
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1 text-[11px] text-zinc-300 focus:outline-none focus:border-zinc-700"
            >
              {voiceOptions.length > 0 ? (
                voiceOptions.map((v) => (
                  <option key={v.voice_id} value={v.voice_id}>
                    {v.display_name}
                  </option>
                ))
              ) : (
                <option value="">Loading voices...</option>
              )}
            </select>
            <button
              onClick={handleGenerateWithVoice}
              className="text-[10px] px-3 py-1 rounded-md bg-brand-600 hover:bg-brand-500 text-white font-medium transition-all"
            >
              Go
            </button>
            <button
              onClick={() => setShowVoiceSelect(false)}
              className="text-[10px] px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-all"
            >
              Cancel
            </button>
          </div>
        )}

        <AudioPlayer audioUrl={scene.audio_url} sceneId={scene.id} />
        <input
          ref={audioInputRef}
          type="file"
          accept="audio/*"
          onChange={handleAudioSelect}
          className="hidden"
        />
      </div>

      {/* B-roll section */}
      <div className="px-4 pt-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-medium text-zinc-500 tracking-[1px] uppercase">
            B-Roll
          </span>
          {scene.broll_url && (
            <button
              onClick={() => onBrollRemove(scene.id)}
              className="text-[10px] px-2 py-0.5 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all"
            >
              Remove
            </button>
          )}
        </div>

        {scene.broll_url ? (
          <div className="space-y-2">
            {/* B-roll video preview */}
            <div className="relative rounded-xl overflow-hidden border border-zinc-800 bg-black group">
              <video
                ref={brollVideoRef}
                className="w-full h-[80px] object-contain cursor-pointer"
                src={scene.broll_url}
                onClick={handleToggleBrollPlay}
                onEnded={() => setBrollPlaying(false)}
                preload="metadata"
                playsInline
                muted
              />
              {!brollPlaying && (
                <div
                  className="absolute inset-0 flex items-center justify-center cursor-pointer bg-black/20"
                  onClick={handleToggleBrollPlay}
                >
                  <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                    <div
                      className="w-0 h-0 ml-0.5"
                      style={{
                        borderTop: '7px solid transparent',
                        borderBottom: '7px solid transparent',
                        borderLeft: '11px solid #18181b',
                      }}
                    />
                  </div>
                </div>
              )}
              {brollPlaying && (
                <div
                  className="absolute inset-0 flex items-center justify-center cursor-pointer"
                  onClick={handleToggleBrollPlay}
                >
                  <div className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center">
                    <div className="flex gap-1">
                      <div className="w-1 h-5 bg-white/90 rounded-sm" />
                      <div className="w-1 h-5 bg-white/90 rounded-sm" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Volume slider */}
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[9px] text-zinc-600 tracking-[0.5px] uppercase">Volume</span>
                <span className="text-[10px] text-zinc-400 font-mono">
                  {Math.round(brollVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={brollVolume}
                onChange={(e) => handleBrollVolumeChange(Number(e.target.value))}
                className="w-full accent-brand-500"
              />
            </div>
          </div>
        ) : (
          <button
            onClick={() => brollInputRef.current?.click()}
            className="w-full h-[60px] bg-zinc-950 border border-dashed border-zinc-700 rounded-xl flex items-center justify-center text-xs text-zinc-500 hover:text-zinc-400 hover:border-zinc-600 transition-all"
          >
            Add B-roll
          </button>
        )}
        <input
          ref={brollInputRef}
          type="file"
          accept="video/*"
          onChange={handleBrollSelect}
          className="hidden"
        />
      </div>

      {/* Meta row: Duration | Resolution | FPS */}
      <div className="px-4 pt-3 flex items-center gap-3 flex-wrap">
        <div>
          <div className="text-[10px] text-zinc-600 tracking-[0.8px] uppercase">Duration</div>
          <div className="flex items-center gap-1.5 mt-px">
            <input
              type="number"
              min={5}
              value={scene.duration}
              onChange={(e) => onDurationChange(scene.id, Number(e.target.value))}
              className="w-12 bg-zinc-950 border border-zinc-800 rounded-md px-2 py-0.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700 text-center"
            />
            <span className="text-xs text-zinc-500">sec</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-600 tracking-[0.8px] uppercase">Resolution</div>
          <div className="flex items-center gap-1.5 mt-px">
            <select
              value={
                scene.width && scene.height
                  ? `${scene.width}x${scene.height}`
                  : 'template'
              }
              onChange={(e) => {
                const v = e.target.value
                if (v === 'template') {
                  onRenderOverrideChange(scene.id, 'width', null)
                  onRenderOverrideChange(scene.id, 'height', null)
                } else {
                  const [w, h] = v.split('x').map(Number)
                  onRenderOverrideChange(scene.id, 'width', w)
                  onRenderOverrideChange(scene.id, 'height', h)
                }
              }}
              disabled={scene.status === 'rendering' || scene.status === 'queued'}
              className="bg-zinc-950 border border-zinc-800 rounded-md px-1.5 py-0.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700 disabled:opacity-40"
              title="Per-scene render size. 'Template' uses the Workflow Settings default."
            >
              <option value="template">Template</option>
              <option value="1600x900">16:9 — 1600x900</option>
              <option value="1280x720">16:9 — 1280x720</option>
              <option value="900x1600">9:16 — 900x1600</option>
              <option value="720x1280">9:16 — 720x1280</option>
              <option value="1024x1024">1:1 — 1024x1024</option>
            </select>
          </div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-600 tracking-[0.8px] uppercase">FPS</div>
          <input
            type="number"
            min={8}
            max={60}
            value={scene.fps ?? ''}
            placeholder="24"
            onChange={(e) => {
              const v = e.target.value === '' ? null : Number(e.target.value)
              onRenderOverrideChange(scene.id, 'fps', v)
            }}
            disabled={scene.status === 'rendering' || scene.status === 'queued'}
            className="w-10 bg-zinc-950 border border-zinc-800 rounded-md px-1.5 py-0.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700 text-center placeholder:text-zinc-700 disabled:opacity-40"
            title="Per-scene FPS. Empty = template default."
          />
        </div>
        {scene.comfyui_prompt_id && (
          <div className="ml-auto text-right">
            <div className="text-[10px] text-zinc-600 tracking-[0.8px] uppercase">Job ID</div>
            <div className="text-[10px] text-zinc-500 font-mono mt-px">
              {scene.comfyui_prompt_id.slice(0, 8)}
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="p-4 pt-3 flex gap-2">
        {canSubmit && (
          <button
            onClick={() => onSubmit(scene.id)}
            className="flex-1 bg-white hover:bg-zinc-100 active:bg-white text-zinc-950 py-2.5 rounded-xl text-sm font-semibold transition-all tracking-[0.3px]"
          >
            {isError ? 'Retry' : 'Submit'}
          </button>
        )}
        {isComplete && (
          <button
            onClick={() => onRerender(scene.id)}
            className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-2.5 rounded-xl text-sm font-semibold transition-all tracking-[0.3px]"
          >
            Re-render
          </button>
        )}
        {isComplete && videoUrl && (
          <a
            href={videoUrl}
            download
            className="px-4 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 py-2.5 rounded-xl text-sm font-medium transition-all"
          >
            Download
          </a>
        )}
        <button
          onClick={() => setShowActions(!showActions)}
          className="px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 py-2.5 rounded-xl text-sm font-medium transition-all"
          title="More options"
        >
          More
        </button>
      </div>

      {/* Expanded actions */}
      {showActions && (
        <div className="px-4 pb-3 space-y-2">
          <button
            onClick={() => {
              setShowFeedback(!showFeedback)
              setShowActions(false)
            }}
            className="w-full text-left px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-all"
          >
            {scene.feedback ? 'Edit feedback' : 'Add feedback'}
          </button>
          <button
            onClick={() => {
              onDelete(scene.id)
              setShowActions(false)
            }}
            className="w-full text-left px-3 py-2 bg-red-500/5 border border-red-500/20 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-all"
          >
            Delete scene
          </button>
        </div>
      )}

      {/* Feedback box — collapsible section at bottom of card */}
      {showFeedback && (
        <div className="px-4 pb-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3">
            <div className="text-[10px] text-zinc-500 tracking-[0.8px] uppercase mb-1.5">
              Feedback / Notes to AI Pipeline
            </div>
            <textarea
              value={feedbackDraft}
              onChange={(e) => setFeedbackDraft(e.target.value)}
              placeholder="Write notes about why a change was made. This feeds back into the AI pipeline for self-improvement..."
              className="w-full h-16 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-[11px] resize-none placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 text-zinc-300 leading-relaxed"
            />
            <button
              onClick={handleFeedbackSave}
              className="w-full mt-2 bg-brand-600/20 hover:bg-brand-600/30 text-brand-400 text-xs py-1.5 rounded-lg font-medium transition-all"
            >
              Save Feedback
            </button>
          </div>
        </div>
      )}

      {/* Saved feedback indicator */}
      {feedbackSaved && !showFeedback && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-1.5 text-[10px] text-emerald-500">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Feedback saved</span>
          </div>
        </div>
      )}

      {/* Existing feedback indicator (when not editing) */}
      {!showFeedback && !feedbackSaved && scene.feedback && (
        <div className="px-4 pb-3">
          <button
            onClick={() => {
              setFeedbackDraft(scene.feedback)
              setShowFeedback(true)
            }}
            className="w-full text-left"
          >
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 flex-shrink-0" />
              <span className="italic line-clamp-1">{scene.feedback}</span>
            </div>
          </button>
        </div>
      )}
    </div>
  )
}