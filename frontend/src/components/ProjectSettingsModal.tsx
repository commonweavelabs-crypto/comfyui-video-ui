// Project settings modal — output format (resolution + FPS) for ONE project.
// Shows platform presets graded for this hardware; warns when changing format
// on a project that already has rendered/submitted scenes (Gui 2026-09-07).

import { useCallback, useEffect, useState } from 'react'
import { renderSettingsApi } from '../api'
import type { Scene } from '../types'

interface ProjectSettingsModalProps {
  scriptId: string
  projectTitle: string
  scenes: Scene[]
  onClose: () => void
  onSaved?: () => void
}

type Preset = { label: string; width: number | null; height: number | null; fps: number | null; note: string }
type Grading = { verdict: string; reason: string }
type Current = { preset: string; width: number; height: number; fps: number; source: string }

export default function ProjectSettingsModal({
  scriptId,
  projectTitle,
  scenes,
  onClose,
  onSaved,
}: ProjectSettingsModalProps) {
  const [presets, setPresets] = useState<Record<string, Preset>>({})
  const [grading, setGrading] = useState<Record<string, Grading>>({})
  const [hardware, setHardware] = useState<{ gpu_name: string | null; vram_total_gb: number | null } | null>(null)
  const [current, setCurrent] = useState<Current | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [customW, setCustomW] = useState('')
  const [customH, setCustomH] = useState('')
  const [customFps, setCustomFps] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState<{ preset: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await renderSettingsApi.get(scriptId)
      setPresets(res.presets || {})
      setGrading(res.grading || {})
      setHardware(res.hardware || null)
      setCurrent(res.current || null)
      setSelected(res.current?.preset === 'custom' ? 'custom' : res.current?.preset || null)
      if (res.current?.preset === 'custom') {
        setCustomW(String(res.current.width))
        setCustomH(String(res.current.height))
        setCustomFps(String(res.current.fps))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings')
    }
  }, [scriptId])

  useEffect(() => {
    void load()
  }, [load])

  // Scenes that would be invalidated by a format change
  const affected = scenes.filter(
    (s) => s.status === 'complete' || s.status === 'queued' || s.status === 'rendering',
  )
  const aspectChanges = current && selected && current.preset !== selected

  const apply = useCallback(
    async (preset: string) => {
      setSaving(true)
      setError(null)
      try {
        const body: Record<string, unknown> = { preset }
        if (preset === 'custom') {
          const w = Number(customW), h = Number(customH), f = Number(customFps)
          if (!w || !h || !f) {
            setError('Custom needs width, height, and FPS')
            setSaving(false)
            return
          }
          body.width = w; body.height = h; body.fps = f
        }
        const res = await renderSettingsApi.set(scriptId, body as any)
        setCurrent(res.current)
        setSelected(res.current.preset)
        setSavedFlash(true)
        setTimeout(() => setSavedFlash(false), 1500)
        onSaved?.()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save')
      } finally {
        setSaving(false)
        setPendingConfirm(null)
      }
    },
    [scriptId, customW, customH, customFps, onSaved],
  )

  const choose = useCallback(
    (key: string) => {
      const g = grading[key]
      if (g?.verdict === 'exceeds') {
        setPendingConfirm({ preset: '__exceeds__' })
        setSelected(key)  // temp: shows in dialog context
        return
      }
      if (affected.length > 0 && current && key !== current.preset) {
        setPendingConfirm({ preset: key })
        return
      }
      void apply(key)
    },
    [grading, affected.length, current, apply],
  )

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto scrollbar-thin">
        <div className="px-5 pt-5 pb-3 border-b border-zinc-800 flex items-start justify-between">
          <div>
            <div className="text-sm font-semibold text-zinc-100">Project Settings</div>
            <div className="text-xs text-zinc-500 mt-0.5">{projectTitle}</div>
          </div>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 text-lg leading-none">x</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Current format summary */}
          {current && (
            <div className="text-xs text-zinc-400 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5">
              Currently rendering at{' '}
              <span className="text-zinc-200 font-mono">{current.width}x{current.height}</span> @{' '}
              <span className="text-zinc-200 font-mono">{current.fps}fps</span>
              <span className="text-zinc-600"> (from {current.source === 'project' ? 'project preset' : 'template default'})</span>
            </div>
          )}

          {/* Preset grid */}
          <div>
            <div className="text-[10px] font-medium text-zinc-500 mb-2 tracking-[1px] uppercase">
              Output format — applies to every scene
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(presets).map(([key, p]) => {
                const active = selected === key && current?.preset === key
                const g = grading[key]
                const verdict = g?.verdict || 'recommended'
                const isExceeds = verdict === 'exceeds'
                const isHeavy = verdict === 'heavy'
                return (
                  <button
                    key={key}
                    onClick={() => choose(key)}
                    disabled={saving}
                    title={g?.reason || p.note}
                    className={`text-left px-3 py-2.5 rounded-xl border transition-all ${
                      isExceeds
                        ? 'border-zinc-800 bg-zinc-950 opacity-40 hover:opacity-60'
                        : active
                          ? 'border-emerald-600/60 bg-emerald-600/10'
                          : isHeavy
                            ? 'border-yellow-700/40 hover:border-yellow-700 bg-zinc-950'
                            : 'border-zinc-800 hover:border-zinc-700 bg-zinc-950'
                    }`}
                  >
                    <div className={`text-xs font-medium flex items-center gap-1.5 ${
                      isExceeds ? 'text-zinc-600' : active ? 'text-emerald-400' : isHeavy ? 'text-yellow-500' : 'text-zinc-200'
                    }`}>
                      {p.label}
                      {isHeavy && (
                        <span className="text-[8px] px-1 py-px rounded bg-yellow-900/40 text-yellow-500 uppercase">Slow</span>
                      )}
                      {isExceeds && (
                        <span className="text-[8px] px-1 py-px rounded bg-red-900/40 text-red-500 uppercase">Not rec.</span>
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-600 mt-0.5">
                      {p.width && p.height ? `${p.width}x${p.height} · ${p.fps}fps` : 'Set custom size'}
                    </div>
                    <div className="text-[9px] text-zinc-700 leading-tight mt-0.5">{p.note}</div>
                  </button>
                )
              })}
            </div>
            {hardware && (
              <div className="text-[10px] text-zinc-600 mt-2">
                Graded for {hardware.gpu_name || 'your GPU'}
                {hardware.vram_total_gb ? ` (${hardware.vram_total_gb.toFixed(0)}GB)` : ''} — grayed presets exceed this
                hardware or the model's supported resolution.
              </div>
            )}
          </div>

          {/* Custom inputs */}
          {selected === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="number" placeholder="W" value={customW} onChange={(e) => setCustomW(e.target.value)}
                className="w-20 bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1.5 text-xs text-zinc-200 text-center focus:outline-none focus:border-zinc-600" />
              <span className="text-xs text-zinc-600">x</span>
              <input type="number" placeholder="H" value={customH} onChange={(e) => setCustomH(e.target.value)}
                className="w-20 bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1.5 text-xs text-zinc-200 text-center focus:outline-none focus:border-zinc-600" />
              <input type="number" placeholder="FPS" value={customFps} onChange={(e) => setCustomFps(e.target.value)}
                className="w-16 bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1.5 text-xs text-zinc-200 text-center focus:outline-none focus:border-zinc-600" />
            </div>
          )}

          {savedFlash && (
            <div className="text-xs text-emerald-400">Saved.</div>
          )}
        </div>
      </div>

      {/* Change warning / exceeds confirmation */}
      {(pendingConfirm || (selected && grading[selected]?.verdict === 'exceeds' && pendingConfirm)) && (
        <ChangeWarningDialog
          pending={pendingConfirm}
          grading={grading}
          selected={selected}
          current={current}
          affectedCount={affected.length}
          totalScenes={scenes.length}
          hasFrames={scenes.some((s) => s.initial_frame_url)}
          hardware={hardware}
          presets={presets}
          onCancel={() => {
            setPendingConfirm(null)
            setSelected(current?.preset || null)
          }}
          onConfirm={() => {
            if (pendingConfirm) void apply(pendingConfirm.preset)
          }}
        />
      )}
    </div>
  )
}

