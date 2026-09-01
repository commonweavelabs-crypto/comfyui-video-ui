import { useRef, useState, useCallback } from 'react'
import type { Scene } from '../types'
import SceneCard from './SceneCard'

interface TimelineProps {
  scenes: Scene[]
  scriptId: string
  onPromptChange: (sceneId: string, prompt: string) => void
  onDurationChange: (sceneId: string, duration: number) => void
  onSubmit: (sceneId: string) => void
  onDelete: (sceneId: string) => void
  onInsert: (afterSceneId: string | null) => void
  onFrameUpload: (sceneId: string, file: File) => void
  onFrameAssign: (frame: any, sceneId: string) => void
  onAudioUpload: (sceneId: string, file: File) => void
  onGenerateAudio: (sceneId: string) => void
  onFeedback: (sceneId: string, feedback: string) => void
  onRerender: (sceneId: string) => void
  onCancelRender: (sceneId: string) => void
  onSubmitAll: () => void
  onBrollUpload: (sceneId: string, file: File) => void
  onBrollRemove: (sceneId: string) => void
  onBrollVolumeChange: (sceneId: string, volume: number) => void
  onExport: () => void
  onSwitchRender: (sceneId: string, renderId: string) => void
  onDeleteRender: (sceneId: string, renderId: string) => void
  onReorder: (sceneIds: string[]) => void
}

