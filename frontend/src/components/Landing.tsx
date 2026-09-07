import { useEffect, useState } from 'react'
import { scriptsApi, renderSettingsApi } from '../api'
import type { Script } from '../types'

interface LandingProps {
  onBrowseProjects: () => void
  onProjectCreated: (script: Script) => void
  onScriptFormatted: (result: {
    title: string
    raw_text: string
    characters: { name: string; type: string; traits: Record<string, string> }[]
    lines: unknown[]
  }) => void
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

export default function Landing({
  onBrowseProjects,
  onProjectCreated,
  onScriptFormatted,
  showToast,
}: LandingProps) {
  const [prompt, setPrompt] = useState('')
  const [formatting, setFormatting] = useState(false)
  const [formatError, setFormatError] = useState<string | null>(null)
  const [showNameInput, setShowNameInput] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [creating, setCreating] = useState(false)
  // Output format — required at creation (Gui 2026-09-07: this is the project's
  // canvas setup; it sizes every initial frame and is the final render size)
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [presets, setPresets] = useState<Record<string, { label: string; width: number | null; height: number | null; fps: number | null; note: string }>>({})
  const [grading, setGrading] = useState<Record<string, { verdict: string; reason: string }>>({})

  useEffect(() => {
    fetch('/api/scripts/render-presets')
      .then((r) => r.json())
      .then((res) => {
        if (res?.presets) setPresets(res.presets)
        if (res?.grading) setGrading(res.grading)
      })
      .catch(() => {/* non-fatal */})
  }, [])

  const handleFormat = async () => {
    if (!prompt.trim() || formatting) return
    setFormatting(true)
    setFormatError(null)
    try {
      // If the input already looks like a Fountain script, skip the LLM
      // entirely — parse locally and open the doc view immediately.
      const t = prompt.trim()
      const looksLikeScript =
        /^(INT\.|EXT\.)/im.test(t) || /^[A-Z][A-Z ']{2,30}$/m.test(t)
      if (looksLikeScript) {
        const res = await fetch('/api/writing/scripts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw_text: t }),
        })
        if (!res.ok) {
          const detail = await res.json().catch(() => ({}))
          throw new Error(detail.detail || 'Failed to parse script')
        }
        const blob = await res.json()
        onScriptFormatted({
          title: blob.title,
          raw_text: blob.raw_text,
          characters: blob.characters,
          lines: blob.lines,
        })
        return
      }
      // Otherwise: full LLM formatting (needs API key configured)
      const res = await fetch('/api/writing/format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: t }),
      })
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}))
        throw new Error(detail.detail || 'The LLM could not be reached')
      }
      const data = await res.json()
      onScriptFormatted(data)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to format script'
      setFormatError(msg)
    } finally {
      setFormatting(false)
    }
  }

  const handleCreateEmpty = async () => {
    if (!projectName.trim() || !selectedPreset || creating) return
    setCreating(true)
    try {
      const created = await scriptsApi.create(projectName.trim(), '')
      // Persist the output format chosen at creation (canvas setup)
      try {
        await renderSettingsApi.set(created.id, { preset: selectedPreset })
      } catch (presetErr) {
        console.error('Failed to save render preset:', presetErr)
      }
      showToast('Project created', 'success')
      onProjectCreated(created as unknown as Script)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to create project', 'error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 pb-24">
      {/* Wordmark */}
      <div className="mb-10 text-center">
        <div className="text-[11px] font-medium tracking-[3px] uppercase text-zinc-600 mb-3">
          ComfyUI Video Workflow
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-100">
          Let&apos;s write your next movie idea
        </h1>
        <p className="text-sm text-zinc-500 mt-3 max-w-md leading-relaxed">
          Describe an idea, paste a script, or start from scratch. The LLM formats
          everything — characters, dialogue, and direction — ready for the timeline.
        </p>
      </div>

      {/* Composer box */}
      <div className="w-full max-w-2xl">
        <div
          className={`rounded-3xl border bg-zinc-900/60 backdrop-blur transition-all ${
            prompt
              ? 'border-brand-500/40 shadow-[0_0_0_1px_rgba(16,185,129,0.08),0_8px_40px_rgba(0,0,0,0.4)]'
              : 'border-zinc-800 hover:border-zinc-700'
          }`}
        >
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleFormat()
            }}
            placeholder="A detective walks into a diner at midnight. The rain hasn't stopped for days..."
            rows={4}
            className="w-full bg-transparent px-6 pt-5 pb-3 text-[15px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none resize-none leading-relaxed"
          />
          <div className="flex items-center justify-between px-4 pb-4">
            <div className="text-[11px] text-zinc-600 pl-2">
              {prompt ? `${prompt.trim().length} characters` : 'Drop a file, paste a script, or just an idea'}
            </div>
            <button
              onClick={handleFormat}
              disabled={!prompt.trim() || formatting}
              className="px-5 py-2 bg-brand-600 hover:bg-brand-500 active:bg-brand-600 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-all tracking-[0.3px]"
            >
              {formatting ? 'Formatting...' : 'Write Script'}
            </button>
          </div>
        </div>
        {formatError && (
          <div className="mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
            {formatError}
          </div>
        )}
      </div>

      {/* Secondary actions */}
      <div className="mt-8 flex items-center gap-3">
        <button
          onClick={onBrowseProjects}
          className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-sm font-medium rounded-xl transition-all"
        >
          Browse projects
        </button>
        <button
          onClick={() => setShowNameInput(!showNameInput)}
          className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-sm font-medium rounded-xl transition-all"
        >
          New empty project
        </button>
      </div>

      {/* Inline creation panel for manual project: format + name (required) */}
      {showNameInput && (
        <div className="mt-4 w-full max-w-2xl bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 space-y-3">
          <div>
            <label className="text-[10px] font-medium text-zinc-500 mb-1.5 tracking-[1px] uppercase block">
              1. Output format — where is this going?
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {Object.entries(presets).map(([key, p]) => {
                const active = selectedPreset === key
                const verdict = grading[key]?.verdict || 'recommended'
                const isExceeds = verdict === 'exceeds'
                const isHeavy = verdict === 'heavy'
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedPreset(key)}
                    title={grading[key]?.reason || presets[key]?.note}
                    className={`text-left px-2.5 py-2 rounded-lg border transition-all ${
                      isExceeds
                        ? 'border-zinc-800 bg-zinc-950 opacity-40 hover:opacity-60'
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
                        ? `${presets[key].width}x${presets[key].height}`
                        : 'Set size after creation'}
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="text-[10px] text-zinc-600 mt-2 leading-relaxed">
              This sets up the project&apos;s canvas: the frame size and frame rate apply to
              every initial frame and are the final render size for the whole video
              (unless you upscale at the end). Pick where the video will be posted.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && selectedPreset && handleCreateEmpty()}
              placeholder="2. What would you like to name this project?"
              autoFocus
              className="flex-1 bg-zinc-950 border border-zinc-800 focus:border-brand-500/40 rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
            />
            <button
              onClick={handleCreateEmpty}
              disabled={!projectName.trim() || !selectedPreset || creating}
              title={selectedPreset ? 'Create project' : 'Pick an output format first'}
              className="px-5 py-2.5 bg-white hover:bg-zinc-100 active:bg-white disabled:opacity-30 disabled:cursor-not-allowed text-zinc-950 text-sm font-semibold rounded-xl transition-all"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}