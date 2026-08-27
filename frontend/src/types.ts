// Types for the ComfyUI Video Workflow UI

export type SceneStatus =
  | 'draft'
  | 'ready'
  | 'queued'
  | 'rendering'
  | 'complete'
  | 'error'
  | 'unknown'

export interface RenderVersion {
  render_id: string
  prompt_id: string | null
  video_filename: string
  video_path: string
  video_url: string | null
  created: string
  duration: number
  render_time_seconds: number | null
}

export interface Scene {
  id: string
  scene_number: number
  prompt: string
  dialogue: string
  duration: number
  status: SceneStatus
  initial_frame_url: string | null
  video_url: string | null
  video_filename: string | null
  audio_url: string | null
  voice_id: string | null
  feedback: string
  error_message: string | null
  comfyui_prompt_id: string | null
  render_progress: number
  render_elapsed: number | null
  render_estimated_remaining: number | null
  render_estimated_total: number | null
  created_at: string
  updated_at: string
  broll_filename: string | null
  broll_url: string | null
  broll_volume: number
  renders: RenderVersion[]
  active_render_id: string | null
}

export interface Script {
  id: string
  title: string
  content: string
  status: 'draft' | 'processing' | 'ready' | 'error'
  scene_count: number
  tags: string[]
  created_at: string
  updated_at: string
}

export interface ComfyUIStatus {
  connected: boolean
  url: string
  queue_remaining: number
  queue_running: number
  queue_status: string
}

export interface PipelineProgress {
  stage: string
  message: string
  percent: number
  scene_id?: string
}

export interface FrameCatalogItem {
  id: string
  frame_id: string
  title: string
  source_path: string
  tags: string[]
  vision_result: string
  ltx_seed_prompt: string
  character_present: boolean | null
  shot_type: string
  windows_status: string
  // Derived in the API client — not from backend
  url: string
  description: string
}

export interface SubmitSceneResponse {
  scene_id: string
  comfyui_prompt_id: string
  status: SceneStatus
}

export interface MusicTrack {
  track_id: string
  filename: string
  title: string
  duration: number
  source: string // "upload" | "generated"
  tags: string[]
  created: string
  url: string // derived
}

export interface MusicProvider {
  id: string
  name: string
  description: string
  endpoint: string
  api_key: string
}

export interface MusicProviderConfig {
  active_provider: string
  providers: Record<string, MusicProvider>
}

export interface AssemblyRequest {
  music_track_id?: string
  music_volume?: number
  include_broll?: boolean
  output_name?: string
  resolution?: string
  fps?: number
}

export interface AssemblyProgress {
  stage: string
  message: string
  percent: number
}

export interface ExportVideo {
  filename: string
  url: string
  created: string
  size: number
}

export interface PipelineSubmitResponse {
  script_id: string
  job_id: string
  status: string
  message: string
}

export const STATUS_META: Record<
  SceneStatus,
  { label: string; dotClass: string; border: string; bg: string; text: string }
> = {
  draft: {
    label: 'DRAFT',
    dotClass: 'bg-zinc-500',
    border: 'border-zinc-700',
    bg: 'bg-zinc-800/50',
    text: 'text-zinc-400',
  },
  ready: {
    label: 'READY',
    dotClass: 'bg-blue-500',
    border: 'border-blue-600/50',
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
  },
  queued: {
    label: 'QUEUED',
    dotClass: 'bg-yellow-500',
    border: 'border-yellow-600/50',
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-400',
  },
  rendering: {
    label: 'RENDERING',
    dotClass: 'bg-orange-500 animate-pulse',
    border: 'border-orange-600/50',
    bg: 'bg-orange-500/10',
    text: 'text-orange-400',
  },
  complete: {
    label: 'COMPLETE',
    dotClass: 'bg-emerald-500',
    border: 'border-emerald-600/50',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
  },
  error: {
    label: 'ERROR',
    dotClass: 'bg-red-500',
    border: 'border-red-600/50',
    bg: 'bg-red-500/10',
    text: 'text-red-400',
  },
  unknown: {
    label: 'UNKNOWN',
    dotClass: 'bg-zinc-600',
    border: 'border-zinc-700',
    bg: 'bg-zinc-800/50',
    text: 'text-zinc-500',
  },
}