export default function Timeline({
  scenes,
  scriptId,
  onPromptChange,
  onDurationChange,
  onSubmit,
  onDelete,
  onInsert,
  onFrameUpload,
  onFrameAssign,
  onAudioUpload,
  onGenerateAudio,
  onFeedback,
  onRerender,
  onCancelRender,
  onSubmitAll,
  onBrollUpload,
  onBrollRemove,
  onBrollVolumeChange,
  onExport,
  onSwitchRender,
  onDeleteRender,
  onReorder,
}: TimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragState = useRef({ isDragging: false, startX: 0, scrollLeft: 0 })
  const [scrollProgress, setScrollProgress] = useState(0)

  // Card reorder drag state
  const [draggedSceneId, setDraggedSceneId] = useState<string | null>(null)
  const draggedSceneIdRef = useRef<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | 'on' | null>(null)

  // Auto-scroll during drag
  const autoScrollRef = useRef<number | null>(null)
  const dragMouseXRef = useRef<number>(0)
  const dragMouseYRef = useRef<number>(0)

  const EDGE_ZONE = 100 // px from edge to trigger auto-scroll
  const SCROLL_SPEED = 25 // px per frame

  const startAutoScroll = useCallback(() => {
    if (autoScrollRef.current) return
    // Use setInterval instead of requestAnimationFrame because
    // requestAnimationFrame is paused during native HTML5 drag operations
    autoScrollRef.current = window.setInterval(() => {
      const container = scrollRef.current
      const currentDragId = draggedSceneIdRef.current
      if (!currentDragId || !container) {
        if (autoScrollRef.current) {
          clearInterval(autoScrollRef.current)
          autoScrollRef.current = null
        }
        return
      }
      const rect = container.getBoundingClientRect()
      const mouseX = dragMouseXRef.current
      const mouseY = dragMouseYRef.current

      // Only auto-scroll if mouse is within the vertical bounds of the timeline
      if (mouseY < rect.top || mouseY > rect.bottom) {
        return
      }

      const distFromLeft = mouseX - rect.left
      const distFromRight = rect.right - mouseX

      let scrolled = false
      if (distFromLeft < EDGE_ZONE && distFromLeft >= 0) {
        const speed = SCROLL_SPEED * (1 - distFromLeft / EDGE_ZONE)
        container.scrollLeft -= speed
        scrolled = true
      } else if (distFromRight < EDGE_ZONE && distFromRight >= 0) {
        const speed = SCROLL_SPEED * (1 - distFromRight / EDGE_ZONE)
        container.scrollLeft += speed
        scrolled = true
      }
      // Keep the scrollbar widget in sync while auto-scrolling
      if (scrolled) {
        const max = container.scrollWidth - container.clientWidth
        if (max > 0) {
          const pct = Math.max(0, Math.min((container.scrollLeft / max) * 100, 100))
          setScrollProgress(pct)
        }
      }
    }, 16) // ~60fps
  }, [])

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRef.current) {
      clearInterval(autoScrollRef.current)
      autoScrollRef.current = null
    }
  }, [])

  // Track mouse position during drag — called from multiple places
  const trackMouse = useCallback((e: React.DragEvent) => {
    dragMouseXRef.current = e.clientX
    dragMouseYRef.current = e.clientY
  }, [])

  const handleDragStart = useCallback((e: React.DragEvent, sceneId: string) => {
    draggedSceneIdRef.current = sceneId
    setDraggedSceneId(sceneId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', sceneId)
    const card = e.currentTarget as HTMLElement
    card.style.opacity = '0.4'
    dragMouseXRef.current = e.clientX
    dragMouseYRef.current = e.clientY
    startAutoScroll()

    // Also listen to dragover on the document to catch mouse at screen edges
    // where card dragover events stop firing
    const docHandler = (ev: Event) => {
      const de = ev as DragEvent
      dragMouseXRef.current = de.clientX
      dragMouseYRef.current = de.clientY
      ev.preventDefault()
    }
    window.addEventListener('dragover', docHandler)
    // Store handler on ref so handleDragEnd can remove it
    ;(draggedSceneIdRef as any).cleanup = () => window.removeEventListener('dragover', docHandler)
  }, [startAutoScroll])

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    const card = e.currentTarget as HTMLElement
    card.style.opacity = '1'
    draggedSceneIdRef.current = null
    setDraggedSceneId(null)
    setDropTargetId(null)
    setDropPosition(null)
    stopAutoScroll()
    // Remove document-level dragover listener
    const cleanup = (draggedSceneIdRef as any).cleanup as (() => void) | null
    if (cleanup) {
      cleanup()
      ;(draggedSceneIdRef as any).cleanup = null
    }
  }, [stopAutoScroll])

  const handleDragOver = useCallback((e: React.DragEvent, sceneId: string) => {
    // Track mouse position for auto-scroll
    trackMouse(e)

    // If this is a frame drag from the catalog, let it pass through to SceneCard
    const types = e.dataTransfer.types
    if (types.includes('application/x-frame')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!draggedSceneId || draggedSceneId === sceneId) return

    // Determine if hovering on left half, right half, or center of the card
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const ratio = x / rect.width

    setDropTargetId(sceneId)
    if (ratio < 0.3) {
      setDropPosition('before')
    } else if (ratio > 0.7) {
      setDropPosition('after')
    } else {
      setDropPosition('on')
    }
  }, [draggedSceneId, trackMouse])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if leaving the card entirely
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    if (e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top || e.clientY > rect.bottom) {
      setDropTargetId(null)
      setDropPosition(null)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, targetSceneId: string) => {
    // If this is a frame drag from the catalog, let it pass through to SceneCard
    const types = e.dataTransfer.types
    if (types.includes('application/x-frame')) return
    e.preventDefault()
    e.stopPropagation()
    if (!draggedSceneId || draggedSceneId === targetSceneId) {
      setDraggedSceneId(null)
      setDropTargetId(null)
      setDropPosition(null)
      return
    }

    // Build the new order array
    const currentIds = scenes.map((s) => s.id)

    if (dropPosition === 'on') {
      // Swap positions — dragged card takes target's slot, target takes dragged's slot
      const dragIdx = currentIds.indexOf(draggedSceneId)
      const targetIdx = currentIds.indexOf(targetSceneId)
      const newIds = [...currentIds]
      // Swap
      newIds[dragIdx] = targetSceneId
      newIds[targetIdx] = draggedSceneId
      onReorder(newIds)
    } else {
      // Insert before or after the target
      const newIds = currentIds.filter((id) => id !== draggedSceneId)
      const targetIdx = newIds.indexOf(targetSceneId)
      const insertIdx = dropPosition === 'before' ? targetIdx : targetIdx + 1
      newIds.splice(insertIdx, 0, draggedSceneId)
      onReorder(newIds)
    }

    draggedSceneIdRef.current = null
    setDraggedSceneId(null)
    setDropTargetId(null)
    setDropPosition(null)
    stopAutoScroll()
  }, [draggedSceneId, dropPosition, scenes, onReorder, stopAutoScroll])

  // Drag-to-scroll — disabled while a card reorder drag is in progress
  const handleMouseDown = (e: React.MouseEvent) => {
    if (draggedSceneId) return // don't scroll while reordering cards
    const container = scrollRef.current
    if (!container) return
    if ((e.target as HTMLElement).closest('button, input, textarea, select, a, video, [draggable="true"]')) return
    dragState.current = { isDragging: true, startX: e.pageX - container.offsetLeft, scrollLeft: container.scrollLeft }
    container.style.cursor = 'grabbing'
    container.style.userSelect = 'none'
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    const container = scrollRef.current
    if (!container || !dragState.current.isDragging) return
    if (draggedSceneId) return // don't scroll while reordering
    e.preventDefault()
    const x = e.pageX - container.offsetLeft
    const walk = (x - dragState.current.startX) * 1.8
    container.scrollLeft = dragState.current.scrollLeft - walk
  }

  const stopDrag = () => {
    const container = scrollRef.current
    if (!container) return
    dragState.current.isDragging = false
    container.style.cursor = 'grab'
    container.style.userSelect = ''
  }

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    if (max <= 0) return setScrollProgress(0)
    setScrollProgress(Math.max(0, Math.min((el.scrollLeft / max) * 100, 100)))
  }

  const scrollToPercent = useCallback((p: number) => {
    const el = scrollRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    el.scrollTo({ left: (max * p) / 100, behavior: 'smooth' })
    setScrollProgress(p)
  }, [])

  if (scenes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-16 text-center max-w-md">
          <div className="text-xl text-zinc-400 mb-1">No scenes yet</div>
          <div className="text-sm text-zinc-600">
            Select a script from the library and submit it to the pipeline. The AI will break it into scenes automatically.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Timeline header */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div>
          <div className="text-lg font-semibold tracking-tight text-zinc-100">Timeline</div>
          <div className="text-zinc-500 text-xs mt-0.5">
            {scenes.length} scenes · Drag to scroll · Click + to insert
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onExport}
            disabled={scenes.length === 0}
            className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-200 rounded-xl text-sm font-semibold transition-all tracking-[0.3px] flex items-center gap-2"
          >
            Export
          </button>
          <button
            onClick={onSubmitAll}
            className="px-5 py-2 bg-brand-600 hover:bg-brand-500 active:bg-brand-600 text-white rounded-xl text-sm font-semibold transition-all tracking-[0.3px] flex items-center gap-2"
          >
            Submit All Ready
          </button>
        </div>
      </div>

      {/* Timeline scroll area */}
      <div
        className="flex flex-col flex-1 overflow-hidden relative"
        onDragOver={(e) => {
          if (draggedSceneIdRef.current) {
            trackMouse(e)
            e.preventDefault()
          }
        }}
      >
      <div
        ref={scrollRef}
        className="flex gap-0 overflow-x-auto pb-6 scrollbar-hide min-w-0 cursor-grab active:cursor-grabbing touch-pan-x snap-x flex-1 items-start"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        onScroll={handleScroll}
      >
        {/* Leading + button — only one, before the first card */}
        <InsertButton onClick={() => onInsert(null)} />

        {scenes.map((scene, i) => {
          const isDropTarget = dropTargetId === scene.id && draggedSceneId !== scene.id
          const isSwapTarget = isDropTarget && dropPosition === 'on'
          const showAfterGap = isDropTarget && dropPosition === 'after' && scenes.length > 2
          const showLeadingGap = isDropTarget && dropPosition === 'before' && scenes.length > 2
          return (
          <div
            key={scene.id}
            className="flex items-start"
          >
            {/* Drop indicator before this card — replaces nothing, just shows the gap */}
            {showLeadingGap && (
              <div className="flex-shrink-0 w-7 mx-1 self-stretch flex items-center justify-center z-10 animate-[fadeIn_150ms_ease-out]">
                <div className="w-full h-[85%] bg-brand-500/15 border-2 border-dashed border-brand-500 rounded-2xl flex items-center justify-center">
                  <div className="w-1.5 h-12 bg-brand-500 rounded-full" />
                </div>
              </div>
            )}
            <div
              draggable
              onDragStart={(e) => handleDragStart(e, scene.id)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, scene.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, scene.id)}
              className={`transition-all duration-200 ease-out ${
                draggedSceneId === scene.id ? 'opacity-40 scale-95' : ''
              } ${
                isSwapTarget
                  ? 'ring-2 ring-brand-500 ring-offset-2 ring-offset-zinc-950 scale-105'
                  : ''
              }`}
            >
            <SceneCard
              scene={scene}
              scriptId={scriptId}
              onPromptChange={onPromptChange}
              onDurationChange={onDurationChange}
              onSubmit={onSubmit}
              onDelete={onDelete}
              onFrameUpload={onFrameUpload}
              onFrameAssign={onFrameAssign}
              onAudioUpload={onAudioUpload}
              onGenerateAudio={onGenerateAudio}
              onFeedback={onFeedback}
              onRerender={onRerender}
              onCancelRender={onCancelRender}
              onBrollUpload={onBrollUpload}
              onBrollRemove={onBrollRemove}
              onBrollVolumeChange={onBrollVolumeChange}
              onSwitchRender={onSwitchRender}
              onDeleteRender={onDeleteRender}
            />
            </div>
            {/* Trailing + button — replaced by gap indicator when dropping after this card */}
            {showAfterGap ? (
              <div className="flex-shrink-0 w-7 mx-1 self-stretch flex items-center justify-center z-10 animate-[fadeIn_150ms_ease-out]">
                <div className="w-full h-[85%] bg-brand-500/15 border-2 border-dashed border-brand-500 rounded-2xl flex items-center justify-center">
                  <div className="w-1.5 h-12 bg-brand-500 rounded-full" />
                </div>
              </div>
            ) : (
              <InsertButton onClick={() => onInsert(scene.id)} />
            )}
          </div>
          )
        })}
      </div>
      </div>

      {/* Scroll Bar — controls and reflects timeline position */}
      <div className="text-center text-[10px] text-zinc-600 tracking-[1px] uppercase mb-1">Scroll Bar</div>
      <div className="mx-auto flex w-full max-w-[480px] items-center gap-4 rounded-full border border-zinc-800 bg-zinc-900 px-6 py-3.5 shadow-2xl">
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(scrollProgress)}
          onInput={(e) => scrollToPercent(Number(e.currentTarget.value))}
          onChange={(e) => scrollToPercent(Number(e.currentTarget.value))}
          aria-label="Scroll timeline"
          className="timeline-scroll-range"
          style={{ '--scroll-progress': `${scrollProgress}%` } as React.CSSProperties}
        />
        <div className="w-10 text-right text-sm font-semibold text-zinc-300 tabular-nums">
          {Math.round(scrollProgress)}%
        </div>
      </div>
    </div>
  )
}

function InsertButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex-shrink-0 flex items-center self-stretch">
      <button
        onClick={onClick}
        className="w-7 h-7 rounded-full bg-zinc-900 border border-zinc-800 hover:bg-brand-600/20 hover:border-brand-500/40 text-zinc-600 hover:text-brand-400 flex items-center justify-center transition-all group mx-1"
        title="Insert new scene here"
      >
        <span className="text-sm group-hover:scale-110 transition-transform">+</span>
      </button>
    </div>
  )
}