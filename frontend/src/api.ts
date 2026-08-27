// API client for the ComfyUI Video Workflow backend (FastAPI at localhost:8503)
// Uses Vite dev proxy: /api -> http://localhost:8503
// When built and served by FastAPI, /api is served from the same origin

import type {
  Scene,
  Script,
  ComfyUIStatus,
  SubmitSceneResponse,
  PipelineSubmitResponse,
  PipelineProgress,
  FrameCatalogItem,
  MusicTrack,
  MusicProviderConfig,
  AssemblyRequest,
  AssemblyProgress,
  ExportVideo,
  RenderVersion,
} from './types'

const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(`${BASE}${path}`, {
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
      ...options,
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`API ${res.status}: ${body}`)
    }
    if (res.status === 204) return undefined as T
    return res.json() as Promise<T>
  } finally {
    clearTimeout(timeout)
  }
}

// ─── Scripts ────────────────────────────────────────────────

export const scriptsApi = {
  list: async () => {
    const res = await request<Script[] | { scripts: any[] }>('/scripts')
    const raw = Array.isArray(res) ? res : res.scripts
    // Map backend fields to frontend Script type
    return raw.map((s: any) => ({
      id: s.script_id || s.id,
      title: s.title || '',
      content: s.content || '',
      status: s.status || 'draft',
      scene_count: s.scene_count ?? 0,
      tags: s.tags || [],
      created_at: s.created || s.created_at || '',
      updated_at: s.updated || s.updated_at || '',
    })) as Script[]
  },

  get: async (id: string) => {
    const s = await request<any>(`/scripts/${id}`)
    return {
      id: s.script_id || s.id,
      title: s.title || '',
      content: s.content || '',
      status: s.status || 'draft',
      scene_count: s.scene_count ?? 0,
      tags: s.tags || [],
      created_at: s.created || s.created_at || '',
      updated_at: s.updated || s.updated_at || '',
    } as Script
  },

  create: (title: string, content: string) =>
    request<Script>('/scripts', {
      method: 'POST',
      body: JSON.stringify({ title, content }),
    }),

  update: (id: string, updates: Partial<Pick<Script, 'title' | 'content' | 'tags'>>) =>
    request<Script>(`/scripts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  delete: (id: string) =>
    request<{
      deleted: boolean
      script_id: string
      title: string
      files_moved: number
      size_freed: number
      size_freed_formatted: string
    }>(`/scripts/${id}`, { method: 'DELETE' }),

  // Submit script to pipeline → breaks into scenes
  submit: (id: string) =>
    request<PipelineSubmitResponse>(`/scripts/${id}/submit`, {
      method: 'POST',
    }),

  // Get pipeline progress (SSE fallback — polled)
  progress: (id: string) =>
    request<PipelineProgress>(`/scripts/${id}/progress`),
}

// ─── Scenes ─────────────────────────────────────────────────

export const scenesApi = {
  list: async (scriptId: string) => {
    const res = await request<Scene[] | { scenes: Scene[] }>(`/scripts/${scriptId}/scenes`)
    return Array.isArray(res) ? res : res.scenes
  },

  get: (scriptId: string, sceneId: string) =>
    request<Scene>(`/scripts/${scriptId}/scenes/${sceneId}`),

  update: (scriptId: string, sceneId: string, updates: Partial<Scene>) =>
    request<Scene>(`/scripts/${scriptId}/scenes/${sceneId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  insert: (scriptId: string, afterSceneId: string | null) =>
    request<Scene>(`/scripts/${scriptId}/scenes/insert`, {
      method: 'POST',
      body: JSON.stringify({ after_scene_id: afterSceneId }),
    }),

  delete: (scriptId: string, sceneId: string) =>
    request<void>(`/scripts/${scriptId}/scenes/${sceneId}`, {
      method: 'DELETE',
    }),

  reorder: (scriptId: string, sceneIds: string[]) =>
    request<Scene[]>(`/scripts/${scriptId}/scenes/reorder`, {
      method: 'POST',
      body: JSON.stringify({ scene_ids: sceneIds }),
    }),

  // Upload initial frame
  uploadFrame: (scriptId: string, sceneId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return fetch(`${BASE}/scripts/${scriptId}/scenes/${sceneId}/frame`, {
      method: 'POST',
      body: formData,
    }).then(async (res) => {
      if (!res.ok) throw new Error(await res.text())
      return res.json() as Promise<Scene>
    })
  },

  // Upload audio
  uploadAudio: (scriptId: string, sceneId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return fetch(`${BASE}/scripts/${scriptId}/scenes/${sceneId}/audio`, {
      method: 'POST',
      body: formData,
    }).then(async (res) => {
      if (!res.ok) throw new Error(await res.text())
      return res.json() as Promise<Scene>
    })
  },

  // Generate audio via VoxCPM2
  generateAudio: (scriptId: string, sceneId: string, voiceId?: string) =>
    request<Scene>(`/scripts/${scriptId}/scenes/${sceneId}/generate-audio`, {
      method: 'POST',
      body: JSON.stringify({ voice_id: voiceId }),
    }),

  // Submit feedback
  submitFeedback: (scriptId: string, sceneId: string, feedback: string) =>
    request<void>(`/scripts/${scriptId}/scenes/${sceneId}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ feedback }),
    }),

  // List render versions
  listRenders: (scriptId: string, sceneId: string) =>
    request<{ renders: RenderVersion[]; active_render_id: string | null }>(
      `/scripts/${scriptId}/scenes/${sceneId}/renders`,
    ),

  // Set active render version
  setActiveRender: (scriptId: string, sceneId: string, renderId: string) =>
    request<Scene>(`/scripts/${scriptId}/scenes/${sceneId}/active-render`, {
      method: 'PATCH',
      body: JSON.stringify({ render_id: renderId }),
    }),

  // Delete a render version (sends video file to Recycle Bin)
  deleteRender: (scriptId: string, sceneId: string, renderId: string) =>
    request<{ success: boolean; deleted_render_id: string; scene: Scene }>(
      `/scripts/${scriptId}/scenes/${sceneId}/renders/${renderId}`,
      { method: 'DELETE' },
    ),
}

// ─── ComfyUI ────────────────────────────────────────────────

export const comfyuiApi = {
  status: () => request<ComfyUIStatus>('/comfyui/status'),

  submitScene: (scriptId: string, sceneId: string) =>
    request<SubmitSceneResponse>(
      `/comfyui/submit`,
      {
        method: 'POST',
        body: JSON.stringify({ script_id: scriptId, scene_id: sceneId }),
      },
    ),

  submitAll: (scriptId: string) =>
    request<{ submitted: string[]; errors: Record<string, string> }>(
      `/comfyui/submit-all`,
      {
        method: 'POST',
        body: JSON.stringify({ script_id: scriptId }),
      },
    ),

  // Poll all scenes for status updates
  pollStatus: (scriptId: string) =>
    request<{ scenes: Scene[]; comfyui: ComfyUIStatus }>(
      `/comfyui/poll`,
      {
        method: 'POST',
        body: JSON.stringify({ script_id: scriptId }),
      },
    ),

  // Cancel a scene's render
  cancelScene: (scriptId: string, sceneId: string) =>
    request<{ success: boolean; scene: Scene }>(
      `/comfyui/cancel?script_id=${scriptId}&scene_id=${sceneId}`,
      { method: 'POST' },
    ),

  // Interrupt all ComfyUI renders
  interrupt: () =>
    request<{ success: boolean }>(`/comfyui/interrupt`, { method: 'POST' }),

  // Clean up ComfyUI output files (send to Recycle Bin)
  cleanupOutputs: (olderThanDays: number = 0) =>
    request<{
      success: boolean
      total_files: number
      total_bytes: number
      total_size_formatted: string
      freed_count: number
      freed_bytes: number
      freed_size_formatted: string
      error: string | null
    }>(`/comfyui/cleanup-outputs`, {
      method: 'POST',
      body: JSON.stringify({ older_than_days: olderThanDays }),
    }),
}

// ─── Frame Catalog ──────────────────────────────────────────

export const framesApi = {
  list: async () => {
    const res = await request<FrameCatalogItem[] | { frames: FrameCatalogItem[] }>('/frames')
    const raw = Array.isArray(res) ? res : res.frames || []
    // Map backend fields to frontend expected shape
    return raw.map((f: any) => ({
      ...f,
      description: f.description || f.title || f.vision_result || '',
      url: f.url || (f.source_path ? `${BASE}/frames/file/${encodeURIComponent(f.source_path.split(/[\\/]/).pop() || f.id)}` : `${BASE}/frames/file/${encodeURIComponent(f.id)}`),
      tags: f.tags || [],
    })) as FrameCatalogItem[]
  },

  upload: (file: File, description?: string) => {
    const formData = new FormData()
    formData.append('file', file)
    if (description) formData.append('description', description)
    return fetch(`${BASE}/frames/upload`, {
      method: 'POST',
      body: formData,
    }).then(async (res) => {
      if (!res.ok) throw new Error(await res.text())
      return res.json() as Promise<FrameCatalogItem>
    })
  },
}

// ─── Audio ──────────────────────────────────────────────────

export const audioApi = {
  generate: (scriptId: string, sceneId: string) =>
    request<Scene>('/audio/generate', {
      method: 'POST',
      body: JSON.stringify({ script_id: scriptId, scene_id: sceneId }),
    }),

  fileUrl: (scriptId: string, filename: string) =>
    `${BASE}/audio/file/${scriptId}/${filename}`,

  // List available voices from the voice catalog
  listVoices: async () => {
    const res = await request<{ voices: VoiceOption[] }>('/audio/voices')
    return res.voices || []
  },
}

// ─── Voice types ─────────────────────────────────────────────

export interface VoiceOption {
  voice_id: string
  display_name: string
  description: string
  gender: string
  age_band: string
  type: string
  tags: string[]
}

// ─── Videos ─────────────────────────────────────────────────

export const videosApi = {
  fileUrl: (scriptId: string, filename: string) =>
    `${BASE}/videos/${scriptId}/${filename}`,
}

// ─── B-roll ────────────────────────────────────────────────

export const brollApi = {
  list: async () => {
    const res = await request<{ broll: any[] } | any[]>('/broll')
    return Array.isArray(res) ? res : res.broll || []
  },
  fileUrl: (filename: string) => `${BASE}/broll/file/${filename}`,
  upload: (scriptId: string, sceneId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return fetch(`${BASE}/scripts/${scriptId}/scenes/${sceneId}/broll`, {
      method: 'POST',
      body: formData,
    }).then(async (res) => {
      if (!res.ok) throw new Error(await res.text())
      return res.json() as Promise<Scene>
    })
  },
  remove: (scriptId: string, sceneId: string) =>
    request<Scene>(`/scripts/${scriptId}/scenes/${sceneId}/broll`, { method: 'DELETE' }),
  update: (scriptId: string, sceneId: string, updates: { broll_volume?: number }) =>
    request<Scene>(`/scripts/${scriptId}/scenes/${sceneId}/broll`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
}

// ─── Music ────────────────────────────────────────────────

export const musicApi = {
  list: async () => {
    const res = await request<{ tracks: MusicTrack[] } | MusicTrack[]>('/music')
    const raw = Array.isArray(res) ? res : res.tracks || []
    return raw.map((t: any) => ({
      ...t,
      url: t.url || `${BASE}/music/file/${t.filename}`,
    })) as MusicTrack[]
  },
  get: (trackId: string) => request<MusicTrack>(`/music/${trackId}`),
  fileUrl: (filename: string) => `${BASE}/music/file/${filename}`,
  upload: (file: File, title: string, tags?: string) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('title', title)
    if (tags) formData.append('tags', tags)
    return fetch(`${BASE}/music/upload`, { method: 'POST', body: formData })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text())
        return res.json() as Promise<MusicTrack>
      })
  },
  delete: (trackId: string) => request<void>(`/music/${trackId}`, { method: 'DELETE' }),
  generate: (prompt: string, duration?: number) =>
    request<any>('/music/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt, duration }),
    }),
  getProviders: () => request<MusicProviderConfig>('/music/providers'),
  updateProviders: (config: Partial<MusicProviderConfig>) =>
    request<MusicProviderConfig>('/music/providers', {
      method: 'PATCH',
      body: JSON.stringify(config),
    }),
}

// ─── Export/Assembly ───────────────────────────────────────

export const exportApi = {
  assemble: (scriptId: string, options: AssemblyRequest) =>
    request<{ filename: string; url: string }>(
      `/scripts/${scriptId}/assemble`,
      { method: 'POST', body: JSON.stringify(options) },
    ),
  progress: (scriptId: string) =>
    request<AssemblyProgress>(`/scripts/${scriptId}/assemble/progress`),
  listExports: async (scriptId: string) => {
    const res = await request<{ exports: ExportVideo[] } | ExportVideo[]>(
      `/scripts/${scriptId}/exports`,
    )
    const raw = Array.isArray(res) ? res : res.exports || []
    return raw.map((e: any) => ({
      ...e,
      url: e.url || `${BASE}/scripts/${scriptId}/exports/${e.filename}`,
    })) as ExportVideo[]
  },
  fileUrl: (scriptId: string, filename: string) =>
    `${BASE}/scripts/${scriptId}/exports/${filename}`,
  deleteExport: (scriptId: string, filename: string) =>
    request<void>(`/scripts/${scriptId}/exports/${filename}`, { method: 'DELETE' }),
}

// ─── Disk Usage ─────────────────────────────────────────────

export interface DiskUsageCategory {
  bytes: number
  files: number
  size_formatted: string
}

export interface DiskUsageProject {
  script_id: string
  title: string
  total_bytes: number
  file_count: number
  size_formatted: string
  breakdown: Record<string, DiskUsageCategory>
}

export interface DiskUsageInfo {
  total_bytes: number
  total_files: number
  total_size_formatted: string
  categories: Record<string, DiskUsageCategory>
  projects: DiskUsageProject[]
}

export const diskApi = {
  usage: () => request<DiskUsageInfo>('/disk-usage'),
}