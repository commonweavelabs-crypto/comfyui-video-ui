import { useState, useRef } from 'react'
import type { FrameCatalogItem } from '../types'

interface FrameCatalogProps {
  frames: FrameCatalogItem[]
  onAssign: (frame: FrameCatalogItem, sceneId: string) => void
  onUpload: (file: File) => void
  sceneIds: { id: string; number: number }[]
}

export default function FrameCatalog({ frames, onAssign, onUpload, sceneIds }: FrameCatalogProps) {
  const [selectedScene, setSelectedScene] = useState<string>('')
  const [search, setSearch] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filtered = frames.filter((f) => {
    const desc = (f.description || f.title || '').toLowerCase()
    const tags = (f.tags || []).map((t) => (t || '').toLowerCase())
    const q = search.toLowerCase()
    return desc.includes(q) || tags.some((t) => t.includes(q))
  })

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-zinc-200">Reference Frames</div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-all"
        >
          Upload
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onUpload(file)
            e.target.value = ''
          }}
          className="hidden"
        />
      </div>

      <div className="mb-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search frames..."
          className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-700 rounded-xl px-3 py-2 text-xs placeholder:text-zinc-600 focus:outline-none text-zinc-200"
        />
      </div>

      <div className="mb-2">
        <select
          value={selectedScene}
          onChange={(e) => setSelectedScene(e.target.value)}
          className="w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-700 rounded-xl px-3 py-2 text-xs focus:outline-none text-zinc-200"
        >
          <option value="">Select scene to assign...</option>
          {sceneIds.map((s) => (
            <option key={s.id} value={s.id}>
              Scene {s.number}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin grid grid-cols-2 gap-2">
        {filtered.length === 0 ? (
          <div className="col-span-2 text-center py-8 text-zinc-600 text-xs">
            No frames available. Upload reference images to get started.
          </div>
        ) : (
          filtered.map((frame) => (
            <div
              key={frame.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-frame', JSON.stringify(frame))
                e.dataTransfer.effectAllowed = 'copy'
              }}
              onClick={() => {
                if (selectedScene) onAssign(frame, selectedScene)
              }}
              className={`rounded-xl overflow-hidden border transition-all group ${
                selectedScene
                  ? 'border-zinc-800 hover:border-blue-500/40 cursor-pointer'
                  : 'border-zinc-800 hover:border-zinc-600 cursor-grab active:cursor-grabbing'
              }`}
              title="Drag to a scene card or click to assign"
            >
              <div className="aspect-video bg-zinc-950">
                {frame.url ? (
                  <img src={frame.url} alt={frame.title || frame.description} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-700 text-xs">
                    No preview
                  </div>
                )}
              </div>
              <div className="p-1.5">
                <div className="text-[10px] text-zinc-400 line-clamp-2 leading-tight">
                  {frame.title || frame.description || 'Untitled'}
                </div>
                {(frame.tags || []).length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {frame.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="text-[8px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}