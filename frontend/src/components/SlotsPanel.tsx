// Workflow slots panel — named parameter fields for the LTX template
// (roadmap #1: slot-based template editing, mirroring comfy-mcp's slot model).
// Per-scene slots (prompt, duration) show as read-only "per scene" rows.

import { useCallback, useEffect, useState } from 'react'
import { comfyuiApi, renderSettingsApi } from '../api'
import type { WorkflowSlot } from '../types'

interface SlotsPanelProps {
  /** When true, the panel auto-loads slots on mount */
  autoLoad?: boolean
  /** Project (script) ID — required for project-level render settings */
  scriptId?: string
}

export default function SlotsPanel({ autoLoad = true, scriptId }: SlotsPanelProps) {
  const [slots, setSlots] = useState<WorkflowSlot[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState<string | null>(null)

  const loadSlots = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await comfyuiApi.slots()
      setSlots(res.slots || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load workflow slots')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (autoLoad) void loadSlots()
  }, [autoLoad, loadSlots])

  // Project render settings (resolution + FPS are project-level, Gui 2026-09-07)
  const [presets, setPresets] = useState<Record<string, { label: string; width: number | null; height: number | null; fps: number | null; note: string }>>({})
  const [current, setCurrent] = useState<{ preset: string; width: number; height: number; fps: number; source: string } | null>(null)
  const [customW, setCustomW] = useState<string>('')
  const [customH, setCustomH] = useState<string>('')
  const [customFps, setCustomFps] = useState<string>('')
  const [savingPreset, setSavingPreset] = useState(false)
  const [fps_options, setFpsOptions] = useState<Array<{ fps: number; label: string; note: string }>>([])
  const [hardware, setHardware] = useState<{ gpu_name: string | null; vram_total_gb: number | null } | null>(null)

  const loadProjectSettings = useCallback(async () => {
    if (!scriptId) return
    try {
      const res = await renderSettingsApi.get(scriptId)
      setPresets(res.presets || {})
      setHardware(res.hardware || null)
      setFpsOptions(res.fps_options || [])
      setCurrent(res.current || null)
      if (res.current?.preset === 'custom') {
        setCustomW(String(res.current.width))
        setCustomH(String(res.current.height))
        setCustomFps(String(res.current.fps))
      }
    } catch (e) {
      console.error('Failed to load render settings:', e)
    }
  }, [scriptId])

  const applyPreset = useCallback(async (preset: string) => {
    if (!scriptId) return
    setSavingPreset(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { preset }
      if (preset === 'custom') {
        const w = Number(customW), h = Number(customH), f = Number(customFps)
        if (!w || !h || !f) {
          setError('Custom needs width, height, and FPS')
          setSavingPreset(false)
          return
        }
        body.width = w; body.height = h; body.fps = f
      }
      const res = await renderSettingsApi.set(scriptId, body as any)
      setCurrent(res.current)
      setSavedFlash('preset')
      setTimeout(() => setSavedFlash((cur) => (cur === 'preset' ? null : cur)), 1500)
      // Reload template slots too — geometry defaults may have shifted
      void loadSlots()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save render settings')
    } finally {
      setSavingPreset(false)
    }
  }, [scriptId, customW, customH, customFps, loadSlots])

  useEffect(() => {
    void loadProjectSettings()
  }, [loadProjectSettings])

  // FPS is independent of resolution (unbound, Gui 2026-09-07): save fps only,
  // keeping the current preset/width/height untouched.
  const applyFps = useCallback(async (fps: number) => {
    if (!scriptId) return
    setSavingPreset(true)
    setError(null)
    try {
      const res = await renderSettingsApi.set(scriptId, { preset: current?.preset || 'custom', fps })
      setCurrent(res.current)
      setSavedFlash('fps')
      setTimeout(() => setSavedFlash((cur) => (cur === 'fps' ? null : cur)), 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save frame rate')
    } finally {
      setSavingPreset(false)
    }
  }, [scriptId, current?.preset])

  const persist = useCallback(
    async (slot: WorkflowSlot, value: number | boolean) => {
      setSaving(slot.node_id)
      setError(null)
      try {
        await comfyuiApi.setSlot(slot.node_id, value)
        setSlots((prev) =>
          prev.map((s) => (s.node_id === slot.node_id ? { ...s, value } : s)),
        )
        setSavedFlash(slot.node_id)
        setTimeout(() => setSavedFlash((cur) => (cur === slot.node_id ? null : cur)), 1500)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save slot')
        // Reload to resync with the backend's authoritative value
        void loadSlots()
      } finally {
        setSaving(null)
      }
    },
    [loadSlots],
  )

  const editableSlots = slots.filter((s) => s.editable)
  const perSceneSlots = slots.filter((s) => !s.editable)

  const renderControl = (slot: WorkflowSlot) => {
    if (saving === slot.node_id) {
      return <span className="text-[10px] text-zinc-500 tracking-[0.8px] uppercase">Saving</span>
    }
    if (savedFlash === slot.node_id) {
      return <span className="text-[10px] text-emerald-400 tracking-[0.8px] uppercase">Saved</span>
    }
    if (slot.type === 'bool') {
      const on = slot.value === true
      return (
        <button
          onClick={() => void persist(slot, !on)}
          disabled={saving !== null}
          className={`relative w-9 h-5 rounded-full transition-colors disabled:opacity-40 ${
            on ? 'bg-emerald-600' : 'bg-zinc-700'
          }`}
          aria-label={slot.label}
        >
          <span
            className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all ${
              on ? 'left-[18px]' : 'left-0.5'
            }`}
          />
        </button>
      )
    }
    if (slot.type === 'int' || slot.type === 'float') {
      return (
        <input
          type="number"
          min={slot.min}
          max={slot.max}
          defaultValue={Number(slot.value)}
          onBlur={(e) => {
            const next = Number(e.target.value)
            if (!Number.isNaN(next) && next !== Number(slot.value)) {
              void persist(slot, slot.type === 'int' ? Math.round(next) : next)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          disabled={saving !== null}
          className="w-14 bg-zinc-950 border border-zinc-800 rounded-md px-2 py-0.5 text-xs text-zinc-200 text-center focus:outline-none focus:border-zinc-600 disabled:opacity-40"
        />
      )
    }
    return <span className="text-xs text-zinc-500 font-mono">{String(slot.value)}</span>
  }

  const renderRow = (slot: WorkflowSlot, locked: boolean) => (
    <div
      key={slot.node_id}
      className="flex items-center gap-3 py-2 border-b border-zinc-800/60 last:border-b-0"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-200 font-medium">{slot.label}</span>
          {locked && (
            <span className="text-[9px] text-zinc-600 tracking-[0.8px] uppercase border border-zinc-800 rounded px-1.5 py-px">
              per scene
            </span>
          )}
        </div>
        <div className="text-[10px] text-zinc-600 leading-snug mt-0.5">{slot.description}</div>
      </div>
      <div className="flex-shrink-0">
        {locked ? (
          <span className="text-xs text-zinc-600 font-mono">
            {slot.overridden_by || 'scene data'}
          </span>
        ) : (
          renderControl(slot)
        )}
      </div>
    </div>
  )

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-zinc-900 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-zinc-400 tracking-[1px] uppercase">
            Workflow Settings
          </span>
          <span className="text-[10px] text-zinc-600">
            {editableSlots.length} template params
          </span>
        </div>
        <div className="flex items-center gap-2">
          {error && (
            <span className="text-[10px] text-red-400 max-w-[220px] truncate">{error}</span>
          )}
          <span className="text-xs text-zinc-600">{expanded ? 'Close' : 'Edit'}</span>
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-zinc-800">
          {loading ? (
            <div className="py-3 text-[11px] text-zinc-500">Loading workflow slots...</div>
          ) : (
            <>
              {/* ── 1. Frame size (resolution) — applies to ALL scenes ── */}
              {scriptId && (
                <div className="pt-2 pb-3 border-b border-zinc-800">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[9px] text-zinc-500 tracking-[1px] uppercase">
                      1. Frame size — applies to every scene
                    </span>
                    {savedFlash === 'preset' && (
                      <span className="text-[10px] text-emerald-400 tracking-[0.8px] uppercase">Saved</span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {Object.entries(presets).map(([key, p]) => {
                      const active = current?.preset === key
                      return (
                        <button
                          key={key}
                          onClick={() => void applyPreset(key)}
                          disabled={savingPreset}
                          title={presets[key]?.note}
                          className={`text-left px-2.5 py-2 rounded-lg border transition-all disabled:opacity-40 ${
                            active
                              ? 'border-emerald-600/60 bg-emerald-600/10'
                              : 'border-zinc-800 hover:border-zinc-700 bg-zinc-950'
                          }`}
                        >
                          <div className={`text-[11px] font-medium ${active ? 'text-emerald-400' : 'text-zinc-200'}`}>
                            {presets[key].label}
                          </div>
                          <div className="text-[9px] text-zinc-600 mt-0.5">
                            {presets[key].width && presets[key].height
                              ? `${presets[key].width}x${presets[key].height}`
                              : 'Set custom size'}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  {current?.preset === 'custom' && (
                    <div className="flex items-center gap-2 mt-2">
                      <input type="number" placeholder="W" value={customW} onChange={(e) => setCustomW(e.target.value)}
                        className="w-16 bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1 text-xs text-zinc-200 text-center focus:outline-none focus:border-zinc-600" />
                      <span className="text-xs text-zinc-600">x</span>
                      <input type="number" placeholder="H" value={customH} onChange={(e) => setCustomH(e.target.value)}
                        className="w-16 bg-zinc-950 border border-zinc-800 rounded-md px-2 py-1 text-xs text-zinc-200 text-center focus:outline-none focus:border-zinc-600" />
                      <button onClick={() => void applyPreset('custom')} disabled={savingPreset}
                        className="px-3 py-1 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-[10px] font-semibold rounded-md transition-all">
                        Apply
                      </button>
                    </div>
                  )}
                  {current && current.preset !== 'custom' && (
                    <button
                      onClick={() => void applyPreset('custom')}
                      className="mt-2 text-[10px] text-zinc-600 hover:text-zinc-400 tracking-[0.8px] uppercase transition-colors"
                    >
                      Custom size instead
                    </button>
                  )}
                </div>
              )}

              {/* ── 2. Frame rate — independent of resolution ── */}
              {scriptId && (
                <div className="pt-2 pb-3 border-b border-zinc-800">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[9px] text-zinc-500 tracking-[1px] uppercase">
                      2. Frame rate
                    </span>
                    {savedFlash === 'fps' && (
                      <span className="text-[10px] text-emerald-400 tracking-[0.8px] uppercase">Saved</span>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(fps_options.length > 0
                      ? fps_options
                      : [{ fps: 12, label: '12 fps', note: '' }, { fps: 24, label: '24 fps', note: '' }, { fps: 30, label: '30 fps', note: '' }, { fps: 60, label: '60 fps', note: '' }]
                    ).map((opt) => {
                      const active = current?.fps === opt.fps
                      return (
                        <button
                          key={opt.fps}
                          onClick={() => void applyFps(opt.fps)}
                          disabled={savingPreset}
                          title={opt.note}
                          className={`text-left px-2.5 py-2 rounded-lg border transition-all disabled:opacity-40 ${
                            active
                              ? 'border-emerald-600/60 bg-emerald-600/10'
                              : 'border-zinc-800 hover:border-zinc-700 bg-zinc-950'
                          }`}
                        >
                          <div className={`text-[11px] font-medium ${active ? 'text-emerald-400' : 'text-zinc-200'}`}>
                            {opt.label}
                          </div>
                          {opt.note && <div className="text-[9px] text-zinc-700 leading-tight mt-0.5">{opt.note}</div>}
                        </button>
                      )
                    })}
                  </div>
                  {current && (
                    <div className="text-[10px] text-zinc-600 mt-1.5">
                      Rendering at <span className="text-zinc-400 font-mono">{current.width}x{current.height}</span> @ <span className="text-zinc-400 font-mono">{current.fps}fps</span>
                      {' '}(from {current.source === 'project' ? 'project preset' : 'template default'})
                    </div>
                  )}
                </div>
              )}

              {/* ── Template-level workflow slots ── */}
              <div className="pt-1">
                {editableSlots.map((s) => renderRow(s, false))}
              </div>
              {perSceneSlots.length > 0 && (
                <>
                  <div className="text-[9px] text-zinc-600 tracking-[1px] uppercase mt-3 mb-0.5">
                    Set per scene
                  </div>
                  {perSceneSlots.map((s) => renderRow(s, true))}
                </>
              )}
              <button
                onClick={() => void loadSlots()}
                className="mt-2 text-[10px] text-zinc-600 hover:text-zinc-400 tracking-[0.8px] uppercase transition-colors"
              >
                Reload from workflow
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}