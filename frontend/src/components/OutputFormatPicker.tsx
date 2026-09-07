// Shared output-format picker — ONE component used by every surface that edits
// a project's canvas settings (Gui 2026-09-07: "these should be instances of the
// same menu, not separate menus I have to update 4 times").
//
// Sections: 1. Frame size (graded presets + custom WxH) · 2. Frame rate
// (12/24/30/60 + custom, hardware-capped, model-ceiling rejected).
//
// Surfaces:
//  - ProjectSettingsModal (Timeline Settings button / Library row Settings)
//  - WorkflowWizard step 0 (creation — required before Create)
//  - Landing "New empty project" panel (creation — required before Create)
//
// Mode A (project): scriptId given → edits live via PUT render-settings.
// Mode B (creation): scriptId omitted → selection held in parent state via
// onChange; the parent persists it right after scriptsApi.create().

import { useCallback, useEffect, useState } from 'react'
import { renderSettingsApi } from '../api'
import type { Scene } from '../types'

type Preset = { label: string; width: number | null; height: number | null; note: string }
type Grading = { verdict: string; reason: string }
type FpsOption = { fps: number; label: string; note: string }

export interface OutputFormatSelection {
  preset: string | null      // preset key, or 'custom' when W/H filled
  width: number | null
  height: number | null
  fps: number | null
}

interface OutputFormatPickerProps {
  /** Project id — omit for creation mode (selection managed by parent) */
  scriptId?: string
  /** Creation mode: lift selection to the parent */
  onChange?: (sel: OutputFormatSelection) => void
  /** Scenes for change-impact warnings (project mode only) */
  scenes?: Scene[]
  /** Fire after a successful save (project mode) */
  onSaved?: () => void
  /** Compact variant hides the per-option notes */
  compact?: boolean
  /** External control (creation mode) */
  selection?: OutputFormatSelection | null
}

