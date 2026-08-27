import { useState, useEffect, useCallback, useRef } from 'react'
import type { Scene, MusicTrack, AssemblyProgress, ExportVideo } from '../types'
import { exportApi, musicApi } from '../api'

interface ExportPanelProps {
  scriptId: string
  scenes: Scene[]
  onExportComplete: (exportInfo: { filename: string; url: string }) => void
}

export default function ExportPanel({ scriptId, scenes, onExportComplete }: ExportPanelProps) {
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([])
  const [selectedTrackId, setSelectedTrackId] = useState('')
  const [musicVolume, setMusicVolume] = useState(0.3)
  const [includeBroll, setIncludeBroll] = useState(true)
  const [resolution, setResolution] = useState('1080p')
  const [outputName, setOutputName] = useState('')
  const [assembling, setAssembling] = useState(false)
  const [progress, setProgress] = useState<AssemblyProgress | null>(null)
  const [exports, setExports] = useState<ExportVideo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [completedExport, setCompletedExport] = useState<{ filename: string; url: string } | null>(null)
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const completedScenes = scenes.filter((s) => s.status === 'complete').length
  const totalScenes = scenes.length
  const allComplete = completedScenes === totalScenes && totalScenes > 0

  const loadExports = useCallback(async () => {
    try {
      const list = await exportApi.listExports(scriptId)
      setExports(list)
    } catch {
      setExports([])
    }
  }, [scriptId])

  useEffect(() => {
    musicApi.list().then(setMusicTracks).catch(() => setMusicTracks([]))
    loadExports()
  }, [loadExports])

  const handleAssemble = async () => {
    setAssembling(true)
    setError(null)
    setProgress({ stage: 'Starting', message: 'Starting assembly...', percent: 0 })
    setCompletedExport(null)
    try {
      await exportApi.assemble(scriptId, {
        music_track_id: selectedTrackId || undefined,
        music_volume: musicVolume,
        include_broll: includeBroll,
        output_name: outputName.trim() || undefined,
        resolution,
      })

      // Poll for progress
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = setInterval(async () => {
        try {
          const prog = await exportApi.progress(scriptId)
          setProgress(prog)
          if (prog.percent >= 100) {
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current)
              progressIntervalRef.current = null
            }
            // Reload exports to find the new one
            await loadExports()
            // Find the most recent export
            const list = await exportApi.listExports(scriptId)
            if (list.length > 0) {
              const latest = list[0]
              const exportInfo = { filename: latest.filename, url: latest.url }
              setCompletedExport(exportInfo)
              onExportComplete(exportInfo)
            }
            setAssembling(false)
          }
        } catch (e) {
          console.error('Progress poll failed:', e)
        }
      }, 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assembly failed')
      setAssembling(false)
      setProgress(null)
    }
  }

  const handleDeleteExport = async (filename: string) => {
    try {
      await exportApi.deleteExport(scriptId, filename)
      await loadExports()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const formatSize = (bytes: number) => {
    if (!bytes) return '—'
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-thin p-1 space-y-4">
      {/* Completion checklist */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="text-[10px] font-medium text-zinc-500 tracking-[1px] uppercase mb-2">
          Scene Completion
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  allComplete ? 'bg-emerald-500' : 'bg-orange-500'
                }`}
                style={{ width: `${totalScenes > 0 ? (completedScenes / totalScenes) * 100 : 0}%` }}
              />
            </div>
          </div>
          <div className="text-sm text-zinc-300 font-mono tabular-nums whitespace-nowrap">
            {completedScenes}/{totalScenes}
          </div>
        </div>
        {!allComplete && totalScenes > 0 && (
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-orange-400">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
            {totalScenes - completedScenes} scene(s) not yet rendered
          </div>
        )}
        {allComplete && (
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            All scenes rendered and ready
          </div>
        )}
      </div>

      {/* Assembly options */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
        <div className="text-[10px] font-medium text-zinc-500 tracking-[1px] uppercase">
          Assembly Options
        </div>

        {/* Music track */}
        <div>
          <label className="text-[10px] text-zinc-500 tracking-[0.5px] uppercase block mb-1.5">
            Music Track (optional)
          </label>
          <select
            value={selectedTrackId}
            onChange={(e) => setSelectedTrackId(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-zinc-700"
          >
            <option value="">No music</option>
            {musicTracks.map((t) => (
              <option key={t.track_id} value={t.track_id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>

        {/* Music volume */}
        {selectedTrackId && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-zinc-500 tracking-[0.5px] uppercase">
                Music Volume
              </label>
              <span className="text-[10px] text-zinc-400 font-mono">
                {Math.round(musicVolume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={musicVolume}
              onChange={(e) => setMusicVolume(Number(e.target.value))}
              className="w-full accent-brand-500"
            />
          </div>
        )}

        {/* Include B-roll */}
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={includeBroll}
            onChange={(e) => setIncludeBroll(e.target.checked)}
            className="w-4 h-4 rounded accent-brand-500"
          />
          <span className="text-xs text-zinc-300">Include B-roll overlays</span>
        </label>

        {/* Resolution */}
        <div>
          <label className="text-[10px] text-zinc-500 tracking-[0.5px] uppercase block mb-1.5">
            Resolution
          </label>
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-zinc-700"
          >
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
            <option value="original">Original</option>
          </select>
        </div>

        {/* Output name */}
        <div>
          <label className="text-[10px] text-zinc-500 tracking-[0.5px] uppercase block mb-1.5">
            Output Name (optional)
          </label>
          <input
            type="text"
            value={outputName}
            onChange={(e) => setOutputName(e.target.value)}
            placeholder="my-video"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
          />
        </div>

        {/* Assemble button */}
        <button
          onClick={handleAssemble}
          disabled={assembling || totalScenes === 0}
          className="w-full px-4 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all tracking-[0.3px]"
        >
          {assembling ? 'Assembling...' : 'Assemble & Export'}
        </button>
      </div>

      {/* Progress */}
      {progress && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                progress.percent >= 100 ? 'bg-emerald-500' : 'bg-orange-500 soft-pulse'
              }`}
            />
            <span className="text-xs text-zinc-300 font-medium">{progress.stage}</span>
          </div>
          <div className="text-xs text-zinc-500 mb-2">{progress.message}</div>
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                progress.percent >= 100 ? 'bg-emerald-500' : 'bg-brand-500'
              }`}
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <div className="text-center text-[10px] text-zinc-500 mt-1.5">
            {Math.round(progress.percent)}%
          </div>
        </div>
      )}

      {/* Completed export */}
      {completedExport && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs text-emerald-400 font-medium">Export Complete</span>
          </div>
          <video
            src={completedExport.url}
            controls
            className="w-full rounded-lg border border-zinc-800 mb-3"
            preload="metadata"
            playsInline
          />
          <a
            href={completedExport.url}
            download
            className="block w-full text-center px-4 py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-sm font-semibold rounded-xl transition-all"
          >
            Download {completedExport.filename}
          </a>
        </div>
      )}

      {/* Previous exports */}
      {exports.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-[10px] font-medium text-zinc-500 tracking-[1px] uppercase mb-3">
            Previous Exports
          </div>
          <div className="space-y-2">
            {exports.map((exp) => (
              <div
                key={exp.filename}
                className="flex items-center gap-2 p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-zinc-300 font-medium line-clamp-1">
                    {exp.filename}
                  </div>
                  <div className="text-[10px] text-zinc-600 mt-0.5">
                    {formatSize(exp.size)}
                    {exp.created && ` · ${new Date(exp.created).toLocaleDateString()}`}
                  </div>
                </div>
                <a
                  href={exp.url}
                  download
                  className="flex-shrink-0 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] rounded-md font-medium transition-all"
                >
                  Download
                </a>
                <button
                  onClick={() => handleDeleteExport(exp.filename)}
                  className="flex-shrink-0 px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] rounded-md font-medium transition-all"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
    </div>
  )
}