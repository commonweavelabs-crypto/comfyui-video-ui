import { useState } from 'react'
import type { Script } from '../types'
import { scriptsApi } from '../api'

interface ScriptLibraryProps {
  scripts: Script[]
  activeScriptId: string | null
  loading: boolean
  onSelect: (script: Script) => void
  onCreated: () => void
  onSubmitScript: (script: Script) => void
  onDeleteScript: (script: Script) => void
  pipelineProgress: { stage: string; message: string; percent: number } | null
}

export default function ScriptLibrary({
  scripts,
  activeScriptId,
  loading,
  onSelect,
  onCreated,
  onSubmitScript,
  onDeleteScript,
  pipelineProgress,
}: ScriptLibraryProps) {
  const [mode, setMode] = useState<'library' | 'create'>('library')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filtered = (scripts || []).filter((s) => {
    const q = search.toLowerCase()
    return (
      s.title.toLowerCase().includes(q) ||
      s.content.toLowerCase().includes(q) ||
      (s.tags || []).some((t) => t.toLowerCase().includes(q))
    )
  })

  const handleCreate = async () => {
    if (!title.trim() || !content.trim()) return
    setCreating(true)
    setError(null)
    try {
      await scriptsApi.create(title.trim(), content.trim())
      setTitle('')
      setContent('')
      setMode('library')
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create project')
    } finally {
      setCreating(false)
    }
  }

  const statusColors: Record<string, string> = {
    draft: 'bg-zinc-800 text-zinc-400',
    processing: 'bg-orange-500/15 text-orange-400',
    ready: 'bg-emerald-500/15 text-emerald-400',
    error: 'bg-red-500/15 text-red-400',
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-zinc-900 rounded-xl mb-4">
        <button
          onClick={() => setMode('library')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
            mode === 'library'
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Library
        </button>
        <button
          onClick={() => setMode('create')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
            mode === 'create'
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Create
        </button>
      </div>

      {mode === 'library' ? (
        <>
          {/* Search */}
          <div className="relative mb-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-700 rounded-xl px-4 py-2.5 text-sm placeholder:text-zinc-600 focus:outline-none text-zinc-200"
            />
          </div>

          {/* Pipeline progress */}
          {pipelineProgress && (
            <div className="mb-3 bg-zinc-900 border border-orange-600/30 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-1.5 bg-orange-400 rounded-full soft-pulse" />
                <span className="text-xs text-orange-400 font-medium">{pipelineProgress.stage}</span>
              </div>
              <div className="text-xs text-zinc-400 mb-2">{pipelineProgress.message}</div>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 rounded-full transition-all duration-300"
                  style={{ width: `${pipelineProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* Script list */}
          <div className="flex-1 overflow-y-auto scrollbar-thin space-y-2">
            {loading ? (
              <div className="text-center py-8 text-zinc-600 text-sm">Loading projects...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-zinc-600 text-sm">
                {scripts.length === 0 ? 'No projects yet. Create one to get started.' : 'No matches found.'}
              </div>
            ) : (
              filtered.map((script) => (
                <div
                  key={script.id}
                  onClick={() => onSelect(script)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all group ${
                    activeScriptId === script.id
                      ? 'bg-brand-500/10 border-brand-500/30'
                      : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="font-medium text-sm text-zinc-200 line-clamp-1 flex-1">
                      {script.title}
                    </div>
                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-medium tracking-[0.5px] ${statusColors[script.status] || statusColors.draft}`}>
                      {script.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500 line-clamp-2 mb-2">
                    {script.content.slice(0, 120)}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] text-zinc-600">
                      {script.scene_count} scenes · {new Date(script.updated_at).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {(script.status === 'ready' || script.status === 'draft') && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onSubmitScript(script)
                          }}
                          className="text-[10px] px-3 py-1 rounded-lg bg-brand-600/20 text-brand-400 hover:bg-brand-600/30 transition-all font-medium tracking-[0.3px]"
                        >
                          Submit
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeleteScript(script)
                        }}
                        className="text-[10px] px-2 py-1 rounded-lg bg-zinc-800 text-zinc-500 hover:bg-red-500/10 hover:text-red-400 transition-all"
                        title="Delete project (files go to Recycle Bin)"
                      >
                        x
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        /* Create mode */
        <div className="flex flex-col gap-3 flex-1 overflow-y-auto scrollbar-thin">
          <div>
            <label className="text-[10px] font-medium text-zinc-500 mb-1.5 tracking-[1px] uppercase block">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Video Project"
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-700 rounded-xl px-4 py-2.5 text-sm placeholder:text-zinc-600 focus:outline-none text-zinc-200"
            />
          </div>
          <div className="flex-1 flex flex-col">
            <label className="text-[10px] font-medium text-zinc-500 mb-1.5 tracking-[1px] uppercase block">
              Script Content
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write or paste your script here...&#10;&#10;The AI pipeline will break this into scenes, generate audio, and write prompts."
              className="flex-1 min-h-[200px] bg-zinc-950 border border-zinc-800 focus:border-zinc-700 rounded-xl px-4 py-3 text-sm resize-none placeholder:text-zinc-600 focus:outline-none text-zinc-200 font-mono leading-relaxed"
            />
          </div>
          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <button
            onClick={handleCreate}
            disabled={!title.trim() || !content.trim() || creating}
            className="w-full bg-brand-600 hover:bg-brand-500 active:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm tracking-[0.3px] transition-all"
          >
            {creating ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      )}
    </div>
  )
}