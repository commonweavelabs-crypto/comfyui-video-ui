import { useState } from 'react'
import { scriptsApi } from '../api'
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
    if (!projectName.trim() || creating) return
    setCreating(true)
    try {
      const created = await scriptsApi.create(projectName.trim(), '')
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

      {/* Inline name prompt for manual project */}
      {showNameInput && (
        <div className="mt-4 flex items-center gap-2 w-full max-w-2xl">
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateEmpty()}
            placeholder="What would you like to name this project?"
            autoFocus
            className="flex-1 bg-zinc-950 border border-zinc-800 focus:border-brand-500/40 rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
          />
          <button
            onClick={handleCreateEmpty}
            disabled={!projectName.trim() || creating}
            className="px-5 py-2.5 bg-white hover:bg-zinc-100 active:bg-white disabled:opacity-30 text-zinc-950 text-sm font-semibold rounded-xl transition-all"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      )}
    </div>
  )
}