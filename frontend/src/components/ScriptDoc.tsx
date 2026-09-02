import { useMemo, useState } from 'react'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ScriptLine {
  seq: number
  type: 'heading' | 'direction' | 'character' | 'dialogue' | 'parenthetical'
  character_id: string | null
  text: string
}

export interface ScriptCharacter {
  id: string
  name: string
  type: 'character' | 'narrator'
  traits: Record<string, string>
}

export interface ScriptDocData {
  title: string
  raw_text: string
  lines: ScriptLine[]
  characters: ScriptCharacter[]
  script_id?: string
  version?: number
}

interface ScriptDocProps {
  data: ScriptDocData
  onBack: () => void
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
  onSaved?: (scriptId: string, version: number, forked: boolean) => void
}

const LINE_TYPES: ScriptLine['type'][] = ['heading', 'direction', 'character', 'dialogue', 'parenthetical']

const TYPE_STYLES: Record<ScriptLine['type'], string> = {
  heading: 'text-emerald-400/90 font-semibold uppercase tracking-[1.5px] text-[13px] pt-6 pb-1',
  direction: 'text-zinc-400 text-[13px] leading-relaxed py-0.5',
  character: 'text-zinc-100 font-semibold tracking-[1px] text-[13px] uppercase pt-4',
  parenthetical: 'text-zinc-500 italic text-[12px] pl-20',
  dialogue: 'text-zinc-200 text-[13px] leading-relaxed pl-16 pr-8 max-w-[70%]',
}

