import { useEffect, useState } from 'react'
import type { ComfyUIStatus } from '../types'
import { comfyuiApi } from '../api'
import type { ThemeMode } from '../theme'

interface HeaderProps {
  comfyuiStatus: ComfyUIStatus | null
  sceneCount: number
  activeScriptTitle: string | null
  onStartWizard: () => void
  queueTimeEstimate: number | null
  diskSizeFormatted: string | null
  onDiskUsageClick: () => void
  onCleanupOutputs: () => void
  cleaningOutputs: boolean
  theme: ThemeMode
  onToggleTheme: () => void
}

interface AssetsStatus {
  missing: string[]
  all_available: boolean
  error?: string
}

export default function Header({
  comfyuiStatus,
  sceneCount,
  activeScriptTitle,
  onStartWizard,
  queueTimeEstimate,
  diskSizeFormatted,
  onDiskUsageClick,
  onCleanupOutputs,
  cleaningOutputs,
  theme,
  onToggleTheme,
}: HeaderProps) {
  const connected = comfyuiStatus?.connected ?? false
  const queueInfo = comfyuiStatus
    ? `${comfyuiStatus.queue_running} running · ${comfyuiStatus.queue_remaining} queued`
    : '—'

  // ── Asset introspection (missing-asset badge) ──
  const [assetsStatus, setAssetsStatus] = useState<AssetsStatus | null>(null)
  const [assetsOpen, setAssetsOpen] = useState(false)

  useEffect(() => {
    if (!connected) return
    let cancelled = false
    comfyuiApi
      .assets()
      .then((r) => {
        if (!cancelled) setAssetsStatus(r)
      })
      .catch(() => {
        if (!cancelled) setAssetsStatus(null)
      })
    return () => {
      cancelled = true
    }
  }, [connected])

  const missingCount = assetsStatus?.missing.length ?? 0

  // ── Log drawer ──
  const [logsOpen, setLogsOpen] = useState(false)
  const [logsData, setLogsData] = useState<string>('')
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState<string | null>(null)

  const fetchLogs = () => {
    setLogsLoading(true)
    setLogsError(null)
    comfyuiApi
      .logs(40000)
      .then((r) => {
        if (r.error) setLogsError(r.error)
        else setLogsData(r.logs)
      })
      .catch((e) => setLogsError(String(e)))
      .finally(() => setLogsLoading(false))
  }

  const toggleLogs = () => {
    if (!logsOpen) fetchLogs()
    setLogsOpen((v) => !v)
  }

  // Format total queue time estimate
  const queueTimeText = queueTimeEstimate != null && queueTimeEstimate > 0
    ? (() => {
        const m = Math.floor(queueTimeEstimate / 60)
        const s = Math.round(queueTimeEstimate % 60)
        if (s === 0) return `${m}m est.`
        return `${m}m${s}s est.`
      })()
    : null

  return (
    <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-lg sticky top-0 z-50">
      <div className="px-6 py-3.5 flex items-center justify-between">
        {/* Logo + Title */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-sm">
            <span className="text-zinc-950 font-bold text-lg tracking-[-1px]">C</span>
          </div>
          <div>
            <div className="font-semibold text-xl tracking-[-0.8px] leading-none text-zinc-100">
              ComfyUI Video Workflow
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              {activeScriptTitle ?? 'No project selected'}
            </div>
          </div>
        </div>

        {/* Status indicators */}
        <div className="flex items-center gap-2.5">
          {/* Start Wizard button */}
          <button
            onClick={onStartWizard}
            className="px-4 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-sm font-semibold tracking-[0.3px] transition-all"
          >
            Start Wizard
          </button>

          {/* Scene count */}
          <div className="px-4 py-1.5 bg-zinc-900/80 border border-zinc-800 rounded-xl text-sm text-zinc-400 font-medium tracking-[0.2px]">
            {sceneCount} scenes
          </div>

          {/* ComfyUI queue info */}
          <div className="px-4 py-1.5 bg-zinc-900/80 border border-zinc-800 rounded-xl text-sm text-zinc-400 font-mono tracking-[0.3px]">
            {queueInfo}
          </div>

          {/* Queue time estimate */}
          {queueTimeText && (
            <div className="px-4 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-xl text-sm text-orange-400 font-mono tracking-[0.3px]">
              {queueTimeText}
            </div>
          )}

          {/* Missing assets badge — only when the workflow needs something absent */}
          {connected && missingCount > 0 && (
            <button
              onClick={() => setAssetsOpen((v) => !v)}
              className="px-4 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm text-amber-400 font-mono tracking-[0.3px] hover:border-amber-500/50 transition-all"
              title="Model assets required by the workflow are missing — click for details"
            >
              ⚠ {missingCount} missing asset{missingCount > 1 ? 's' : ''}
            </button>
          )}

          {/* Disk usage indicator */}
          {diskSizeFormatted && (
            <button
              onClick={onDiskUsageClick}
              className="px-4 py-1.5 bg-zinc-900/80 border border-zinc-800 rounded-xl text-sm text-zinc-400 font-mono tracking-[0.3px] hover:border-zinc-700 hover:text-zinc-300 transition-all"
              title="View disk usage breakdown"
            >
              {diskSizeFormatted}
            </button>
          )}

          {/* Clean ComfyUI Outputs button */}
          <button
            onClick={onCleanupOutputs}
            disabled={cleaningOutputs}
            className="px-4 py-1.5 bg-zinc-900/80 border border-zinc-800 rounded-xl text-sm text-zinc-400 hover:border-zinc-700 hover:text-zinc-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            title="Send ComfyUI output files to Recycle Bin"
          >
            {cleaningOutputs ? 'Cleaning...' : 'Clean Outputs'}
          </button>

          {/* Theme toggle */}
          <button
            onClick={onToggleTheme}
            className="px-4 py-1.5 bg-zinc-900/80 border border-zinc-800 rounded-xl text-sm text-zinc-400 hover:border-zinc-700 hover:text-zinc-300 transition-all"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? '☀ Light' : '☾ Dark'}
          </button>

          {/* Backend log drawer toggle */}
          <button
            onClick={toggleLogs}
            className={`px-4 py-1.5 rounded-xl text-sm transition-all border ${
              logsOpen
                ? 'bg-zinc-800 border-zinc-700 text-zinc-200'
                : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300'
            }`}
            title="Show ComfyUI backend log tail"
          >
            Logs
          </button>

          {/* Connection pill */}
          <div
            className={`px-4 py-1.5 rounded-xl text-sm font-mono tracking-[0.5px] border flex items-center gap-2 ${
              connected
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-red-500/10 border-red-500/20 text-red-400'
            }`}
          >
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                connected ? 'bg-emerald-400' : 'bg-red-400'
              } ${connected ? 'soft-pulse' : ''}`}
            />
            {connected ? 'ComfyUI Connected' : 'Disconnected'}
          </div>
        </div>
      </div>

      {/* Missing-assets detail panel */}
      {assetsOpen && missingCount > 0 && (
        <div className="px-6 pb-3">
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-sm">
            <div className="text-amber-400 font-semibold mb-2">
              {missingCount} model asset{missingCount > 1 ? 's' : ''} missing —
              renders will fail until downloaded
            </div>
            <ul className="text-zinc-400 font-mono text-xs space-y-1">
              {assetsStatus!.missing.map((m) => (
                <li key={m}>· {m}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Backend log drawer */}
      {logsOpen && (
        <div className="px-6 pb-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
              <span className="text-xs font-semibold text-zinc-400 tracking-[0.5px]">
                COMFYUI BACKEND LOG
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchLogs}
                  className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  {logsLoading ? 'Loading…' : 'Refresh'}
                </button>
                <button
                  onClick={() => setLogsOpen(false)}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
            <pre className="max-h-80 overflow-auto px-4 py-3 text-[11px] leading-relaxed font-mono text-zinc-400 whitespace-pre-wrap">
              {logsError
                ? `Failed to fetch logs: ${logsError}`
                : logsLoading && !logsData
                  ? 'Loading…'
                  : logsData || 'No log output'}
            </pre>
          </div>
        </div>
      )}
    </header>
  )
}