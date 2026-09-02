import { useState, useEffect, useCallback, useRef } from 'react'
import type { Scene, Script, ComfyUIStatus, PipelineProgress, FrameCatalogItem, MusicTrack } from './types'
import { scriptsApi, scenesApi, comfyuiApi, framesApi, musicApi, brollApi, diskApi } from './api'
import type { DiskUsageInfo } from './api'
import Header from './components/Header'
import ScriptLibrary from './components/ScriptLibrary'
import Timeline from './components/Timeline'
import FrameCatalog from './components/FrameCatalog'
import MusicPanel from './components/MusicPanel'
import ExportPanel from './components/ExportPanel'
import WorkflowWizard from './components/WorkflowWizard'
import Landing from './components/Landing'

type SidebarTab = 'scripts' | 'frames' | 'music'

// ─── WebSocket message types ─────────────────────────────────

interface WSSceneUpdate {
  type: 'scene_update'
  scene: Scene
}
interface WSPipelineProgress {
  type: 'pipeline_progress'
  progress: PipelineProgress
}
interface WSAudioProgress {
  type: 'audio_progress'
  scene_id: string
  status: Scene['status']
  audio_url?: string
  message?: string
  error?: string
}
interface WSConnected {
  type: 'connected'
  health?: { healthy: boolean; error?: string }
  message?: string
}
interface WSPong {
  type: 'pong'
}
interface WSQueueStatus {
  type: 'queue_status'
  running: number
  pending: number
}
type WSMessage = WSSceneUpdate | WSPipelineProgress | WSAudioProgress | WSConnected | WSPong | WSQueueStatus