// Regenerate fountain raw_text from the (possibly edited) line list.
// Blank lines delimit blocks; character cues are uppercased.
function linesToRawText(lines: ScriptLine[]): string {
  const out: string[] = []
  let prevType: ScriptLine['type'] | null = null
  for (const l of lines) {
    const t = l.text.trim()
    if (!t) continue
    switch (l.type) {
      case 'heading':
        out.push('')
        out.push(t)
        break
      case 'direction':
        if (prevType === 'dialogue' || prevType === 'parenthetical' || prevType === 'character') out.push('')
        out.push(t)
        break
      case 'character':
        out.push('')
        out.push(t.toUpperCase())
        break
      case 'parenthetical':
        out.push(t.startsWith('(') ? `  ${t}` : `  (${t})`)
        break
      case 'dialogue':
        out.push(t)
        break
    }
    prevType = l.type
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function ScriptDoc({ data, onBack, showToast, onSaved }: ScriptDocProps) {
  const [title, setTitle] = useState(data.title)
  const [lines, setLines] = useState<ScriptLine[]>(data.lines)
  const [characters, setCharacters] = useState<ScriptCharacter[]>(data.characters)
  const [scriptId, setScriptId] = useState<string | null>(data.script_id ?? null)
  const [version, setVersion] = useState<number>(data.version ?? 1)
  const [editingSeq, setEditingSeq] = useState<number | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  const wordCount = useMemo(
    () => lines.reduce((n, l) => n + (l.type === 'dialogue' || l.type === 'direction' ? l.text.split(/\s+/).length : 0), 0),
    [lines],
  )

  const updateLine = (seq: number, updates: Partial<ScriptLine>) => {
    setLines((prev) => prev.map((l) => (l.seq === seq ? { ...l, ...updates } : l)))
    setDirty(true)
  }

  const deleteLine = (seq: number) => {
    setLines((prev) => prev.filter((l) => l.seq !== seq))
    setDirty(true)
  }

  // Flip a line's type. Direction -> dialogue becomes NARRATOR speech when
  // no character cue precedes it (narrator/director distinction, blueprint).
  const flipType = (seq: number, newType: ScriptLine['type']) => {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.seq === seq)
      if (idx === -1) return prev
      const line = { ...prev[idx], type: newType }
      if (newType === 'dialogue') {
        // Find nearest preceding character cue
        let charId: string | null = null
        for (let i = idx - 1; i >= 0; i--) {
          if (prev[i].type === 'character') { charId = prev[i].character_id; break }
          if (prev[i].type === 'heading') break
        }
        if (!charId) {
          // No character above — make it NARRATOR dialogue
          const narrator = characters.find((c) => c.type === 'narrator')
          if (narrator) {
            charId = narrator.id
            // Insert a NARRATOR cue above if the previous line isn't one
            const prevLine = prev[idx - 1]
            if (!prevLine || prevLine.type !== 'character' || prevLine.character_id !== narrator.id) {
              const cue: ScriptLine = {
                seq: Math.min(...prev.map((p) => p.seq)) - 1,
                type: 'character',
                character_id: narrator.id,
                text: 'NARRATOR',
              }
              return [...prev.slice(0, idx), cue, { ...line, character_id: charId }, ...prev.slice(idx + 1)]
            }
          }
        }
        line.character_id = charId
      }
      if (newType === 'direction') line.character_id = null
      if (newType === 'heading') line.character_id = null
      const next = [...prev]
      next[idx] = line
      return next
    })
    setDirty(true)
  }

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      const raw_text = linesToRawText(lines)
      let res: Response
      if (scriptId) {
        res = await fetch(`/api/writing/scripts/${scriptId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, raw_text }),
        })
      } else {
        res = await fetch('/api/writing/scripts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, raw_text }),
        })
      }
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}))
        throw new Error(detail.detail || 'Save failed')
      }
      const blob = await res.json()
      setScriptId(blob.script_id ?? scriptId)
      setVersion(blob.version ?? 1)
      setLines(blob.lines ?? lines)
      setCharacters(blob.characters ?? characters)
      setDirty(false)
      const forked = Boolean(blob.forked)
      showToast(forked ? `Saved as Version ${blob.version} (forked — v${(blob.version ?? 2) - 1} stays linked to its projects)` : `Saved as Version ${blob.version}`, 'success')
      onSaved?.(blob.script_id, blob.version, Boolean(blob.forked))
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <button
          onClick={onBack}
          className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg transition-all"
        >
          Back
        </button>
        <input
          value={title}
          onChange={(e) => { setTitle(e.target.value); setDirty(true) }}
          className="flex-1 bg-transparent text-lg font-semibold tracking-tight text-zinc-100 focus:outline-none focus:bg-zinc-900 rounded-lg px-3 py-1.5 transition-all"
        />
        <div className="text-[11px] text-zinc-600 tabular-nums">
          v{version} · {lines.length} lines · ~{wordCount} words
        </div>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="px-4 py-1.5 bg-brand-600 hover:bg-brand-500 active:bg-brand-600 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-all tracking-[0.3px]"
        >
          {saving ? 'Saving...' : dirty ? 'Save' : 'Saved'}
        </button>
      </div>

      {/* Character chips */}
      <div className="px-6 pt-4 pb-2 flex flex-wrap gap-2">
        {characters.map((c) => (
          <div
            key={c.id}
            className={`px-3 py-1.5 rounded-xl border text-xs flex items-center gap-2 ${
              c.type === 'narrator'
                ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
                : 'border-zinc-800 bg-zinc-900 text-zinc-300'
            }`}
          >
            <span className="font-medium tracking-[0.5px]">{c.name}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium tracking-[0.5px] uppercase ${
              c.type === 'narrator' ? 'bg-sky-500/20 text-sky-400' : 'bg-zinc-800 text-zinc-500'
            }`}>
              {c.type}
            </span>
            {c.traits?.gender && <span className="text-[10px] text-zinc-500">{c.traits.gender}</span>}
          </div>
        ))}
      </div>

      {/* The script page */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-6 pb-16">
        <div className="max-w-3xl mx-auto mt-4 bg-zinc-900/40 border border-zinc-800/70 rounded-2xl px-10 py-8 font-mono shadow-2xl">
          {lines.map((l) => (
            <div key={l.seq} className="group relative">
              {/* Hover controls: type flip + delete */}
              <div className="absolute -left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                <select
                  value={l.type}
                  onChange={(e) => flipType(l.seq, e.target.value as ScriptLine['type'])}
                  className="bg-zinc-950 border border-zinc-800 rounded text-[9px] text-zinc-500 hover:text-zinc-300 focus:outline-none cursor-pointer px-1 py-0.5"
                  title="Change line type"
                >
                  {LINE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <button
                  onClick={() => deleteLine(l.seq)}
                  className="w-5 h-5 text-[10px] text-zinc-600 hover:text-red-400 transition-colors"
                  title="Delete line"
                >
                  x
                </button>
              </div>

              {editingSeq === l.seq ? (
                <textarea
                  autoFocus
                  value={l.text}
                  onChange={(e) => updateLine(l.seq, { text: e.target.value })}
                  onBlur={() => setEditingSeq(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      setEditingSeq(null)
                    }
                    if (e.key === 'Escape') setEditingSeq(null)
                  }}
                  rows={Math.max(1, Math.ceil(l.text.length / 60))}
                  className={`w-full bg-zinc-950 border border-brand-500/40 rounded-lg px-3 py-1.5 focus:outline-none text-[13px] ${TYPE_STYLES[l.type].split(' ').filter((c) => c.startsWith('pl-') || c.startsWith('text-')).join(' ')}`}
                />
              ) : (
                <div
                  onClick={() => setEditingSeq(l.seq)}
                  className={`${TYPE_STYLES[l.type]} cursor-text hover:bg-zinc-800/30 rounded px-1 -mx-1 transition-colors`}
                >
                  {l.text || <span className="text-zinc-700">empty</span>}
                </div>
              )}
            </div>
          ))}

          {lines.length === 0 && (
            <div className="text-center py-16 text-zinc-600 text-sm">
              Empty script. Click a line to edit it.
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="max-w-3xl mx-auto mt-4 flex flex-wrap gap-4 text-[10px] text-zinc-600">
          <span><span className="text-emerald-400/90 uppercase">Heading</span> — scene boundary</span>
          <span><span className="text-zinc-400">Direction</span> — video prompt seed, not spoken</span>
          <span><span className="text-sky-300">Narrator</span> — spoken, has a voice</span>
          <span>Click any line to edit · flip its type on hover</span>
        </div>
      </div>
    </div>
  )
}