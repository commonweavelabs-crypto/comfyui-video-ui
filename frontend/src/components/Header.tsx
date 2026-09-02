import type { ComfyUIStatus } from '../types'

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
}: HeaderProps) {
  const connected = comfyuiStatus?.connected ?? false
  const queueInfo = comfyuiStatus
    ? `${comfyuiStatus.queue_running} running · ${comfyuiStatus.queue_remaining} queued`
    : '—'

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
    </header>
  )
}