export default function App() {
  // ─── State ──────────────────────────────────────────────────
  const [scripts, setScripts] = useState<Script[]>([])
  const [scriptsLoading, setScriptsLoading] = useState(true)
  const [activeScript, setActiveScript] = useState<Script | null>(null)
  const [scenes, setScenes] = useState<Scene[]>([])
  const [comfyuiStatus, setComfyuiStatus] = useState<ComfyUIStatus | null>(null)
  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgress | null>(null)
  const [frames, setFrames] = useState<FrameCatalogItem[]>([])
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('scripts')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [showWizard, setShowWizard] = useState(false)
  const [wizardScript, setWizardScript] = useState<Script | null>(null)
  const [showProjectsPanel, setShowProjectsPanel] = useState(false)
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([])
  const [selectedMusicTrack, setSelectedMusicTrack] = useState<string | null>(null)
  const [showExportPanel, setShowExportPanel] = useState(false)
  const [pendingSubmit, setPendingSubmit] = useState<{ sceneId: string; sceneNumber: number } | null>(null)
  const [pendingCrop, setPendingCrop] = useState<{ sceneId: string; sceneNumber: number; duration: number; audioDuration: number } | null>(null)
  const [gpuCaps, setGpuCaps] = useState<{ gpu_name: string | null; vram_total_gb: number | null; long_scene_threshold: number } | null>(null)
  const [pendingLongScene, setPendingLongScene] = useState<{
    scenes: { sceneNumber: number; duration: number; id?: string }[]
    threshold: number
    gpuName: string | null
    vramGb: number | null
    onConfirm?: () => void
  } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ sceneId: string; renderCount: number } | null>(null)
  const [pendingDeleteScript, setPendingDeleteScript] = useState<Script | null>(null)
  const [pendingDeleteRender, setPendingDeleteRender] = useState<{ sceneId: string; renderId: string; sceneNumber: number; versionIdx: number } | null>(null)
  const [diskUsage, setDiskUsage] = useState<DiskUsageInfo | null>(null)
  const [showDiskUsage, setShowDiskUsage] = useState(false)
  const [cleaningOutputs, setCleaningOutputs] = useState(false)

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Track previous rendering scene count for completion detection
  const prevRenderingCountRef = useRef<number>(0)

  // Compute total queue time estimate from all queued/rendering scenes
  const queueTimeEstimate = scenes.reduce((total, s) => {
    if (s.status === 'rendering' || s.status === 'queued') {
      const remaining = s.render_estimated_remaining
      if (remaining != null && remaining > 0) return total + remaining
      // Fallback: estimate from duration (25.7s render per 1s video), with a
      // ~3x penalty for scenes over the GPU's long-scene threshold
      if (s.duration > 0) {
        const threshold = gpuCaps?.long_scene_threshold ?? 15
        const penalty = s.duration > threshold ? 3 : 1
        return total + 25.7 * s.duration * penalty
      }
    }
    return total
  }, 0)

  // ─── WebSocket connection with reconnection ────────────────
  const wsRef = useRef<WebSocket | null>(null)
  const wsReconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wsBackoffRef = useRef(1)
  const wsMountedRef = useRef(true)

  const connectWebSocket = useCallback(() => {
    if (!wsMountedRef.current) return

    // Build WS URL: in dev mode, connect to backend via current host on port 8503
    // In production (single-port), it would be the same host/port with /ws path
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsHost = window.location.hostname || 'localhost'
    // Dev mode: backend is on port 8503. Prod mode: same port as frontend.
    const wsPort = window.location.port === '8502' ? '8503' : window.location.port
    const wsUrl = `${wsProtocol}//${wsHost}:${wsPort}/ws`

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        wsBackoffRef.current = 1 // reset backoff on successful connect
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WSMessage
          switch (msg.type) {
            case 'connected':
              break
            case 'scene_update': {
              const updated = msg.scene
              setScenes((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)))
              break
            }
            case 'pipeline_progress': {
              setPipelineProgress(msg.progress)
              if (msg.progress.percent >= 100) {
                setPipelineProgress(null)
              }
              break
            }
            case 'audio_progress': {
              const { scene_id, status, audio_url } = msg
              setScenes((prev) =>
                prev.map((s) => {
                  if (s.id !== scene_id) return s
                  const updates: Partial<Scene> = { status }
                  if (audio_url !== undefined) updates.audio_url = audio_url
                  return { ...s, ...updates }
                }),
              )
              break
            }
            case 'pong':
              break
            case 'queue_status': {
              const { running, pending } = msg
              setComfyuiStatus((prev) => ({
                connected: prev?.connected ?? false,
                url: prev?.url ?? '',
                queue_running: running,
                queue_remaining: pending,
                queue_status: running > 0 ? 'busy' : 'idle',
              }))
              break
            }
          }
        } catch {
          // Non-JSON message or parse error — ignore
        }
      }

      ws.onclose = () => {
        if (!wsMountedRef.current) return
        // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
        const delay = Math.min(wsBackoffRef.current * 1000, 30000)
        wsBackoffRef.current = Math.min(wsBackoffRef.current * 2, 30)
        wsReconnectRef.current = setTimeout(connectWebSocket, delay)
      }

      ws.onerror = () => {
        // Error will trigger onclose, which handles reconnection
        ws.close()
      }
    } catch {
      // WebSocket constructor failed — schedule retry
      if (!wsMountedRef.current) return
      const delay = Math.min(wsBackoffRef.current * 1000, 30000)
      wsBackoffRef.current = Math.min(wsBackoffRef.current * 2, 30)
      wsReconnectRef.current = setTimeout(connectWebSocket, delay)
    }
  }, [])

  // Connect on mount, clean up on unmount
  useEffect(() => {
    wsMountedRef.current = true
    connectWebSocket()
    return () => {
      wsMountedRef.current = false
      if (wsReconnectRef.current) clearTimeout(wsReconnectRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null // prevent reconnect during cleanup
        wsRef.current.close()
      }
    }
  }, [connectWebSocket])

  // ─── Toast helper ───────────────────────────────────────────
  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }, [])

  // ─── Load scripts on mount ──────────────────────────────────
  const loadScripts = useCallback(async () => {
    setScriptsLoading(true)
    try {
      const list = await scriptsApi.list()
      setScripts(list)
    } catch (e) {
      console.error('Failed to load scripts:', e)
      // Backend not running — show empty state, not a crash
      setScripts([])
    } finally {
      setScriptsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadScripts()
    // Load frames
    framesApi.list().then(setFrames).catch(() => setFrames([]))
    // Load music tracks
    musicApi.list().then(setMusicTracks).catch(() => setMusicTracks([]))
    // Load disk usage
    diskApi.usage().then(setDiskUsage).catch(() => setDiskUsage(null))
    // Load GPU capabilities (for long-scene warnings)
    comfyuiApi.capabilities().then(setGpuCaps).catch(() => setGpuCaps(null))
  }, [loadScripts])

  // ─── ComfyUI status polling ─────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      try {
        const status = await comfyuiApi.status()
        setComfyuiStatus(status)
      } catch {
        setComfyuiStatus(null)
      }
    }
    poll()
    const interval = setInterval(poll, 10000)
    return () => clearInterval(interval)
  }, [])

  // ─── Scene status polling (when active script has rendering scenes) ───
  const startScenePolling = useCallback(() => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    pollIntervalRef.current = setInterval(async () => {
      if (!activeScript) return
      const hasActive = scenes.some((s) => s.status === 'rendering' || s.status === 'queued' || s.status === 'unknown')
      if (!hasActive) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }
        return
      }
      try {
        const result = await comfyuiApi.pollStatus(activeScript.id)
        setScenes(result.scenes)
        setComfyuiStatus(result.comfyui)
      } catch (e) {
        console.error('Poll failed:', e)
      }
    }, 2000)
  }, [activeScript, scenes])

  useEffect(() => {
    const hasActive = scenes.some((s) => s.status === 'rendering' || s.status === 'queued' || s.status === 'unknown')
    if (hasActive && activeScript) {
      startScenePolling()
    }
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [scenes, activeScript, startScenePolling])

  // ─── Completion notification ────────────────────────────────
  // Detect when scenes transition from rendering/queued to all complete
  useEffect(() => {
    const activeCount = scenes.filter((s) => s.status === 'rendering' || s.status === 'queued').length
    const completeCount = scenes.filter((s) => s.status === 'complete').length

    // If we had active scenes before and now none are active, and there are completed scenes
    if (prevRenderingCountRef.current > 0 && activeCount === 0 && completeCount > 0) {
      showToast(`All ${completeCount} scene${completeCount > 1 ? 's' : ''} finished rendering`, 'success')
    }
    prevRenderingCountRef.current = activeCount
  }, [scenes, showToast])

  // ─── Select script ──────────────────────────────────────────
  const handleSelectScript = useCallback(async (script: Script) => {
    setActiveScript(script)
    try {
      const sceneList = await scenesApi.list(script.id)
      setScenes(sceneList)
    } catch (e) {
      console.error('Failed to load scenes:', e)
      setScenes([])
    }
  }, [])

  // ─── Submit script to pipeline ──────────────────────────────
  const handleSubmitScript = useCallback(
    async (script: Script) => {
      showToast(`Submitting "${script.title}" to pipeline...`, 'info')
      setPipelineProgress({ stage: 'Starting', message: 'Submitting script to pipeline...', percent: 0 })
      try {
        await scriptsApi.submit(script.id)
        // Start polling for progress
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = setInterval(async () => {
          try {
            const progress = await scriptsApi.progress(script.id)
            setPipelineProgress(progress)
            if (progress.percent >= 100) {
              if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current)
                progressIntervalRef.current = null
              }
              setPipelineProgress(null)
              showToast('Pipeline complete! Scenes populated.', 'success')
              // Reload scenes
              const sceneList = await scenesApi.list(script.id)
              setScenes(sceneList)
              loadScripts()
            } else {
              // Partially reload scenes to show incremental population
              const sceneList = await scenesApi.list(script.id)
              setScenes(sceneList)
            }
          } catch (e) {
            console.error('Progress poll failed:', e)
          }
        }, 3000)
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Failed to submit script', 'error')
        setPipelineProgress(null)
      }
    },
    [showToast, loadScripts],
  )

  // ─── Scene operations ───────────────────────────────────────
  const updateScene = useCallback((sceneId: string, updates: Partial<Scene>) => {
    setScenes((prev) => prev.map((s) => (s.id === sceneId ? { ...s, ...updates } : s)))
  }, [])

  const handlePromptChange = useCallback(
    async (sceneId: string, prompt: string) => {
      updateScene(sceneId, { prompt })
      if (activeScript) {
        try {
          await scenesApi.update(activeScript.id, sceneId, { prompt })
        } catch (e) {
          console.error('Failed to save prompt:', e)
        }
      }
    },
    [activeScript, updateScene],
  )

  const handleDurationChange = useCallback(
    async (sceneId: string, duration: number) => {
      const clamped = Math.max(5, duration)
      updateScene(sceneId, { duration: clamped })
      if (activeScript) {
        try {
          await scenesApi.update(activeScript.id, sceneId, { duration: clamped })
        } catch (e) {
          console.error('Failed to save duration:', e)
        }
      }
    },
    [activeScript, updateScene],
  )

  // Shared submit body — performs the actual ComfyUI submission
  const submitSceneDirect = useCallback(
    async (sceneId: string, toastMsg: string) => {
      if (!activeScript) return
      updateScene(sceneId, { status: 'queued' })
      showToast(toastMsg, 'info')
      try {
        const result = await comfyuiApi.submitScene(activeScript.id, sceneId)
        updateScene(sceneId, {
          status: result.status,
          comfyui_prompt_id: result.comfyui_prompt_id,
        })
        showToast(`Scene submitted to ComfyUI`, 'success')
      } catch (e) {
        updateScene(sceneId, {
          status: 'error',
          error_message: e instanceof Error ? e.message : 'Submit failed',
        })
        showToast(e instanceof Error ? e.message : 'Failed to submit scene', 'error')
      }
    },
    [activeScript, updateScene, showToast],
  )

  // Long-scene helper: scenes over the GPU-specific threshold cause dramatic
  // render slowdowns (VRAM spillover / dynamic offloading). Returns the list
  // of offending scenes, or empty if none / capabilities unknown.
  const getLongScenes = useCallback(
    (sceneList: Scene[]) => {
      const threshold = gpuCaps?.long_scene_threshold ?? 15
      return sceneList
        .filter((s) => s.duration > threshold)
        .map((s) => ({ sceneNumber: s.scene_number, duration: s.duration, id: s.id }))
    },
    [gpuCaps],
  )

  const handleSubmitScene = useCallback(
    async (sceneId: string) => {
      if (!activeScript) return

      // Check if scene has audio — if not, show warning before submitting
      const scene = scenes.find((s) => s.id === sceneId)
      if (scene && !scene.audio_url) {
        setPendingSubmit({ sceneId, sceneNumber: scene.scene_number })
        return
      }

      // Audio longer than duration — warn that audio will be cropped
      if (scene?.audio_duration && scene.audio_duration > scene.duration + 0.5) {
        setPendingCrop({
          sceneId,
          sceneNumber: scene.scene_number,
          duration: scene.duration,
          audioDuration: scene.audio_duration,
        })
        return
      }

      // Scene longer than the GPU's recommended length — warn about render time
      const longScenes = getLongScenes([scene as Scene])
      if (scene && longScenes.length > 0) {
        setPendingLongScene({
          scenes: longScenes,
          threshold: gpuCaps?.long_scene_threshold ?? 15,
          gpuName: gpuCaps?.gpu_name ?? null,
          vramGb: gpuCaps?.vram_total_gb ?? null,
          onConfirm: () => submitSceneDirect(sceneId, 'Submitting scene to ComfyUI...'),
        })
        return
      }

      // Scene has audio (or user confirmed) — submit now
      await submitSceneDirect(sceneId, 'Submitting scene to ComfyUI...')
    },
    [activeScript, submitSceneDirect, scenes, getLongScenes, gpuCaps],
  )

  // Submit after user confirms the no-audio warning
  const handleSubmitSceneConfirmed = useCallback(
    async (sceneId: string) => {
      setPendingSubmit(null)
      await submitSceneDirect(sceneId, 'Submitting scene to ComfyUI (no audio)...')
    },
    [submitSceneDirect],
  )

  // Submit after user confirms the crop warning
  const handleSubmitCropConfirmed = useCallback(
    async (sceneId: string) => {
      setPendingCrop(null)
      await submitSceneDirect(sceneId, 'Submitting scene to ComfyUI (audio will be cropped)...')
    },
    [submitSceneDirect],
  )

  const handleSubmitAll = useCallback(async () => {
    if (!activeScript) return
    const readyScenes = scenes.filter((s) => s.status === 'ready' || s.status === 'draft')
    if (readyScenes.length === 0) {
      showToast('No ready scenes to submit', 'info')
      return
    }
    // Long-scene warning for Submit All too
    const longScenes = getLongScenes(readyScenes)
    if (longScenes.length > 0) {
      setPendingLongScene({
        scenes: longScenes,
        threshold: gpuCaps?.long_scene_threshold ?? 15,
        gpuName: gpuCaps?.gpu_name ?? null,
        vramGb: gpuCaps?.vram_total_gb ?? null,
        onConfirm: () => { doSubmitAll(readyScenes.map((s) => s.id)) },
      })
      return
    }
    doSubmitAll(readyScenes.map((s) => s.id))
  }, [activeScript, scenes, getLongScenes, gpuCaps, showToast])

  // The actual Submit All execution — extracted so the long-scene warning
  // can gate it
  const doSubmitAll = useCallback(
    async (sceneIds: string[]) => {
      if (!activeScript) return
      showToast(`Submitting ${sceneIds.length} scenes to ComfyUI...`, 'info')
      sceneIds.forEach((id) => updateScene(id, { status: 'queued' }))
      try {
        const result = await comfyuiApi.submitAll(activeScript.id)
        if (result.errors && Object.keys(result.errors).length > 0) {
          showToast(`${result.submitted.length} submitted, ${Object.keys(result.errors).length} errors`, 'error')
          Object.entries(result.errors).forEach(([id, err]) => updateScene(id, { status: 'error', error_message: err }))
        } else {
          showToast(`${result.submitted.length} scenes submitted!`, 'success')
        }
        // Reload scenes to get updated statuses
        const sceneList = await scenesApi.list(activeScript.id)
        setScenes(sceneList)
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Failed to submit all', 'error')
      }
    },
    [activeScript, updateScene, showToast],
  )

  // Confirm from the long-scene warning dialog
  const handleLongSceneConfirmed = useCallback(() => {
    const action = pendingLongScene?.onConfirm
    setPendingLongScene(null)
    if (action) action()
  }, [pendingLongScene])

  const handleDeleteScene = useCallback(
    (sceneId: string) => {
      if (!activeScript) return
      // Check if scene has renders — show confirmation
      const scene = scenes.find((s) => s.id === sceneId)
      const renderCount = scene?.renders?.length ?? 0
      if (renderCount > 0) {
        setPendingDelete({ sceneId, renderCount })
        return
      }
      // No renders — delete directly
      doDeleteScene(sceneId)
    },
    [activeScript, scenes],
  )

  const doDeleteScene = useCallback(
    async (sceneId: string) => {
      if (!activeScript) return
      try {
        await scenesApi.delete(activeScript.id, sceneId)
        // Reload all scenes from backend to get correct scene_numbers
        const sceneList = await scenesApi.list(activeScript.id)
        setScenes(sceneList)
        showToast('Scene deleted', 'info')
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Failed to delete', 'error')
      }
    },
    [activeScript, showToast],
  )

  const handleDeleteConfirmed = useCallback(
    (sceneId: string) => {
      setPendingDelete(null)
      doDeleteScene(sceneId)
    },
    [doDeleteScene],
  )

  const handleSwitchRender = useCallback(
    async (sceneId: string, renderId: string) => {
      if (!activeScript) return
      try {
        const updated = await scenesApi.setActiveRender(activeScript.id, sceneId, renderId)
        setScenes((prev) => prev.map((s) => (s.id === sceneId ? { ...s, ...updated } : s)))
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Failed to switch render', 'error')
      }
    },
    [activeScript, showToast],
  )

  const handleReorder = useCallback(
    async (sceneIds: string[]) => {
      if (!activeScript) return
      // Optimistically reorder locally for instant feedback
      setScenes((prev) => {
        const byId = new Map(prev.map((s) => [s.id, s]))
        const reordered = sceneIds.map((id) => byId.get(id)).filter(Boolean) as Scene[]
        // Append any scenes not in the list (shouldn't happen, but safe)
        for (const s of prev) {
          if (!sceneIds.includes(s.id)) reordered.push(s)
        }
        // Update scene_number based on new position
        return reordered.map((s, i) => ({ ...s, scene_number: i + 1 }))
      })
      try {
        await scenesApi.reorder(activeScript.id, sceneIds)
        // Reload from backend to get authoritative scene_numbers
        const sceneList = await scenesApi.list(activeScript.id)
        setScenes(sceneList)
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Failed to reorder', 'error')
        // Reload to restore correct order
        const sceneList = await scenesApi.list(activeScript.id)
        setScenes(sceneList)
      }
    },
    [activeScript, showToast],
  )

  const handleDeleteRender = useCallback(
    (sceneId: string, renderId: string) => {
      if (!activeScript) return
      const scene = scenes.find((s) => s.id === sceneId)
      if (!scene || !scene.renders) return
      const versionIdx = scene.renders.findIndex((r) => r.render_id === renderId)
      setPendingDeleteRender({
        sceneId,
        renderId,
        sceneNumber: scene.scene_number,
        versionIdx: versionIdx >= 0 ? versionIdx + 1 : 0,
      })
    },
    [activeScript, scenes],
  )

  const handleDeleteRenderConfirmed = useCallback(
    async (sceneId: string, renderId: string) => {
      if (!activeScript) return
      setPendingDeleteRender(null)
      try {
        const result = await scenesApi.deleteRender(activeScript.id, sceneId, renderId)
        if (result.scene) {
          setScenes((prev) => prev.map((s) => (s.id === sceneId ? { ...s, ...result.scene } : s)))
        }
        showToast('Render version deleted (file moved to Recycle Bin)', 'info')
        // Refresh disk usage
        diskApi.usage().then(setDiskUsage).catch(() => {})
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Failed to delete render', 'error')
      }
    },
    [activeScript, showToast],
  )

  const handleDeleteScript = useCallback(
    (script: Script) => {
      setPendingDeleteScript(script)
    },
    [],
  )

  const handleDeleteScriptConfirmed = useCallback(
    async (scriptId: string) => {
      const script = pendingDeleteScript
      setPendingDeleteScript(null)
      if (!script) return
      try {
        await scriptsApi.delete(scriptId)
        showToast(`Project "${script.title}" deleted (files moved to Recycle Bin)`, 'info')
        // Clear active script if it was the one deleted
        if (activeScript?.id === scriptId) {
          setActiveScript(null)
          setScenes([])
        }
        loadScripts()
        // Refresh disk usage
        diskApi.usage().then(setDiskUsage).catch(() => {})
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Failed to delete project', 'error')
      }
    },
    [pendingDeleteScript, activeScript, showToast, loadScripts],
  )

  const handleCleanupOutputs = useCallback(
    async () => {
      setCleaningOutputs(true)
      try {
        const result = await comfyuiApi.cleanupOutputs(0)
        if (result.error) {
          showToast(`ComfyUI output error: ${result.error}`, 'error')
        } else if (result.freed_count > 0) {
          showToast(`Cleaned ${result.freed_count} files (${result.freed_size_formatted}) from ComfyUI output`, 'success')
        } else {
          showToast('No files to clean in ComfyUI output', 'info')
        }
        // Refresh disk usage
        diskApi.usage().then(setDiskUsage).catch(() => {})
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Failed to clean ComfyUI outputs', 'error')
      } finally {
        setCleaningOutputs(false)
      }
    },
    [showToast],
  )

  const handleInsertScene = useCallback(
    async (afterSceneId: string | null) => {
      if (!activeScript) return
      try {
        await scenesApi.insert(activeScript.id, afterSceneId)
        // Reload all scenes from backend to get correct scene_numbers
        const sceneList = await scenesApi.list(activeScript.id)
        setScenes(sceneList)
        showToast('New scene inserted', 'success')
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Failed to insert scene', 'error')
      }
    },
    [activeScript, showToast],
  )

  const handleFrameUpload = useCallback(
    async (sceneId: string, file: File) => {
      if (!activeScript) return
      showToast('Uploading frame...', 'info')
      try {
        const updated = await scenesApi.uploadFrame(activeScript.id, sceneId, file)
        updateScene(sceneId, { initial_frame_url: updated.initial_frame_url })
        showToast('Frame uploaded', 'success')
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Failed to upload frame', 'error')
      }
    },
    [activeScript, updateScene, showToast],
  )

  const handleAudioUpload = useCallback(
    async (sceneId: string, file: File) => {
      if (!activeScript) return
      showToast('Uploading audio...', 'info')
      try {
        const updated = await scenesApi.uploadAudio(activeScript.id, sceneId, file)
        updateScene(sceneId, {
          audio_url: updated.audio_url,
          audio_duration: updated.audio_duration ?? null,
          // Backend auto-adjusts duration to the audio length (rounded up)
          ...(updated.duration ? { duration: updated.duration } : {}),
        })
        const dur = updated.audio_duration
        if (dur && updated.duration) {
          showToast(`Audio uploaded — duration adjusted to ${updated.duration}s to fit audio`, 'success')
        } else {
          showToast('Audio uploaded', 'success')
        }
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Failed to upload audio', 'error')
      }
    },
    [activeScript, updateScene, showToast],
  )

  const handleGenerateAudio = useCallback(
    async (sceneId: string, voiceId?: string) => {
      if (!activeScript) return
      showToast('Generating audio via VoxCPM2...', 'info')
      try {
        const updated = await scenesApi.generateAudio(activeScript.id, sceneId, voiceId)
        updateScene(sceneId, { audio_url: updated.audio_url, voice_id: voiceId ?? null })
        showToast('Audio generated!', 'success')
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Failed to generate audio', 'error')
      }
    },
    [activeScript, updateScene, showToast],
  )

  const handleFeedback = useCallback(
    async (sceneId: string, feedback: string) => {
      if (!activeScript) return
      updateScene(sceneId, { feedback })
      try {
        await scenesApi.submitFeedback(activeScript.id, sceneId, feedback)
        showToast('Feedback saved', 'success')
      } catch (e) {
        console.error('Failed to save feedback:', e)
      }
    },
    [activeScript, updateScene, showToast],
  )

  const handleRerender = useCallback(
    async (sceneId: string) => {
      if (!activeScript) return
      updateScene(sceneId, { status: 'queued', render_progress: 0 })
      try {
        const result = await comfyuiApi.submitScene(activeScript.id, sceneId)
        updateScene(sceneId, {
          status: result.status,
          comfyui_prompt_id: result.comfyui_prompt_id,
        })
        showToast('Re-rendering scene...', 'info')
      } catch (e) {
        updateScene(sceneId, {
          status: 'error',
          error_message: e instanceof Error ? e.message : 'Re-render failed',
        })
        showToast(e instanceof Error ? e.message : 'Failed to re-render', 'error')
      }
    },
    [activeScript, updateScene, showToast],
  )

  const handleCancelRender = useCallback(
    async (sceneId: string) => {
      if (!activeScript) return
      showToast('Cancelling render...', 'info')
      try {
        await comfyuiApi.cancelScene(activeScript.id, sceneId)
        updateScene(sceneId, { status: 'draft', comfyui_prompt_id: null, render_progress: 0 })
        showToast('Render cancelled', 'info')
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Failed to cancel', 'error')
      }
    },
    [activeScript, updateScene, showToast],
  )

  const handleFrameAssign = useCallback(
    async (frame: FrameCatalogItem, sceneId: string) => {
      if (!activeScript) return
      // Extract filename from source_path or use frame id
      const filename = frame.source_path
        ? frame.source_path.split(/[\\/]/).pop() || frame.id
        : frame.frame_id || frame.id
      updateScene(sceneId, { initial_frame_url: frame.url } as Partial<Scene>)
      try {
        const updated = await scenesApi.update(activeScript.id, sceneId, {
          frame_filename: filename,
          frame_id: frame.frame_id || frame.id,
        } as Partial<Scene>)
        // Use authoritative URL from backend if available
        if (updated?.initial_frame_url) {
          updateScene(sceneId, { initial_frame_url: updated.initial_frame_url } as Partial<Scene>)
        }
        showToast('Frame assigned to scene', 'success')
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Failed to assign frame', 'error')
      }
    },
    [activeScript, updateScene, showToast],
  )

  const handleFrameUploadCatalog = useCallback(
    async (file: File) => {
      showToast('Uploading frame to catalog...', 'info')
      try {
        const item = await framesApi.upload(file)
        setFrames((prev) => [item, ...prev])
        showToast('Frame added to catalog', 'success')
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Failed to upload frame', 'error')
      }
    },
    [showToast],
  )

  // ─── B-roll handlers ────────────────────────────────────────
  const handleBrollUpload = useCallback(
    async (sceneId: string, file: File) => {
      if (!activeScript) return
      showToast('Uploading B-roll...', 'info')
      try {
        const updated = await brollApi.upload(activeScript.id, sceneId, file)
        updateScene(sceneId, {
          broll_filename: updated.broll_filename,
          broll_url: updated.broll_url,
          broll_volume: updated.broll_volume,
        })
        showToast('B-roll uploaded', 'success')
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Failed to upload B-roll', 'error')
      }
    },
    [activeScript, updateScene, showToast],
  )

  const handleBrollRemove = useCallback(
    async (sceneId: string) => {
      if (!activeScript) return
      updateScene(sceneId, { broll_filename: null, broll_url: null })
      try {
        await brollApi.remove(activeScript.id, sceneId)
        showToast('B-roll removed', 'info')
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Failed to remove B-roll', 'error')
      }
    },
    [activeScript, updateScene, showToast],
  )

  const handleBrollVolumeChange = useCallback(
    async (sceneId: string, volume: number) => {
      if (!activeScript) return
      updateScene(sceneId, { broll_volume: volume })
      try {
        await brollApi.update(activeScript.id, sceneId, { broll_volume: volume })
      } catch (e) {
        console.error('Failed to update B-roll volume:', e)
      }
    },
    [activeScript, updateScene],
  )

  // ─── Wizard handlers ────────────────────────────────────────
  const handleStartWizard = useCallback(() => {
    setWizardScript(activeScript)
    setShowWizard(true)
  }, [activeScript])

  const handleWizardScriptCreated = useCallback(
    async (script: Script) => {
      setWizardScript(script)
      setActiveScript(script)
      await loadScripts()
    },
    [loadScripts],
  )

  const handleWizardScenesUpdated = useCallback(async () => {
    if (wizardScript || activeScript) {
      const scriptId = wizardScript?.id || activeScript?.id
      if (scriptId) {
        try {
          const sceneList = await scenesApi.list(scriptId)
          setScenes(sceneList)
        } catch (e) {
          console.error('Failed to reload scenes:', e)
        }
      }
    }
  }, [wizardScript, activeScript])

  const handleWizardExportComplete = useCallback(
    (exportInfo: { filename: string; url: string }) => {
      showToast(`Export complete: ${exportInfo.filename}`, 'success')
    },
    [showToast],
  )

  // ─── Render ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <Header
        comfyuiStatus={comfyuiStatus}
        sceneCount={scenes.length}
        activeScriptTitle={activeScript?.title ?? null}
        onStartWizard={handleStartWizard}
        queueTimeEstimate={queueTimeEstimate > 0 ? queueTimeEstimate : null}
        diskSizeFormatted={diskUsage?.total_size_formatted ?? null}
        onDiskUsageClick={() => setShowDiskUsage(true)}
        onCleanupOutputs={handleCleanupOutputs}
        cleaningOutputs={cleaningOutputs}
      />

      <div className="flex flex-1 overflow-hidden">
        {(!activeScript && !showProjectsPanel) ? (
          /* ─── Landing: clean, no sidebar ─── */
          <Landing
            onBrowseProjects={() => setShowProjectsPanel(true)}
            onProjectCreated={(script) => {
              setShowProjectsPanel(false)
              handleSelectScript(script)
            }}
            onScriptFormatted={(result) => {
              // TODO(M5a-5): open the doc view with the formatted script.
              // For now, surface the parse result so the flow is testable.
              showToast(`Formatted "${result.title}" — ${result.characters.length} characters, ${Array.isArray(result.lines) ? result.lines.length : 0} lines (doc view coming next)`, 'info')
            }}
            showToast={showToast}
          />
        ) : (
        <>
        {/* Sidebar */}
        <aside className="w-80 flex-shrink-0 border-r border-zinc-800 bg-zinc-950 flex flex-col">
          {/* Tab switcher */}
          <div className="flex gap-1 p-3 border-b border-zinc-800">
            <button
              onClick={() => { setSidebarTab('scripts'); setShowProjectsPanel(true) }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                sidebarTab === 'scripts'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Projects
            </button>
            <button
              onClick={() => setSidebarTab('frames')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                sidebarTab === 'frames'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Frames
            </button>
            <button
              onClick={() => setSidebarTab('music')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                sidebarTab === 'music'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Music
            </button>
          </div>

          <div className="flex-1 p-4 overflow-hidden flex flex-col">
            {sidebarTab === 'scripts' ? (
              <ScriptLibrary
                scripts={scripts}
                activeScriptId={activeScript?.id ?? null}
                loading={scriptsLoading}
                onSelect={handleSelectScript}
                onCreated={loadScripts}
                onSubmitScript={handleSubmitScript}
                onDeleteScript={handleDeleteScript}
                pipelineProgress={pipelineProgress}
              />
            ) : sidebarTab === 'frames' ? (
              <FrameCatalog
                frames={frames}
                onAssign={handleFrameAssign}
                onUpload={handleFrameUploadCatalog}
                sceneIds={scenes.map((s) => ({ id: s.id, number: s.scene_number }))}
              />
            ) : (
              <MusicPanel
                selectedTrackId={selectedMusicTrack}
                onSelectTrack={setSelectedMusicTrack}
              />
            )}
          </div>
        </aside>

        {/* Main content — Timeline */}
        <main className="flex-1 overflow-hidden p-6 flex flex-col">
          <Timeline
            scenes={scenes}
            scriptId={activeScript?.id ?? ''}
            onPromptChange={handlePromptChange}
            onDurationChange={handleDurationChange}
            onSubmit={handleSubmitScene}
            onDelete={handleDeleteScene}
            onInsert={handleInsertScene}
            onFrameUpload={handleFrameUpload}
            onFrameAssign={handleFrameAssign}
            onAudioUpload={handleAudioUpload}
            onGenerateAudio={handleGenerateAudio}
            onFeedback={handleFeedback}
            onRerender={handleRerender}
            onCancelRender={handleCancelRender}
            onSubmitAll={handleSubmitAll}
            onBrollUpload={handleBrollUpload}
            onBrollRemove={handleBrollRemove}
            onBrollVolumeChange={handleBrollVolumeChange}
            onExport={() => setShowExportPanel(true)}
            onSwitchRender={handleSwitchRender}
            onDeleteRender={handleDeleteRender}
            onReorder={handleReorder}
            />
        </main>
        </>
        )}
      </div>

      {/* Export panel overlay */}
      {showExportPanel && activeScript && (
        <div className="fixed inset-0 z-50 bg-zinc-950/95 backdrop-blur-md flex items-center justify-center p-6">
          <div className="w-full max-w-2xl max-h-[85vh] bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <div className="text-lg font-semibold tracking-tight text-zinc-100">Export & Assembly</div>
              <button
                onClick={() => setShowExportPanel(false)}
                className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 flex items-center justify-center transition-all"
              >
                x
              </button>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin p-5">
              <ExportPanel
                scriptId={activeScript.id}
                scenes={scenes}
                onExportComplete={handleWizardExportComplete}
              />
            </div>
          </div>
        </div>
      )}

      {/* Workflow wizard overlay */}
      {showWizard && (
        <WorkflowWizard
          script={wizardScript ?? activeScript}
          scenes={scenes}
          onClose={() => setShowWizard(false)}
          onScriptCreated={handleWizardScriptCreated}
          onScenesUpdated={handleWizardScenesUpdated}
          onScriptSubmit={handleSubmitScript}
          onExportComplete={handleWizardExportComplete}
        />
      )}

      {/* No-audio submit warning */}
      {pendingSubmit && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md mx-4">
            <div className="text-sm font-semibold text-zinc-100 mb-2">
              No audio added to Scene {pendingSubmit.sceneNumber}
            </div>
            <div className="text-xs text-zinc-400 mb-4 leading-relaxed">
              The video model will generate audio on its own from the prompt context
              (ambient sounds, effects, etc.), but you won't have control over specific
              voices or dialogue. Adding audio lets you pick a voice, preview the
              performance, and drive lip sync before rendering.
            </div>
            <div className="text-xs text-zinc-500 mb-4">
              Continue without audio?
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingSubmit(null)}
                className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSubmitSceneConfirmed(pendingSubmit.sceneId)}
                className="flex-1 px-4 py-2.5 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-xl transition-all"
              >
                Submit Without Audio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audio-crop submit warning */}
      {pendingCrop && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md mx-4">
            <div className="text-sm font-semibold text-zinc-100 mb-2">
              Audio will be cropped in Scene {pendingCrop.sceneNumber}
            </div>
            <div className="text-xs text-zinc-400 mb-4 leading-relaxed">
              The audio is {Math.ceil(pendingCrop.audioDuration)}s but you set the duration to {pendingCrop.duration}s.
              The audio will be trimmed to {pendingCrop.duration}s — anything after that point is cut off. The video
              length matches the duration field.
            </div>
            <div className="text-xs text-zinc-500 mb-4">
              Continue with cropping, or cancel to adjust the duration first?
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingCrop(null)}
                className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSubmitCropConfirmed(pendingCrop.sceneId)}
                className="flex-1 px-4 py-2.5 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-xl transition-all"
              >
                Crop and Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Long-scene (GPU) submit warning */}
      {pendingLongScene && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md mx-4">
            <div className="text-sm font-semibold text-zinc-100 mb-2">
              {pendingLongScene.scenes.length === 1
                ? `Scene ${pendingLongScene.scenes[0].sceneNumber} is longer than recommended`
                : `${pendingLongScene.scenes.length} scenes are longer than recommended`}
            </div>
            <div className="text-xs text-zinc-400 mb-3 leading-relaxed">
              {pendingLongScene.scenes
                .map((s) => `Scene ${s.sceneNumber} (${s.duration}s)`)
                .join(', ')}{' '}
              exceed{pendingLongScene.scenes.length === 1 ? 's' : ''} the {pendingLongScene.threshold}s
              recommendation for your GPU
              {pendingLongScene.gpuName ? ` (${pendingLongScene.gpuName}` : ''}
              {pendingLongScene.vramGb ? `, ${pendingLongScene.vramGb}GB VRAM)` : ')'}. Rendering these scenes
              causes VRAM spillover and can triple the render time.
            </div>
            <div className="text-xs text-zinc-500 mb-4">
              Submit anyway, or cancel to shorten the scenes first?
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingLongScene(null)}
                className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleLongSceneConfirmed}
                className="flex-1 px-4 py-2.5 bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium rounded-xl transition-all"
              >
                Submit Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete scene confirmation — when scene has renders */}
      {pendingDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md mx-4">
            <div className="text-sm font-semibold text-zinc-100 mb-2">
              Delete scene?
            </div>
            <div className="text-xs text-zinc-400 mb-4 leading-relaxed">
              This will discard {pendingDelete.renderCount} render{pendingDelete.renderCount > 1 ? 's' : ''}.
              Delete scene?
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingDelete(null)}
                className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteConfirmed(pendingDelete.sceneId)}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-xl transition-all"
              >
                Delete Scene
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Render version delete confirmation */}
      {pendingDeleteRender && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md mx-4">
            <div className="text-sm font-semibold text-zinc-100 mb-2">
              Delete render version?
            </div>
            <div className="text-xs text-zinc-400 mb-4 leading-relaxed">
              Delete v{pendingDeleteRender.versionIdx} of Scene {pendingDeleteRender.sceneNumber}?
              The file will go to Recycle Bin.
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingDeleteRender(null)}
                className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteRenderConfirmed(pendingDeleteRender.sceneId, pendingDeleteRender.renderId)}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-xl transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Script (project) delete confirmation with file count and size */}
      {pendingDeleteScript && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md mx-4">
            <div className="text-sm font-semibold text-zinc-100 mb-2">
              Delete project '{pendingDeleteScript.title}'?
            </div>
            <div className="text-xs text-zinc-400 mb-4 leading-relaxed">
              This will move all associated files (videos, audio, scenes, script) to the Recycle Bin.
              This cannot be undone from within the app.
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingDeleteScript(null)}
                className="flex-1 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteScriptConfirmed(pendingDeleteScript.id)}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-xl transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disk usage detail modal */}
      {showDiskUsage && diskUsage && (
        <div className="fixed inset-0 z-50 bg-zinc-950/95 backdrop-blur-md flex items-center justify-center p-6">
          <div className="w-full max-w-2xl max-h-[85vh] bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <div className="text-lg font-semibold tracking-tight text-zinc-100">Disk Usage</div>
              <button
                onClick={() => setShowDiskUsage(false)}
                className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 flex items-center justify-center transition-all"
              >
                x
              </button>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-5">
              {/* Total */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                <div className="text-[10px] text-zinc-500 tracking-[1px] uppercase mb-1">Total Data</div>
                <div className="text-2xl font-bold text-zinc-100">{diskUsage.total_size_formatted}</div>
                <div className="text-xs text-zinc-500 mt-0.5">{diskUsage.total_files} files</div>
              </div>

              {/* Category breakdown */}
              <div>
                <div className="text-[10px] text-zinc-500 tracking-[1px] uppercase mb-2">By Category</div>
                <div className="space-y-1.5">
                  {Object.entries(diskUsage.categories)
                    .filter(([, info]) => info.files > 0)
                    .sort(([, a], [, b]) => b.bytes - a.bytes)
                    .map(([name, info]) => (
                      <div key={name} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-zinc-300 capitalize">{name}</span>
                          <span className="text-[10px] text-zinc-600">{info.files} files</span>
                        </div>
                        <span className="text-sm font-mono text-zinc-400">{info.size_formatted}</span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Per-project breakdown */}
              {diskUsage.projects.length > 0 && (
                <div>
                  <div className="text-[10px] text-zinc-500 tracking-[1px] uppercase mb-2">By Project</div>
                  <div className="space-y-1.5">
                    {diskUsage.projects
                      .sort((a, b) => b.total_bytes - a.total_bytes)
                      .map((p) => (
                        <div key={p.script_id} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-zinc-300 truncate flex-1">{p.title}</span>
                            <span className="text-sm font-mono text-zinc-400 ml-2">{p.size_formatted}</span>
                          </div>
                          <div className="text-[10px] text-zinc-600">
                            {p.file_count} files
                            {p.breakdown.videos?.files ? ` · ${p.breakdown.videos.size_formatted} video` : ''}
                            {p.breakdown.audio?.files ? ` · ${p.breakdown.audio.size_formatted} audio` : ''}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast notifications */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl border shadow-2xl text-sm font-medium transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : toast.type === 'error'
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : 'bg-zinc-900 border-zinc-700 text-zinc-200'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}