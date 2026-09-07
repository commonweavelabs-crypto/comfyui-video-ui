import { useState, useEffect, useCallback, useRef } from 'react'
import type { Scene, Script, PipelineProgress } from '../types'
import { scriptsApi, scenesApi, comfyuiApi, musicApi, renderSettingsApi } from '../api'
import MusicPanel from './MusicPanel'
import ExportPanel from './ExportPanel'
import SlotsPanel from './SlotsPanel'

interface WorkflowWizardProps {
  script: Script | null
  scenes: Scene[]
  onClose: () => void
  onScriptCreated: (script: Script) => void
  onScenesUpdated: () => void
  onScriptSubmit: (script: Script) => void
  onExportComplete: (exportInfo: { filename: string; url: string }) => void
}

const STEPS = [
  { title: 'Script', description: 'Write or paste a script to begin' },
  { title: 'Scenes', description: 'AI breaks your script into scenes' },
  { title: 'Frames', description: 'Assign initial frames to each scene' },
  { title: 'Voice', description: 'Generate or upload audio for each scene' },
  { title: 'Render', description: 'Submit scenes to ComfyUI for rendering' },
  { title: 'Music', description: 'Add a music track (optional)' },
  { title: 'Export', description: 'Assemble and export the final video' },
]

export default function WorkflowWizard({
  script,
  scenes,
  onClose,
  onScriptCreated,
  onScenesUpdated,
  onScriptSubmit,
  onExportComplete,
}: WorkflowWizardProps) {
  const [step, setStep] = useState(0)
  const [stepSkipped, setStepSkipped] = useState<Set<number>>(new Set())
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgress | null>(null)
  const [pipelineSubmitted, setPipelineSubmitted] = useState(false)
  const [selectedMusicTrack, setSelectedMusicTrack] = useState<string | null>(null)
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Creation-time output format (Gui 2026-09-07: format is a start-of-project
  // decision — no default, must be picked before Create is enabled)
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [presets, setPresets] = useState<Record<string, { label: string; width: number | null; height: number | null; fps: number | null; note: string }>>({})

  // ─── Step 0: Script creation ──────────────────────────────
  // Load platform presets when the wizard mounts in creation mode (no script yet)
  const [grading, setGrading] = useState<Record<string, { verdict: string; reason: string }>>({})
  const [hardware, setHardware] = useState<{ gpu_name: string | null; vram_total_gb: number | null } | null>(null)
  const [pendingExceeds, setPendingExceeds] = useState<string | null>(null)
  useEffect(() => {
    if (script) return
    fetch('/api/scripts/render-presets')
      .then((r) => r.json())
      .then((res) => {
        if (res?.presets) setPresets(res.presets)
        if (res?.grading) setGrading(res.grading)
        if (res?.hardware) setHardware(res.hardware)
      })
      .catch(() => {
        /* non-fatal: picker shows empty if the endpoint fails */
      })
  }, [script])

  const handleCreateScript = async () => {
    if (!newTitle.trim() || !newContent.trim() || !selectedPreset) return
    setCreating(true)
    setCreateError(null)
    try {
      const created = await scriptsApi.create(newTitle.trim(), newContent.trim())
      // Persist the chosen output format on the new project immediately
      try {
        await renderSettingsApi.set(created.id, { preset: selectedPreset })
      } catch (presetErr) {
        console.error('Failed to save render preset:', presetErr)
      }
      onScriptCreated(created)
      setNewTitle('')
      setNewContent('')
      setSelectedPreset(null)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create script')
    } finally {
      setCreating(false)
    }
  }

  const canAdvanceStep0 = script !== null

  // ─── Step 1: Pipeline submission ──────────────────────────
  const startPipeline = useCallback(() => {
    if (!script || pipelineSubmitted) return
    setPipelineSubmitted(true)
    onScriptSubmit(script)
    setPipelineProgress({ stage: 'Starting', message: 'Submitting script to pipeline...', percent: 0 })

    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
    progressIntervalRef.current = setInterval(async () => {
      try {
        const prog = await scriptsApi.progress(script.id)
        setPipelineProgress(prog)
        if (prog.percent >= 100) {
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current)
            progressIntervalRef.current = null
          }
          onScenesUpdated()
          setStep(2) // auto-advance to Frames
        } else {
          onScenesUpdated()
        }
      } catch (e) {
        console.error('Pipeline progress poll failed:', e)
      }
    }, 3000)
  }, [script, pipelineSubmitted, onScriptSubmit, onScenesUpdated])

  const handleSkipScenes = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
    setStepSkipped((prev) => new Set(prev).add(1))
    setStep(2)
  }

  // Auto-start pipeline when entering step 1 if script exists and scenes are empty
  useEffect(() => {
    if (step === 1 && script && !pipelineSubmitted && scenes.length === 0) {
      startPipeline()
    }
  }, [step, script, pipelineSubmitted, scenes.length, startPipeline])

  // ─── Step 2: Frames ──────────────────────────────────────
  const scenesWithFrames = scenes.filter((s) => s.initial_frame_url).length
  const canAdvanceStep2 = scenes.length > 0

  // ─── Step 3: Voice ────────────────────────────────────────
  const scenesWithAudio = scenes.filter((s) => s.audio_url).length
  const canAdvanceStep3 = scenes.length > 0

  // ─── Step 4: Render ───────────────────────────────────────
  const completedScenes = scenes.filter((s) => s.status === 'complete').length
  const canAdvanceStep4 = completedScenes === scenes.length && scenes.length > 0

  const handleRenderAll = useCallback(async () => {
    if (!script) return
    try {
      await comfyuiApi.submitAll(script.id)
      onScenesUpdated()
    } catch (e) {
      console.error('Render all failed:', e)
    }
  }, [script, onScenesUpdated])

  // Poll for render status when on step 4
  useEffect(() => {
    if (step !== 4 || !script) return
    const interval = setInterval(async () => {
      try {
        const result = await comfyuiApi.pollStatus(script.id)
        // Update is handled by parent via onScenesUpdated
        onScenesUpdated()
        const allDone = result.scenes.every((s) => s.status === 'complete' || s.status === 'error')
        if (allDone) {
          clearInterval(interval)
        }
      } catch {
        // ignore poll errors
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [step, script, onScenesUpdated])

  // ─── Step navigation ──────────────────────────────────────
  const handleNext = () => {
    if (step < 6) setStep(step + 1)
  }

  const handleBack = () => {
    if (step > 0) setStep(step - 1)
  }

  const handleSkipStep = () => {
    setStepSkipped((prev) => new Set(prev).add(step))
    if (step < 6) setStep(step + 1)
  }

  const canAdvance = () => {
    switch (step) {
      case 0: return canAdvanceStep0
      case 1: return pipelineProgress?.percent !== undefined && pipelineProgress.percent >= 100
      case 2: return canAdvanceStep2
      case 3: return canAdvanceStep3
      case 4: return canAdvanceStep4
      case 5: return true // music is optional
      case 6: return false // final step, no next
      default: return false
    }
  }

  const handleClose = () => {
    // If work in progress (step > 0 and not at final), confirm
    if (step > 0 && step < 6) {
      setShowCloseConfirm(true)
    } else {
      onClose()
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/95 backdrop-blur-md flex flex-col">
      {/* Close button */}
      <button
        onClick={handleClose}
        className="absolute top-4 right-4 z-10 w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 flex items-center justify-center transition-all text-lg"
      >
        x
      </button>

      {/* Step indicator */}
      <div className="px-8 pt-8 pb-2 flex-shrink-0">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-1">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center flex-1 last:flex-none">
                {/* Dot */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-3 h-3 rounded-full transition-all ${
                      i < step || stepSkipped.has(i)
                        ? 'bg-emerald-500'
                        : i === step
                          ? 'bg-brand-500 ring-4 ring-brand-500/20'
                          : 'bg-zinc-700'
                    }`}
                  />
                </div>
                {/* Line */}
                {i < STEPS.length - 1 && (
                  <div
                    className={`h-0.5 flex-1 mx-2 transition-all ${
                      i < step || stepSkipped.has(i) ? 'bg-emerald-500' : 'bg-zinc-800'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          {/* Step labels */}
          <div className="flex justify-between mt-1">
            {STEPS.map((s, i) => (
              <div
                key={i}
                className={`text-[9px] tracking-[0.5px] uppercase transition-colors ${
                  i === step ? 'text-zinc-200 font-medium' : 'text-zinc-600'
                }`}
              >
                {s.title}
              </div>
            ))}
          </div>
        </div>

        {/* Step title + description */}
        <div className="max-w-3xl mx-auto mt-6 text-center">
          <div className="text-lg font-semibold tracking-tight text-zinc-100">
            {STEPS[step].title}
            {step === 5 && (
              <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500 tracking-[0.5px] uppercase">
                Optional
              </span>
            )}
          </div>
          <div className="text-sm text-zinc-500 mt-1">{STEPS[step].description}</div>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-8 py-6">
        <div className="max-w-3xl mx-auto">
          {/* Step 0: Script */}
          {step === 0 && (
            <div className="space-y-4">
              {script ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span className="text-[10px] text-emerald-400 tracking-[0.5px] uppercase font-medium">
                      Script Selected
                    </span>
                  </div>
                  <div className="text-lg font-semibold text-zinc-100 mb-2">{script.title}</div>
                  <div className="text-sm text-zinc-400 leading-relaxed line-clamp-6 max-h-48 overflow-y-auto">
                    {script.content}
                  </div>
                  <div className="text-[10px] text-zinc-600 mt-3">
                    {script.scene_count} scenes · {script.status.toUpperCase()}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Output format — required first decision (Gui 2026-09-07) */}
                  <div>
                    <label className="text-[10px] font-medium text-zinc-500 mb-1.5 tracking-[1px] uppercase block">
                      1. Output format — where is this going?
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {Object.entries(presets).map(([key, p]) => {
                        const active = selectedPreset === key
                        const g = grading[key]
                        const verdict = g?.verdict || 'recommended'
                        const isExceeds = verdict === 'exceeds'
                        const isHeavy = verdict === 'heavy'
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              if (isExceeds) {
                                setPendingExceeds(key)
                              } else {
                                setSelectedPreset(key)
                              }
                            }}
                            title={g?.reason || presets[key]?.note}
                            className={`text-left px-2.5 py-2 rounded-lg border transition-all ${
                              isExceeds
                                ? 'border-zinc-800 bg-zinc-950 opacity-40 cursor-not-allowed hover:opacity-60'
                                : active
                                  ? 'border-emerald-600/60 bg-emerald-600/10'
                                  : isHeavy
                                    ? 'border-yellow-700/40 hover:border-yellow-700 bg-zinc-950'
                                    : 'border-zinc-800 hover:border-zinc-700 bg-zinc-950'
                            }`}
                          >
                            <div className={`text-[11px] font-medium flex items-center gap-1.5 ${
                              isExceeds ? 'text-zinc-600' : active ? 'text-emerald-400' : isHeavy ? 'text-yellow-500' : 'text-zinc-200'
                            }`}>
                              {presets[key].label}
                              {isHeavy && (
                                <span className="text-[8px] px-1 py-px rounded bg-yellow-900/40 text-yellow-500 tracking-[0.5px] uppercase">Slow</span>
                              )}
                              {isExceeds && (
                                <span className="text-[8px] px-1 py-px rounded bg-red-900/40 text-red-500 tracking-[0.5px] uppercase">Not rec.</span>
                              )}
                            </div>
                            <div className="text-[9px] text-zinc-600 mt-0.5">
                              {presets[key].width && presets[key].height
                                ? `${presets[key].width}x${presets[key].height} · ${presets[key].fps}fps`
                                : 'Set size after creation'}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                    {hardware?.vram_total_gb && (
                      <div className="text-[10px] text-zinc-600 mt-1.5">
                        Graded for {hardware.gpu_name || 'your GPU'} ({hardware.vram_total_gb.toFixed(0)}GB) — grayed presets exceed this hardware or the model's supported resolution.
                      </div>
                    )}
                    {!selectedPreset && (
                      <div className="text-[10px] text-zinc-600 mt-1.5">
                        Pick where this video will be posted — it decides the frame size and frame rate for the whole project.
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-zinc-500 mb-1.5 tracking-[1px] uppercase block">
                      2. Title
                    </label>
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="My Video Project"
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-700 rounded-xl px-4 py-3 text-sm placeholder:text-zinc-600 focus:outline-none text-zinc-200"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-zinc-500 mb-1.5 tracking-[1px] uppercase block">
                      3. Script Content
                    </label>
                    <textarea
                      value={newContent}
                      onChange={(e) => setNewContent(e.target.value)}
                      placeholder="Write or paste your script here..."
                      className="w-full min-h-[200px] bg-zinc-900 border border-zinc-800 focus:border-zinc-700 rounded-xl px-4 py-3 text-sm resize-none placeholder:text-zinc-600 focus:outline-none text-zinc-200 font-mono leading-relaxed"
                    />
                  </div>
                  {createError && (
                    <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                      {createError}
                    </div>
                  )}
                  <button
                    onClick={handleCreateScript}
                    disabled={!newTitle.trim() || !newContent.trim() || !selectedPreset || creating}
                    className="px-6 py-3 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all tracking-[0.3px]"
                  >
                    {creating ? 'Creating...' : 'Create & Continue'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 1: Scenes (pipeline) */}
          {step === 1 && (
            <div className="space-y-4">
              {pipelineProgress ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 bg-orange-400 rounded-full soft-pulse" />
                    <span className="text-xs text-orange-400 font-medium">{pipelineProgress.stage}</span>
                  </div>
                  <div className="text-sm text-zinc-400 mb-4">{pipelineProgress.message}</div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden mb-2">
                    <div
                      className="h-full bg-brand-500 rounded-full transition-all duration-500"
                      style={{ width: `${pipelineProgress.percent}%` }}
                    />
                  </div>
                  <div className="text-center text-xs text-zinc-500">
                    {Math.round(pipelineProgress.percent)}%
                  </div>
                </div>
              ) : (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
                  <div className="text-sm text-zinc-400">Preparing to submit script to pipeline...</div>
                </div>
              )}
              <div className="flex justify-center">
                <button
                  onClick={handleSkipScenes}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs rounded-lg font-medium transition-all"
                >
                  Skip — Create scenes manually
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Frames */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="text-sm text-zinc-400 mb-2">
                Assign initial frames to each scene. You can drag from the Frames tab in the sidebar or click to upload.
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {scenes.map((scene) => (
                  <div
                    key={scene.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl p-3"
                  >
                    <div className="text-[10px] text-zinc-500 tracking-[0.5px] uppercase mb-1">
                      Scene {scene.scene_number}
                    </div>
                    {scene.initial_frame_url ? (
                      <div className="relative rounded-lg overflow-hidden border border-zinc-800">
                        <img
                          src={scene.initial_frame_url}
                          alt={`Scene ${scene.scene_number}`}
                          className="w-full h-24 object-cover"
                        />
                        <div className="absolute top-1.5 right-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        </div>
                      </div>
                    ) : (
                      <div className="h-24 bg-zinc-950 border border-dashed border-zinc-700 rounded-lg flex flex-col items-center justify-center">
                        <div className="w-8 h-8 mb-1 border-2 border-zinc-700 rounded-lg flex items-center justify-center">
                          <div className="w-4 h-4 border-2 border-zinc-700 rounded-sm" />
                        </div>
                        <div className="text-[10px] text-zinc-600">No frame</div>
                      </div>
                    )}
                    <div className="text-[10px] text-zinc-600 mt-1.5 line-clamp-2">
                      {scene.prompt || 'No prompt'}
                    </div>
                  </div>
                ))}
              </div>
              {scenes.length === 0 && (
                <div className="text-center py-8 text-zinc-600 text-sm">
                  No scenes yet. Go back and submit the script to the pipeline.
                </div>
              )}
              <div className="text-[11px] text-zinc-500">
                {scenesWithFrames}/{scenes.length} scenes have frames assigned.
              </div>
            </div>
          )}

          {/* Step 3: Voice */}
          {step === 3 && (
            <div className="space-y-3">
              <div className="text-sm text-zinc-400 mb-2">
                Generate or upload audio for each scene. Use the scene cards in the timeline to manage audio.
              </div>
              {scenes.map((scene) => (
                <div
                  key={scene.id}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex items-center gap-3"
                >
                  <div className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-mono font-bold text-zinc-400">
                      {scene.scene_number}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-zinc-300 line-clamp-1">{scene.prompt || 'No prompt'}</div>
                    {scene.dialogue && (
                      <div className="text-[10px] text-zinc-600 italic line-clamp-1 mt-0.5">
                        {scene.dialogue}
                      </div>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    {scene.audio_url ? (
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span className="text-[10px] text-emerald-400 tracking-[0.5px] uppercase">
                          Audio Ready
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                        <span className="text-[10px] text-zinc-600 tracking-[0.5px] uppercase">
                          No Audio
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div className="text-[11px] text-zinc-500">
                {scenesWithAudio}/{scenes.length} scenes have audio.
              </div>
            </div>
          )}

          {/* Step 4: Render */}
          {step === 4 && (
            <div className="space-y-3">
              <SlotsPanel scriptId={script?.id} />
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-zinc-400">
                  Submit scenes to ComfyUI for rendering.
                </div>
                <button
                  onClick={handleRenderAll}
                  disabled={!script || scenes.length === 0}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-all"
                >
                  Submit All
                </button>
              </div>
              {scenes.map((scene) => (
                <div
                  key={scene.id}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex items-center gap-3"
                >
                  <div className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-mono font-bold text-zinc-400">
                      {scene.scene_number}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-zinc-300 line-clamp-1">{scene.prompt || 'No prompt'}</div>
                  </div>
                  {/* Status badge */}
                  <div className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium tracking-[0.8px]">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        scene.status === 'complete'
                          ? 'bg-emerald-500'
                          : scene.status === 'rendering'
                            ? 'bg-orange-500 animate-pulse'
                            : scene.status === 'error'
                              ? 'bg-red-500'
                              : scene.status === 'queued'
                                ? 'bg-yellow-500'
                                : 'bg-zinc-600'
                      }`}
                    />
                    <span
                      className={
                        scene.status === 'complete'
                          ? 'text-emerald-400'
                          : scene.status === 'rendering'
                            ? 'text-orange-400'
                            : scene.status === 'error'
                              ? 'text-red-400'
                              : scene.status === 'queued'
                                ? 'text-yellow-400'
                                : 'text-zinc-500'
                      }
                    >
                      {scene.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
              {scenes.length > 0 && (
                <div className="text-[11px] text-zinc-500">
                  {completedScenes}/{scenes.length} scenes rendered.
                </div>
              )}
            </div>
          )}

          {/* Step 5: Music */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="text-sm text-zinc-400">
                Add a music track to your video. This step is optional — you can skip it entirely.
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <MusicPanel
                  selectedTrackId={selectedMusicTrack}
                  onSelectTrack={setSelectedMusicTrack}
                />
              </div>
            </div>
          )}

          {/* Step 6: Export */}
          {step === 6 && script && (
            <ExportPanel
              scriptId={script.id}
              scenes={scenes}
              onExportComplete={onExportComplete}
            />
          )}

          {step === 6 && !script && (
            <div className="text-center py-8 text-zinc-600 text-sm">
              No project selected. Please go back to step 1.
            </div>
          )}
        </div>
      </div>

      {/* Bottom navigation */}
      <div className="flex-shrink-0 px-8 py-4 border-t border-zinc-800 bg-zinc-950">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <button
            onClick={handleBack}
            disabled={step === 0}
            className="px-5 py-2.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-300 text-sm font-medium rounded-xl transition-all"
          >
            Back
          </button>

          <div className="text-xs text-zinc-600">
            Step {step + 1} of {STEPS.length}
          </div>

          <div className="flex gap-2">
            {step === 5 && (
              <button
                onClick={handleSkipStep}
                className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-sm font-medium rounded-xl transition-all"
              >
                Skip Music
              </button>
            )}
            {step < 6 && (
              <button
                onClick={handleNext}
                disabled={!canAdvance()}
                className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all tracking-[0.3px]"
              >
                {step === 5 ? 'Continue' : 'Next'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Exceeds-hardware confirmation dialog (step 0 preset picker) */}
      {pendingExceeds && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm mx-4">
            <div className="text-sm font-semibold text-yellow-500 mb-2">
              {presets[pendingExceeds]?.label} is not recommended for your hardware
            </div>
            <div className="text-xs text-zinc-500 mb-4 leading-relaxed">
              {grading[pendingExceeds]?.reason} Renders may fail or take extremely long.
              {hardware?.vram_total_gb ? ` Recommended maximum for ${hardware.vram_total_gb.toFixed(0)}GB is around 1440p with this model.` : ''}
              {' '}Use this resolution anyway?
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingExceeds(null)}
                className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium rounded-xl transition-all"
              >
                Pick a lower resolution
              </button>
              <button
                onClick={() => {
                  setSelectedPreset(pendingExceeds)
                  setPendingExceeds(null)
                }}
                className="flex-1 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-medium rounded-xl transition-all"
              >
                Use anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close confirmation dialog */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm mx-4">
            <div className="text-sm font-semibold text-zinc-100 mb-2">Close wizard?</div>
            <div className="text-xs text-zinc-500 mb-4 leading-relaxed">
              Your progress will not be lost — you can reopen the wizard and continue from where you left off.
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCloseConfirm(false)}
                className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-medium rounded-xl transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}