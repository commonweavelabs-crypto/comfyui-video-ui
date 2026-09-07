import { useState, useRef, useEffect, useCallback } from 'react'
import type { MusicTrack, MusicProviderConfig } from '../types'
import { musicApi } from '../api'

interface MusicPanelProps {
  selectedTrackId: string | null
  onSelectTrack: (trackId: string | null) => void
}

export default function MusicPanel({ selectedTrackId, onSelectTrack }: MusicPanelProps) {
  const [tracks, setTracks] = useState<MusicTrack[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadTags, setUploadTags] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showGenerate, setShowGenerate] = useState(false)
  const [showProviders, setShowProviders] = useState(false)
  const [genPrompt, setGenPrompt] = useState('')
  const [genDuration, setGenDuration] = useState(30)
  const [generating, setGenerating] = useState(false)
  const [providerConfig, setProviderConfig] = useState<MusicProviderConfig | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadTracks = useCallback(async () => {
    try {
      const list = await musicApi.list()
      setTracks(list)
    } catch {
      setTracks([])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadProviders = useCallback(async () => {
    try {
      const config = await musicApi.getProviders()
      setProviderConfig(config)
    } catch {
      setProviderConfig(null)
    }
  }, [])

  useEffect(() => {
    loadTracks()
    loadProviders()
  }, [loadTracks, loadProviders])

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0]
    if (!file || !uploadTitle.trim()) return
    setUploading(true)
    setError(null)
    try {
      await musicApi.upload(file, uploadTitle.trim(), uploadTags.trim() || undefined)
      setUploadTitle('')
      setUploadTags('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      await loadTracks()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleGenerate = async () => {
    if (!genPrompt.trim()) return
    setGenerating(true)
    setError(null)
    try {
      await musicApi.generate(genPrompt.trim(), genDuration)
      setGenPrompt('')
      await loadTracks()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const handleDelete = async (trackId: string) => {
    try {
      await musicApi.delete(trackId)
      if (selectedTrackId === trackId) onSelectTrack(null)
      await loadTracks()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const togglePlay = (track: MusicTrack) => {
    if (playingId === track.track_id) {
      audioRef.current?.pause()
      setPlayingId(null)
    } else {
      if (audioRef.current) {
        audioRef.current.src = track.url
        audioRef.current.play().catch(() => {})
      }
      setPlayingId(track.track_id)
    }
  }

  const formatDuration = (s: number) => {
    if (!s || isNaN(s)) return '0:00'
    const mins = Math.floor(s / 60)
    const secs = Math.floor(s % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const hasProvider = providerConfig && providerConfig.active_provider && providerConfig.providers[providerConfig.active_provider]

  return (
    <div className="flex flex-col h-full">
      <audio
        ref={audioRef}
        onEnded={() => setPlayingId(null)}
        preload="metadata"
      />

      {/* Track list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin space-y-2 mb-3">
        <div className="text-[10px] font-medium text-zinc-500 tracking-[1px] uppercase mb-2">
          Music Library
        </div>
        {loading ? (
          <div className="text-center py-8 text-zinc-600 text-sm">Loading tracks...</div>
        ) : tracks.length === 0 ? (
          <div className="text-center py-8 text-zinc-600 text-sm">
            No music tracks yet. Upload a file or generate one below.
          </div>
        ) : (
          tracks.map((track) => (
            <div
              key={track.track_id}
              className={`p-3 rounded-xl border transition-all cursor-pointer ${
                selectedTrackId === track.track_id
                  ? 'bg-brand-500/10 border-brand-500/30'
                  : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
              }`}
              onClick={() =>
                onSelectTrack(selectedTrackId === track.track_id ? null : track.track_id)
              }
            >
              <div className="flex items-center gap-2.5">
                {/* Play button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    togglePlay(track)
                  }}
                  className="flex-shrink-0 w-7 h-7 rounded-lg bg-brand-600/20 hover:bg-brand-600/30 flex items-center justify-center transition-all"
                >
                  {playingId === track.track_id ? (
                    <div className="flex gap-1">
                      <div className="w-1 h-3 bg-brand-400 rounded-sm" />
                      <div className="w-1 h-3 bg-brand-400 rounded-sm" />
                    </div>
                  ) : (
                    <div
                      className="w-0 h-0 ml-0.5"
                      style={{
                        borderTop: '5px solid transparent',
                        borderBottom: '5px solid transparent',
                        borderLeft: '8px solid var(--color-brand-400)',
                      }}
                    />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-zinc-200 line-clamp-1">
                    {track.title}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {formatDuration(track.duration)}
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium tracking-[0.5px] ${
                        track.source === 'generated'
                          ? 'bg-purple-500/15 text-purple-400'
                          : 'bg-blue-500/15 text-blue-400'
                      }`}
                    >
                      {track.source === 'generated' ? 'GENERATED' : 'UPLOAD'}
                    </span>
                  </div>
                </div>

                {/* Select checkbox */}
                <div
                  className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                    selectedTrackId === track.track_id
                      ? 'bg-brand-600 border-brand-600'
                      : 'border-zinc-700'
                  }`}
                >
                  {selectedTrackId === track.track_id && (
                    <div className="w-2.5 h-1.5 border-b-2 border-l-2 border-white rotate-[-45deg] -mt-0.5" />
                  )}
                </div>
              </div>

              {track.tags && track.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {track.tags.slice(0, 4).map((tag, i) => (
                    <span
                      key={i}
                      className="text-[9px] px-1.5 py-0.5 rounded-md bg-zinc-800 text-zinc-500"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Delete button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(track.track_id)
                }}
                className="mt-2 text-[10px] text-zinc-600 hover:text-red-400 transition-colors"
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>

      {error && (
        <div className="mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Upload section */}
      <div className="mb-3 p-3 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
        <div className="text-[10px] font-medium text-zinc-500 tracking-[1px] uppercase">
          Upload Track
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
        />
        <input
          type="text"
          value={uploadTitle}
          onChange={(e) => setUploadTitle(e.target.value)}
          placeholder="Track title"
          className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-700 rounded-lg px-3 py-2 text-xs placeholder:text-zinc-600 focus:outline-none text-zinc-200"
        />
        <input
          type="text"
          value={uploadTags}
          onChange={(e) => setUploadTags(e.target.value)}
          placeholder="Tags (comma-separated)"
          className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-700 rounded-lg px-3 py-2 text-xs placeholder:text-zinc-600 focus:outline-none text-zinc-200"
        />
        <div className="flex gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-lg font-medium transition-all"
          >
            Choose File
          </button>
          <button
            onClick={handleUpload}
            disabled={!uploadTitle.trim() || uploading}
            className="flex-1 px-3 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs rounded-lg font-medium transition-all"
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>

      {/* Generate section */}
      <div className="mb-3">
        <button
          onClick={() => setShowGenerate(!showGenerate)}
          className="w-full flex items-center justify-between p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-400 hover:text-zinc-200 transition-all"
        >
          <span className="font-medium tracking-[0.5px] uppercase text-[10px]">Generate Music</span>
          <span className="text-zinc-600">{showGenerate ? '-' : '+'}</span>
        </button>
        {showGenerate && (
          <div className="mt-2 p-3 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
            {hasProvider ? (
              <>
                <input
                  type="text"
                  value={genPrompt}
                  onChange={(e) => setGenPrompt(e.target.value)}
                  placeholder="Describe the music style..."
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-700 rounded-lg px-3 py-2 text-xs placeholder:text-zinc-600 focus:outline-none text-zinc-200"
                />
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-zinc-500 tracking-[0.5px] uppercase whitespace-nowrap">
                    Duration
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={300}
                    value={genDuration}
                    onChange={(e) => setGenDuration(Number(e.target.value))}
                    className="w-20 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700 text-center"
                  />
                  <span className="text-xs text-zinc-500">sec</span>
                  <button
                    onClick={handleGenerate}
                    disabled={!genPrompt.trim() || generating}
                    className="ml-auto px-3 py-1.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs rounded-lg font-medium transition-all"
                  >
                    {generating ? 'Generating...' : 'Generate'}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-[11px] text-zinc-500 leading-relaxed">
                No music generation provider configured. Upload music files or configure a provider in settings.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Provider settings */}
      <div>
        <button
          onClick={() => setShowProviders(!showProviders)}
          className="w-full flex items-center justify-between p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-400 hover:text-zinc-200 transition-all"
        >
          <span className="font-medium tracking-[0.5px] uppercase text-[10px]">Provider Settings</span>
          <span className="text-zinc-600">{showProviders ? '-' : '+'}</span>
        </button>
        {showProviders && (
          <ProviderSettings
            config={providerConfig}
            onUpdate={async (config) => {
              try {
                const updated = await musicApi.updateProviders(config)
                setProviderConfig(updated)
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Failed to update providers')
              }
            }}
          />
        )}
      </div>
    </div>
  )
}

function ProviderSettings({
  config,
  onUpdate,
}: {
  config: MusicProviderConfig | null
  onUpdate: (config: Partial<MusicProviderConfig>) => void
}) {
  const [activeProvider, setActiveProvider] = useState(config?.active_provider || '')
  const [endpoint, setEndpoint] = useState('')
  const [apiKey, setApiKey] = useState('')

  useEffect(() => {
    if (config) {
      setActiveProvider(config.active_provider)
      const active = config.providers[config.active_provider]
      if (active) {
        setEndpoint(active.endpoint)
        setApiKey(active.api_key)
      }
    }
  }, [config])

  const providerIds = config ? Object.keys(config.providers) : []

  return (
    <div className="mt-2 p-3 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
      <div>
        <label className="text-[10px] text-zinc-500 tracking-[0.5px] uppercase block mb-1">
          Active Provider
        </label>
        <select
          value={activeProvider}
          onChange={(e) => {
            setActiveProvider(e.target.value)
            const p = config?.providers[e.target.value]
            if (p) {
              setEndpoint(p.endpoint)
              setApiKey(p.api_key)
            }
          }}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-zinc-700"
        >
          {providerIds.length === 0 ? (
            <option value="">No providers available</option>
          ) : (
            providerIds.map((id) => (
              <option key={id} value={id}>
                {config?.providers[id]?.name || id}
              </option>
            ))
          )}
        </select>
      </div>
      <div>
        <label className="text-[10px] text-zinc-500 tracking-[0.5px] uppercase block mb-1">
          Endpoint
        </label>
        <input
          type="text"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="https://..."
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
        />
      </div>
      <div>
        <label className="text-[10px] text-zinc-500 tracking-[0.5px] uppercase block mb-1">
          API Key
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="API key"
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
        />
      </div>
      <button
        onClick={() =>
          onUpdate({
            active_provider: activeProvider,
            providers: {
              ...config?.providers,
              [activeProvider]: {
                ...(config?.providers[activeProvider] || {
                  id: activeProvider,
                  name: activeProvider,
                  description: '',
                }),
                endpoint,
                api_key: apiKey,
              },
            },
          })
        }
        className="w-full px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-lg font-medium transition-all"
      >
        Save Provider Settings
      </button>
    </div>
  )
}