export default function OutputFormatPicker({
  scriptId,
  onChange,
  scenes,
  onSaved,
  compact = false,
  selection,
}: OutputFormatPickerProps) {
  const isProjectMode = Boolean(scriptId)

  const [presets, setPresets] = useState<Record<string, Preset>>({})
  const [grading, setGrading] = useState<Record<string, Grading>>({})
  const [hardware, setHardware] = useState<{ gpu_name: string | null; vram_total_gb: number | null } | null>(null)
  const [fpsOptions, setFpsOptions] = useState<FpsOption[]>([])
  const [fpsCap, setFpsCap] = useState<number>(50)
  const [fpsModelCeiling, setFpsModelCeiling] = useState<number>(50)
  const [current, setCurrent] = useState<{ preset: string; width: number; height: number; fps: number; source: string } | null>(null)
  const [loading, setLoading] = useState(isProjectMode)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState<string | null>(null)

  // Custom size inputs (project mode: applied immediately; creation mode: parent state)
  const [customW, setCustomW] = useState('')
  const [customH, setCustomH] = useState('')
  const [customFps, setCustomFps] = useState('')

  // ── Project mode: load + save via API ──
  const load = useCallback(async () => {
    if (!scriptId) return
    setLoading(true)
    try {
      const res = await renderSettingsApi.get(scriptId)
      setPresets(res.presets || {})
      setGrading(res.grading || {})
      setHardware(res.hardware || null)
      setFpsOptions(res.fps_options || [])
      setFpsCap(res.fps_cap ?? 50)
      setFpsModelCeiling(res.fps_model_ceiling ?? 50)
      setCurrent(res.current || null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [scriptId])

  useEffect(() => {
    // Load graded presets in BOTH modes (creation mode needs grading + fps options)
    if (isProjectMode) {
      void load()
    } else {
      fetch('/api/scripts/render-presets')
        .then((r) => r.json())
        .then((res) => {
          setPresets(res.presets || {})
          setGrading(res.grading || {})
          setHardware(res.hardware || null)
          setFpsOptions(res.fps_options || [])
          setFpsCap(res.fps_cap ?? 50)
          setFpsModelCeiling(res.fps_model_ceiling ?? 50)
        })
        .catch(() => {/* non-fatal */})
    }
  }, [isProjectMode, load])

  const flash = useCallback((key: string) => {
    setSavedFlash(key)
    setTimeout(() => setSavedFlash((cur) => (cur === key ? null : cur)), 1500)
  }, [])

  // ── Project mode save ──
  const saveProject = useCallback(
    async (preset: string, fps?: number, width?: number, height?: number) => {
      if (!scriptId) return
      setSaving(true)
      setError(null)
      try {
        const body: Record<string, unknown> = { preset }
        if (fps !== undefined) body.fps = fps
        if (width !== undefined) body.width = width
        if (height !== undefined) body.height = height
        const res = await renderSettingsApi.set(scriptId, body as any)
        setCurrent(res.current)
        onSaved?.()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save')
      } finally {
        setSaving(false)
      }
    },
    [scriptId, onSaved],
  )

  // ── Selection handlers ──
  const selectPreset = useCallback(
    (key: string) => {
      const p = presets[key]
      if (!p) return
      if (isProjectMode) {
        void saveProject(key)
        flash(key)
      } else {
        const sel: OutputFormatSelection = {
          preset: key,
          width: p.width,
          height: p.height,
          fps: selection?.fps ?? null,
        }
        onChange?.(sel)
      }
    },
    [presets, isProjectMode, saveProject, flash, onChange, selection?.fps],
  )

  const applyCustomSize = useCallback(() => {
    const w = Number(customW), h = Number(customH)
    if (!w || !h) {
      setError('Custom size needs width and height')
      return
    }
    if (isProjectMode) {
      void saveProject('custom', undefined, w, h)
      flash('custom')
    } else {
      onChange?.({
        preset: 'custom',
        width: w,
        height: h,
        fps: selection?.fps ?? null,
      })
    }
  }, [customW, customH, isProjectMode, saveProject, flash, onChange, selection?.fps])

  const selectFps = useCallback(
    (fps: number, isCustom = false) => {
      if (isCustom && fps > fpsCap) {
        if (!window.confirm(
          `${fps}fps is above the recommended maximum (${fpsCap}fps) for ` +
          `${hardware?.vram_total_gb?.toFixed(0) || 'this'}GB — expect very long renders. Use it anyway?`
        )) {
          return
        }
      }
      if (isProjectMode) {
        void saveProject(current?.preset || 'custom', fps)
        flash('fps')
      } else {
        onChange?.({
          preset: selection?.preset ?? null,
          width: selection?.width ?? null,
          height: selection?.height ?? null,
          fps,
        })
      }
    },
    [fpsCap, hardware, isProjectMode, saveProject, flash, onChange, selection, current?.preset],
  )

  const applyCustomFps = useCallback(() => {
    const f = Number(customFps)
    if (!f || f < 1) {
      setError('Enter a valid frame rate')
      return
    }
    if (f > fpsModelCeiling) {
      setError(`This model's tested envelope tops out around ${fpsModelCeiling}fps — higher values are untested and may fail.`)
      return
    }
    setCustomFps('')
    selectFps(f, true)
  }, [customFps, fpsModelCeiling, selectFps])

  // Effective selection (project mode reads from `current`; creation mode from props)
  const selPreset = isProjectMode ? current?.preset : selection?.preset
  const selWidth = isProjectMode ? current?.width : selection?.width
  const selHeight = isProjectMode ? current?.height : selection?.height
  const selFps = isProjectMode ? current?.fps : selection?.fps
  const isCustomActive = selPreset === 'custom'

  const affectedCount = (scenes || []).filter(
    (s) => s.status === 'complete' || s.status === 'queued' || s.status === 'rendering',
  ).length

  return (
    <div className="space-y-3">
      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* ── 1. Frame size ── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-medium text-zinc-500 tracking-[1px] uppercase">
            1. Frame size — where is this going?
          </span>
          {savedFlash && savedFlash !== 'fps' && (
            <span className="text-[10px] text-emerald-400 tracking-[0.8px] uppercase">Saved</span>
          )}
        </div>
        <div className={`grid ${compact ? 'grid-cols-2' : 'grid-cols-3'} gap-1.5`}>
          {Object.entries(presets).map(([key, p]) => {
            const active = selPreset === key
            const verdict = grading[key]?.verdict || 'recommended'
            const isExceeds = verdict === 'exceeds'
            const isHeavy = verdict === 'heavy'
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (isExceeds && !window.confirm(
                    `${p.label} exceeds this model's supported resolution — renders will likely fail. Select it anyway?`
                  )) {
                    return
                  }
                  selectPreset(key)
                }}
                title={grading[key]?.reason || p.note}
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
                  {p.label}
                  {isHeavy && (
                    <span className="text-[8px] px-1 py-px rounded bg-yellow-900/40 text-yellow-500 tracking-[0.5px] uppercase">Slow</span>
                  )}
                  {isExceeds && (
                    <span className="text-[8px] px-1 py-px rounded bg-red-900/40 text-red-500 tracking-[0.5px] uppercase">Not rec.</span>
                  )}
                </div>
                <div className="text-[9px] text-zinc-600 mt-0.5">
                  {p.width && p.height ? `${p.width}x${p.height}` : 'Set size manually'}
                </div>
                {!compact && p.note && (
                  <div className="text-[9px] text-zinc-700 leading-tight mt-0.5">{p.note}</div>
                )}
              </button>
            )
          })}
        </div>

        {/* Custom size */}
        {isCustomActive && (
          <div className="flex items-center gap-2 mt-2">
            <input type="number" placeholder="W" value={customW} onChange={(e) => setCustomW(e.target.value)}
              className="w-16 bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1 text-xs text-zinc-200 text-center focus:outline-none focus:border-zinc-600" />
            <span className="text-xs text-zinc-600">x</span>
            <input type="number" placeholder="H" value={customH} onChange={(e) => setCustomH(e.target.value)}
              className="w-16 bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1 text-xs text-zinc-200 text-center focus:outline-none focus:border-zinc-600" />
            <button onClick={applyCustomSize} disabled={saving}
              className="px-3 py-1 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-[10px] font-semibold rounded-md transition-all">
              Apply
            </button>
          </div>
        )}
        {!isCustomActive && selPreset && (
          <button
            onClick={() => {
              if (isProjectMode) {
                void saveProject('custom')
                flash('custom')
              } else {
                onChange?.({ preset: 'custom', width: null, height: null, fps: selection?.fps ?? null })
              }
            }}
            className="mt-2 text-[10px] text-zinc-600 hover:text-zinc-400 tracking-[0.8px] uppercase transition-colors"
          >
            Custom size instead
          </button>
        )}

        {hardware?.vram_total_gb != null && (
          <div className="text-[10px] text-zinc-600 mt-1.5">
            Graded for {hardware.gpu_name || 'your GPU'} ({hardware.vram_total_gb.toFixed(0)}GB) — grayed presets
            exceed this hardware or the model&apos;s supported resolution.
          </div>
        )}
      </div>

      {/* ── 2. Frame rate ── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-medium text-zinc-500 tracking-[1px] uppercase">
            2. Frame rate — independent of size
          </span>
          {savedFlash === 'fps' && (
            <span className="text-[10px] text-emerald-400 tracking-[0.8px] uppercase">Saved</span>
          )}
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {(fpsOptions.length > 0
            ? fpsOptions
            : [
                { fps: 12, label: '12 fps', note: 'Stylized — fastest renders' },
                { fps: 24, label: '24 fps', note: 'Cinematic standard' },
                { fps: 30, label: '30 fps', note: 'Standard video' },
                { fps: 60, label: '60 fps', note: 'Smooth — heavy' },
              ]
          ).map((opt) => {
            const active = selFps === opt.fps
            const exceedsCap = opt.fps > fpsCap
            return (
              <button
                key={opt.fps}
                type="button"
                onClick={() => selectFps(opt.fps)}
                disabled={saving}
                title={exceedsCap
                  ? `Above the recommended maximum (${fpsCap}fps) for ${hardware?.vram_total_gb?.toFixed(0) || 'this'}GB — expect very long renders`
                  : opt.note}
                className={`text-left px-2.5 py-2 rounded-lg border transition-all ${
                  exceedsCap
                    ? 'border-zinc-800 bg-zinc-950 opacity-40 hover:opacity-60'
                    : active
                      ? 'border-emerald-600/60 bg-emerald-600/10'
                      : 'border-zinc-800 hover:border-zinc-700 bg-zinc-950'
                }`}
              >
                <div className={`text-[11px] font-medium flex items-center gap-1 ${
                  exceedsCap ? 'text-zinc-600' : active ? 'text-emerald-400' : 'text-zinc-200'
                }`}>
                  {opt.label}
                  {exceedsCap && (
                    <span className="text-[8px] px-1 py-px rounded bg-red-900/40 text-red-500 uppercase">Cap</span>
                  )}
                </div>
                {!compact && opt.note && (
                  <div className="text-[9px] text-zinc-700 leading-tight mt-0.5 line-clamp-2">{opt.note}</div>
                )}
              </button>
            )
          })}
        </div>

        {/* Custom fps */}
        <div className="flex items-center gap-2 mt-2">
          <input
            type="number"
            placeholder={`Custom (${fpsCap} max rec.)`}
            value={customFps}
            onChange={(e) => setCustomFps(e.target.value)}
            className="w-36 bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-600"
          />
          <button
            onClick={applyCustomFps}
            disabled={saving || !customFps}
            className="px-3 py-1 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-[10px] font-semibold rounded-md transition-all"
          >
            Apply custom
          </button>
        </div>

        {/* Cost note (Gui: "frame rates do cost") */}
        <div className="text-[10px] text-zinc-600 mt-2 leading-relaxed">
          Frame rate costs render time: frame count = duration x fps, so 60fps takes
          2.5x as long as 24fps on the same scene. This is the project&apos;s canvas —
          it applies to every initial frame and the final render.
          {isProjectMode && affectedCount > 0 && (
            <span className="text-yellow-500">
              {' '}Note: {affectedCount} scene{affectedCount === 1 ? '' : 's'} already rendered/queued will need re-submission after a format change.
            </span>
          )}
        </div>
      </div>
    </div>
  )
}