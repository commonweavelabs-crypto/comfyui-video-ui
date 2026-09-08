// LLM Connect Modal (M-E step 1) — replaces the dead-end "LLM could not be
// reached" warning with a guided connection flow.
//
// Flow: detect local providers (Ollama, LM Studio, llama.cpp, Jan) + cloud keys
// → user picks provider → picks model → Connect → formatting works.
// No harness required: everything speaks OpenAI-compatible HTTP or Ollama native.

import { useCallback, useEffect, useState } from 'react'
import { llmApi, type LlmProvider } from '../api'

interface LlmConnectModalProps {
  onClose: () => void
  /** Called after a successful connect (parent should retry the formatting) */
  onConnected: () => void
  /** The original error shown before this modal opened */
  originalError?: string | null
}

export default function LlmConnectModal({ onClose, onConnected, originalError }: LlmConnectModalProps) {
  const [providers, setProviders] = useState<LlmProvider[]>([])
  const [current, setCurrent] = useState<{ provider: string; model: string; url?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<LlmProvider | null>(null)
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connectedFlash, setConnectedFlash] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await llmApi.listProviders()
      setProviders(res.providers || [])
      setCurrent(res.current || null)
      // Auto-select the first local provider (zero-config preference)
      const firstLocal = (res.providers || []).find((p) => p.kind === 'local')
      if (firstLocal && !selected) {
        setSelected(firstLocal)
        setSelectedModel(firstLocal.models[0]?.id ?? null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to detect providers')
    } finally {
      setLoading(false)
    }
  }, [selected])

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const connect = useCallback(async () => {
    if (!selected || !selectedModel) return
    setConnecting(true)
    setError(null)
    try {
      await llmApi.connect({ provider_id: selected.id, model: selectedModel })
      setConnectedFlash(true)
      setTimeout(() => {
        onConnected()
      }, 700)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect')
    } finally {
      setConnecting(false)
    }
  }, [selected, selectedModel, onConnected])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Connect an AI model</h2>
            <p className="text-xs text-zinc-500 mt-1">
              The app uses an LLM to turn your idea into scenes. Connect any local
              model server or cloud provider — no account needed for local.
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 text-lg leading-none px-1">×</button>
        </div>

        {originalError && !connectedFlash && (
          <div className="text-xs text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
            {originalError}
          </div>
        )}

        {connectedFlash ? (
          <div className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3">
            ✓ Connected to <span className="font-semibold">{selectedModel}</span> — formatting your idea…
          </div>
        ) : loading ? (
          <div className="text-sm text-zinc-500 py-6 text-center">Detecting local AI providers…</div>
        ) : (
          <>
            {/* Provider list */}
            <div className="space-y-1.5">
              {providers.length === 0 ? (
                <div className="text-xs text-zinc-500 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-3 leading-relaxed">
                  No local AI servers detected, and no cloud API keys are set.
                  <div className="mt-2 text-zinc-600">
                    Install <span className="text-zinc-300 font-medium">Ollama</span> (ollama.com) — it's free,
                    runs locally, and this app will detect it automatically. Or paste a cloud API key below.
                  </div>
                </div>
              ) : (
                providers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelected(p)
                      setSelectedModel(p.models[0]?.id ?? null)
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                      selected?.id === p.id
                        ? 'border-emerald-600/60 bg-emerald-600/10'
                        : 'border-zinc-800 hover:border-zinc-700 bg-zinc-950'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${selected?.id === p.id ? 'text-emerald-400' : 'text-zinc-200'}`}>
                        {p.label}
                      </span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wide ${
                        p.kind === 'local'
                          ? 'bg-zinc-800 text-zinc-400'
                          : 'bg-sky-900/50 text-sky-400'
                      }`}>
                        {p.kind === 'local' ? 'Local · free' : 'Cloud · API key'}
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-600 mt-0.5">
                      {p.models.length} model{p.models.length === 1 ? '' : 's'} available
                      {p.url ? ` · ${p.url}` : ''}
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Model picker for selected provider */}
            {selected && (
              <div>
                <div className="text-[10px] font-medium text-zinc-500 mb-1.5 tracking-[1px] uppercase">
                  Model — {selected.label}
                </div>
                <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto">
                  {selected.models.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setSelectedModel(m.id)}
                      className={`text-left px-2.5 py-2 rounded-lg border text-[11px] transition-all truncate ${
                        selectedModel === m.id
                          ? 'border-emerald-600/60 bg-emerald-600/10 text-emerald-400'
                          : 'border-zinc-800 hover:border-zinc-700 bg-zinc-950 text-zinc-300'
                      }`}
                      title={m.id}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-zinc-600 mt-2">
                  Tip: a small model (1–4B) is enough for breaking ideas into scenes —
                  bigger models write richer prose but are slower.
                </p>
              </div>
            )}

            {error && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-zinc-600">
                {current ? `Currently: ${current.model}` : 'Not connected'}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={onClose} className="px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300">
                  Cancel
                </button>
                <button
                  onClick={connect}
                  disabled={!selected || !selectedModel || connecting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-all"
                >
                  {connecting ? 'Connecting…' : 'Connect'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}