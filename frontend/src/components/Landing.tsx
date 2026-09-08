import { useEffect, useState } from 'react'
import { scriptsApi, renderSettingsApi } from '../api'
import type { Script } from '../types'
import OutputFormatPicker, { type OutputFormatSelection } from './OutputFormatPicker'
import LlmConnectModal from './LlmConnectModal'
import RotatingHeadline from './RotatingHeadline'

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
  // canvas setup; it sizes every initial frame and is the final render size).
  // Selection lives in the shared OutputFormatPicker; persisted after create.
  const [formatSelection, setFormatSelection] = useState<OutputFormatSelection | null>(null)
  const [showLlmConnect, setShowLlmConnect] = useState(false)
  const [llmError, setLlmError] = useState<string | null>(null)

  const handleFormat = async () => {
    if (!prompt.trim() || formatting) return
    setFormatting(true)
    setFormatError(null)
    try {
      // If the input already looks like a Fountain script, skip the LLM
      // entirely — parse locally and open the doc view immediately.
      // A real script STARTS with a scene heading (possibly after a title line).
      // The old /im test matched INT./EXT. ANYWHERE — so a prose story containing
      // a few headings got misrouted to the parser, bypassing the LLM entirely
      // (found live: the Lighthouse story test, 2026-09-08).
      const t = prompt.trim()
      const looksLikeScript =
        /^(INT\.|EXT\.)/.test(t) || /^[A-Z][A-Z '.\-]{2,60}$/.test(t.split('\n')[0])
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
        if (res.status === 502 || res.status === 503) {
          // LLM unreachable -> guided connect flow (M-E) instead of a dead end
          setLlmError(detail.detail || 'The LLM could not be reached')
          setShowLlmConnect(true)
          return
        }
        if (res.status === 413) {
          // Input too big for the connected model -> same "always provide a way
          // out" philosophy: open the model picker so they can switch to a more
          // capable model (or shorten the text). Gui 2026-09-08.
          setLlmError(detail.detail || 'Too much text for the connected model')
          setShowLlmConnect(true)
          return
        }
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
    if (!projectName.trim() || !formatSelection?.preset || creating) return
    setCreating(true)
    try {
      const created = await scriptsApi.create(projectName.trim(), '')
      // Persist the output format chosen at creation (canvas setup)
      try {
        const body: { preset: string; fps?: number; width?: number; height?: number } = {
          preset: formatSelection.preset,
        }
        if (formatSelection.fps) body.fps = formatSelection.fps
        if (formatSelection.width) body.width = formatSelection.width
        if (formatSelection.height) body.height = formatSelection.height
        await renderSettingsApi.set(created.id, body)
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
      {/* Wordmark — each child centers INDEPENDENTLY on the page axis, so the
          subtitle's box aligns with the headline box and the composer below
          (Gui: the descriptive text must sit dead-center, not drift with the
          headline's fixed width). */}
      <div className="mb-10 flex flex-col items-center text-center">
        <div className="text-[11px] font-medium tracking-[3px] uppercase text-zinc-600 mb-3">
          ComfyUI Video Workflow
        </div>
        <RotatingHeadline paused={Boolean(prompt)} />
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

      {/* Inline creation panel for manual project: format (required) + name */}
      {showNameInput && (
        <div className="mt-4 w-full max-w-2xl bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 space-y-3">
          <OutputFormatPicker
            selection={formatSelection}
            onChange={(sel) => setFormatSelection(sel)}
            compact
          />
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && formatSelection?.preset && handleCreateEmpty()}
              placeholder="What would you like to name this project?"
              autoFocus
              className="flex-1 bg-zinc-950 border border-zinc-800 focus:border-brand-500/40 rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
            />
            <button
              onClick={handleCreateEmpty}
              disabled={!projectName.trim() || !formatSelection?.preset || creating}
              title={formatSelection?.preset ? 'Create project' : 'Pick an output format first'}
              className="px-5 py-2.5 bg-white hover:bg-zinc-100 active:bg-white disabled:opacity-30 disabled:cursor-not-allowed text-zinc-950 text-sm font-semibold rounded-xl transition-all"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Guided LLM connect flow (replaces dead-end error) */}
      {showLlmConnect && (
        <LlmConnectModal
          originalError={llmError}
          onClose={() => {
            setShowLlmConnect(false)
            setLlmError(null)
          }}
          onConnected={() => {
            setShowLlmConnect(false)
            setLlmError(null)
            // Retry the formatting automatically now that a model is connected
            void handleFormat()
          }}
        />
      )}
    </div>
  )
}