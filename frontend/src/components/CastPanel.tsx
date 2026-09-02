import { useState } from 'react'

export interface CastCharacter {
  id: string
  name: string
  type: 'character' | 'narrator'
  traits: Record<string, string>
  voice_id: string | null
  voice_locked: boolean
}

export interface CatalogVoice {
  voice_id: string
  display_name: string
  type: string
  traits: { gender: string; age_band: string }
  control_prompts?: string[]
}

interface CastPanelProps {
  characters: CastCharacter[]
  voices: CatalogVoice[]
  scriptId: string
  version: number
  onChanged: () => void
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

export default function CastPanel({
  characters, voices, scriptId, version, onChanged, showToast,
}: CastPanelProps) {
  const [previewing, setPreviewing] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewChar, setPreviewChar] = useState<string | null>(null)
  const [autoCasting, setAutoCasting] = useState(false)

  const voiceById = Object.fromEntries(voices.map((v) => [v.voice_id, v]))

  const patchCharacter = async (characterId: string, updates: Record<string, unknown>) => {
    try {
      const res = await fetch(
        `/api/writing/scripts/${scriptId}/versions/${version}/characters/${characterId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        },
      )
      if (!res.ok) throw new Error(await res.text())
      onChanged()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to update character', 'error')
    }
  }

  const handleAutoCast = async () => {
    if (autoCasting) return
    setAutoCasting(true)
    try {
      const res = await fetch(
        `/api/writing/scripts/${scriptId}/versions/${version}/autocast`,
        { method: 'POST' },
      )
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Auto-cast failed')
      const data = await res.json()
      showToast(`Auto-cast ${data.assignments.length} character${data.assignments.length === 1 ? '' : 's'}`, 'success')
      onChanged()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Auto-cast failed', 'error')
    } finally {
      setAutoCasting(false)
    }
  }

  const handlePreview = async (character: CastCharacter) => {
    if (previewing) return
    setPreviewing(character.id)
    try {
      const res = await fetch('/api/writing/voice-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `Hello. I am the voice of ${character.name}. This is how I will sound in your video.`,
          voice_id: character.voice_id,
          character_name: character.name,
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Preview failed')
      const data = await res.json()
      setPreviewUrl(data.preview_url)
      setPreviewChar(character.id)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Preview failed', 'error')
    } finally {
      setPreviewing(null)
    }
  }

  return (
    <div className="w-80 flex-shrink-0 border-l border-zinc-800 bg-zinc-950 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-zinc-100 tracking-tight">Cast</div>
          <button
            onClick={handleAutoCast}
            disabled={autoCasting}
            className="px-3 py-1.5 text-[11px] bg-brand-600/20 hover:bg-brand-600/30 text-brand-400 font-medium rounded-lg transition-all disabled:opacity-40"
          >
            {autoCasting ? 'Casting...' : 'Auto-assign'}
          </button>
        </div>
        <div className="text-[10px] text-zinc-600 mt-1">
          Voices from your VoxCPM2 catalog · previews are generated on demand
        </div>
      </div>

      {/* Character list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2">
        {characters.length === 0 && (
          <div className="text-center py-10 text-zinc-600 text-xs">
            No characters detected in this script.
          </div>
        )}
        {characters.map((c) => {
          const voice = c.voice_id ? voiceById[c.voice_id] : null
          return (
            <div
              key={c.id}
              className={`rounded-xl border p-3 transition-all ${
                c.type === 'narrator'
                  ? 'border-sky-500/25 bg-sky-500/5'
                  : 'border-zinc-800 bg-zinc-900/60'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`font-medium text-[13px] tracking-[0.5px] truncate ${
                    c.type === 'narrator' ? 'text-sky-300' : 'text-zinc-200'
                  }`}>
                    {c.name}
                  </span>
                  <span className={`text-[8px] px-1.5 py-0.5 rounded-full uppercase tracking-[0.5px] font-medium flex-shrink-0 ${
                    c.type === 'narrator' ? 'bg-sky-500/20 text-sky-400' : 'bg-zinc-800 text-zinc-500'
                  }`}>
                    {c.type}
                  </span>
                </div>
                {voice && (
                  <button
                    onClick={() => patchCharacter(c.id, { voice_id: null })}
                    className="text-[9px] text-zinc-600 hover:text-zinc-400 transition-colors flex-shrink-0"
                    title="Clear voice"
                  >
                    clear
                  </button>
                )}
              </div>

              {/* Traits */}
              <div className="flex gap-1.5 mb-2 flex-wrap">
                {c.traits?.gender && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">{c.traits.gender}</span>
                )}
                {c.traits?.age_band && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">{c.traits.age_band}</span>
                )}
                {c.traits?.description && (
                  <span className="text-[9px] text-zinc-600 truncate w-full" title={c.traits.description}>
                    {c.traits.description}
                  </span>
                )}
              </div>

              {/* Voice selector */}
              <select
                value={c.voice_id ?? ''}
                onChange={(e) => patchCharacter(c.id, { voice_id: e.target.value || null })}
                className={`w-full bg-zinc-950 border rounded-lg px-2.5 py-1.5 text-[11px] focus:outline-none text-zinc-300 ${
                  c.voice_id ? 'border-emerald-500/30' : 'border-zinc-800'
                }`}
              >
                <option value="">— pick a voice —</option>
                {voices.map((v) => (
                  <option key={v.voice_id} value={v.voice_id}>
                    {v.display_name}
                    {v.traits?.gender ? ` (${v.traits.gender})` : ''}
                  </option>
                ))}
              </select>

              {/* Actions */}
              <div className="flex items-center gap-1.5 mt-2">
                <button
                  onClick={() => handlePreview(c)}
                  disabled={previewing !== null}
                  className="flex-1 px-2 py-1.5 text-[10px] bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-lg transition-all disabled:opacity-40"
                >
                  {previewing === c.id ? 'Generating...' : 'Preview'}
                </button>
                <label className="flex items-center gap-1 text-[9px] text-zinc-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={c.voice_locked ?? false}
                    onChange={(e) => patchCharacter(c.id, { voice_locked: e.target.checked })}
                    className="accent-emerald-500 w-3 h-3"
                  />
                  lock
                </label>
              </div>

              {/* Per-character preview player */}
              {previewChar === c.id && previewUrl && previewing === null && (
                <audio key={previewUrl} controls autoPlay className="w-full mt-2 h-8">
                  <source src={previewUrl} type="audio/mpeg" />
                </audio>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}