// ── Warning dialog shared by change-warnings and exceeds-hardware case ──

function ChangeWarningDialog({
  pending,
  grading,
  selected,
  current,
  affectedCount,
  totalScenes,
  hasFrames,
  hardware,
  presets,
  onCancel,
  onConfirm,
}: {
  pending: { preset: string } | null
  grading: Record<string, Grading>
  selected: string | null
  current: Current | null
  affectedCount: number
  totalScenes: number
  hasFrames: boolean
  hardware: { gpu_name: string | null; vram_total_gb: number | null } | null
  presets: Record<string, Preset>
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!pending || !selected) return null
  const key = pending.preset === '__exceeds__' ? selected : pending.preset
  const g = grading[key]
  const isExceeds = g?.verdict === 'exceeds'
  const preset = presets[key]
  const changing = current && current.preset !== key

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full">
        {isExceeds ? (
          <>
            <div className="text-sm font-semibold text-yellow-500 mb-2">
              {preset?.label} is not recommended for your hardware
            </div>
            <div className="text-xs text-zinc-500 mb-4 leading-relaxed">
              {g?.reason} Renders may fail or take extremely long.
              {hardware?.vram_total_gb ? ` Recommended maximum for ${hardware.vram_total_gb.toFixed(0)}GB is around 1440p with this model.` : ''}
            </div>
          </>
        ) : changing ? (
          <>
            <div className="text-sm font-semibold text-zinc-100 mb-2">
              Change output format to {preset?.label}?
            </div>
            <div className="text-xs text-zinc-500 mb-3 leading-relaxed space-y-2">
              {affectedCount > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2 text-yellow-500">
                  {affectedCount} of {totalScenes} scene{totalScenes === 1 ? '' : 's'} already rendered or queued —
                  they will need to be re-submitted for rendering at the new format.
                </div>
              )}
              {hasFrames && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2 text-yellow-500 rounded-lg">
                  Initial frames were generated for the current aspect ratio — they will be cropped or padded to fit{' '}
                  {preset?.width}x{preset?.height}.
                </div>
              )}
              {affectedCount === 0 && !hasFrames && (
                <div>No scenes are rendered yet — this change is safe to apply now.</div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="text-sm font-semibold text-zinc-100 mb-2">Keep {preset?.label}?</div>
            <div className="text-xs text-zinc-500 mb-4">This is already the active format.</div>
          </>
        )}
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium rounded-xl transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-xl transition-all ${
              isExceeds
                ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400'
                : 'bg-brand-600 hover:bg-brand-500 text-white'
            }`}
          >
            {isExceeds ? 'Use anyway' : 'Change format'}
          </button>
        </div>
      </div>
    </div>
  )
}