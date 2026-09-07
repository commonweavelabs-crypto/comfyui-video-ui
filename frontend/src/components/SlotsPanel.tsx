// Workflow slots panel — named parameter fields for the LTX template
// (roadmap #1: slot-based template editing, mirroring comfy-mcp's slot model).
// Per-scene slots (prompt, duration) show as read-only "per scene" rows.

import { useCallback, useEffect, useState } from 'react'
import { comfyuiApi } from '../api'
import type { WorkflowSlot } from '../types'

interface SlotsPanelProps {
  /** When true, the panel auto-loads slots on mount */
  autoLoad?: boolean
}

export default function SlotsPanel({ autoLoad = true }: SlotsPanelProps) {
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