import { useState, useEffect, useRef } from 'react'

const aspectPresets = [
  { id: "16:9-1080p", label: "1080p • 16:9", width: 1920, height: 1080, ratio: "16:9", resolution: "1080p" },
  { id: "16:9-720p", label: "720p • 16:9", width: 1280, height: 720, ratio: "16:9", resolution: "720p" },
  { id: "9:16-1080p", label: "1080p • 9:16", width: 1080, height: 1920, ratio: "9:16", resolution: "1080p" },
  { id: "9:16-720p", label: "720p • 9:16", width: 720, height: 1280, ratio: "9:16", resolution: "720p" },
  { id: "1:1-1080p", label: "1080p • 1:1", width: 1080, height: 1080, ratio: "1:1", resolution: "1080p" },
  { id: "1:1-720p", label: "720p • 1:1", width: 720, height: 720, ratio: "1:1", resolution: "720p" },
]

async function cropImageToAspect(file, targetWidth, targetHeight) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d', { alpha: false })
      canvas.width = targetWidth
      canvas.height = targetHeight

      const imgRatio = img.width / img.height
      const targetRatio = targetWidth / targetHeight

      let sx, sy, sw, sh
      if (imgRatio > targetRatio) {
        // Image is wider — crop left/right
        sh = img.height
        sw = Math.round(sh * targetRatio)
        sx = Math.round((img.width - sw) / 2)
        sy = 0
      } else {
        // Image is taller — crop top/bottom
        sw = img.width
        sh = Math.round(sw / targetRatio)
        sx = 0
        sy = Math.round((img.height - sh) / 2)
      }

      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight)
      resolve(canvas.toDataURL('image/jpeg', 0.92))
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

function App() {
  const [jobs, setJobs] = useState([
    {
      id: 1,
      prompt: "A serene mountain landscape at sunrise with flowing river",
      duration: 10,
      resolution: "720p • 16:9",
      aspectRatio: "16:9",
      status: "pending",
      imageUrl: null,
      videoUrl: null,
      created: new Date().toISOString(),
    },
    {
      id: 2,
      prompt: "Cyberpunk city street at night, neon lights, flying cars",
      duration: 15,
      resolution: "1080p • 16:9",
      aspectRatio: "16:9",
      status: "completed",
      imageUrl: "https://picsum.photos/id/1015/300/200",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny_320x180.mp4",
      created: new Date().toISOString(),
    },
    {
      id: 3,
      prompt: "Abstract particle animation, colorful orbs floating in space",
      duration: 5,
      resolution: "480p • 9:16",
      aspectRatio: "9:16",
      status: "running",
      imageUrl: "https://picsum.photos/id/1005/300/200",
      videoUrl: null,
      created: new Date().toISOString(),
    },
  ])

  const [comfyUrl, setComfyUrl] = useState("http://localhost:8188")
  const [newPrompt, setNewPrompt] = useState("")
  const [newDuration, setNewDuration] = useState(10)
  const [newAspectId, setNewAspectId] = useState("16:9-1080p")
  const [newImageFile, setNewImageFile] = useState(null)
  const [newImagePreview, setNewImagePreview] = useState(null)
  const [liveCroppedPreview, setLiveCroppedPreview] = useState(null)

  // Theme (light matches the soft UI kit you sent)
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme')
    return saved === 'dark' || saved === 'light' ? saved : 'light'
  })

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
  }

  // Drag-to-scroll state for queue
  const queueScrollRef = useRef(null)
  const dragState = useRef({ isDragging: false, startX: 0, scrollLeft: 0 })
  const [scrollProgress, setScrollProgress] = useState(0)



  const handleMouseDown = (e) => {
    const container = queueScrollRef.current
    if (!container) return
    if (e.target.closest('button')) return // don't drag when clicking buttons
    dragState.current.isDragging = true
    dragState.current.startX = e.pageX - container.offsetLeft
    dragState.current.scrollLeft = container.scrollLeft
    container.style.cursor = 'grabbing'
    container.style.userSelect = 'none'
  }

  const handleMouseMove = (e) => {
    const container = queueScrollRef.current
    if (!container || !dragState.current.isDragging) return
    e.preventDefault()
    const x = e.pageX - container.offsetLeft
    const walk = (x - dragState.current.startX) * 1.8
    container.scrollLeft = dragState.current.scrollLeft - walk
  }

  const handleMouseUp = () => {
    const container = queueScrollRef.current
    if (!container) return
    dragState.current.isDragging = false
    container.style.cursor = 'grab'
    container.style.userSelect = ''
  }

  const handleMouseLeave = () => {
    const container = queueScrollRef.current
    if (!container) return
    dragState.current.isDragging = false
    container.style.cursor = 'grab'
    container.style.userSelect = ''
  }

  const handleTouchStart = (e) => {
    const container = queueScrollRef.current
    if (!container) return
    if (e.target.closest('button')) return // don't drag when tapping buttons
    dragState.current.isDragging = true
    dragState.current.startX = e.touches[0].pageX - container.offsetLeft
    dragState.current.scrollLeft = container.scrollLeft
  }

  const handleTouchMove = (e) => {
    const container = queueScrollRef.current
    if (!container || !dragState.current.isDragging) return
    const x = e.touches[0].pageX - container.offsetLeft
    const walk = (x - dragState.current.startX) * 1.8
    container.scrollLeft = dragState.current.scrollLeft - walk
  }

  const handleTouchEnd = () => {
    const container = queueScrollRef.current
    if (!container) return
    dragState.current.isDragging = false
  }

  const handleQueueScroll = () => {
    const el = queueScrollRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    if (max <= 0) return setScrollProgress(0)
    setScrollProgress(Math.max(0, Math.min((el.scrollLeft / max) * 100, 100)))
  }

  const scrollToPercent = (p) => {
    const el = queueScrollRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    el.scrollTo({ left: (max * p) / 100, behavior: 'smooth' })
    setScrollProgress(p)
  }

  const addJob = async () => {
    if (!newPrompt.trim()) return

    const preset = getCurrentPreset()

    let imageUrl = null
    if (newImageFile) {
      try {
        imageUrl = await cropImageToAspect(newImageFile, preset.width, preset.height)
      } catch (e) {
        console.error("Crop failed", e)
        imageUrl = newImagePreview
      }
    }

    const newJob = {
      id: Math.max(0, ...jobs.map(j => j.id)) + 1,
      prompt: newPrompt.trim(),
      duration: newDuration,
      resolution: preset.label,
      aspectRatio: preset.ratio,
      status: "pending",
      imageUrl,
      videoUrl: null,
      created: new Date().toISOString(),
    }

    setJobs([...jobs, newJob])
    setNewPrompt("")
    setNewAspectId("16:9-1080p")
    clearNewImage()
  }

  const updateJob = (id, updates) => {
    setJobs(jobs.map(job => job.id === id ? { ...job, ...updates } : job))
  }

  const removeJob = (id) => {
    setJobs(jobs.filter(job => job.id !== id))
  }

  const submitToComfyUI = (id) => {
    updateJob(id, { status: "running" })
  }

  const markComplete = (id) => {
    updateJob(id, {
      status: "completed",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny_320x180.mp4"
    })
  }

  const addImage = (id) => {
    updateJob(id, { imageUrl: "https://picsum.photos/id/1016/300/200" })
  }

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setNewImageFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setNewImagePreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  const clearNewImage = () => {
    setNewImageFile(null)
    setNewImagePreview(null)
  }

  const enhancePrompt = () => {
    if (!newPrompt.trim()) return
    const enhanced = newPrompt.trim() + 
      ". Cinematic lighting, smooth camera movement, high detail, photorealistic textures, 4K quality, professional color grading."
    setNewPrompt(enhanced)
  }

  const getCurrentPreset = () => aspectPresets.find(p => p.id === newAspectId) || aspectPresets[0]

  // Live cropped preview for the reference image box
  useEffect(() => {
    let cancelled = false
    const updateLivePreview = async () => {
      if (!newImageFile) {
        setLiveCroppedPreview(null)
        return
      }
      const preset = aspectPresets.find(p => p.id === newAspectId) || aspectPresets[0]
      try {
        const cropped = await cropImageToAspect(newImageFile, preset.width, preset.height)
        if (!cancelled) setLiveCroppedPreview(cropped)
      } catch {
        if (!cancelled) setLiveCroppedPreview(newImagePreview)
      }
    }
    updateLivePreview()
    return () => { cancelled = true }
  }, [newImageFile, newAspectId, newImagePreview])

  const isLight = theme === 'light'

  const rootClasses = isLight
    ? "min-h-screen bg-[#F0F4F8] text-zinc-900"
    : "min-h-screen bg-zinc-950 text-zinc-100"

  const headerClasses = isLight
    ? "border-b border-zinc-200 bg-white/90 backdrop-blur-xl sticky top-0 z-50"
    : "border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-lg sticky top-0 z-50"

  return (
    <div className={rootClasses}>
      {/* Top Header */}
      <div className={headerClasses}>
        <div className="max-w-[1600px] mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={
              isLight 
                ? "w-10 h-10 bg-white border border-zinc-200 rounded-2xl flex items-center justify-center shadow-sm" 
                : "w-10 h-10 bg-white rounded-2xl flex items-center justify-center shadow-sm"
            }>
              <span className="text-zinc-950 font-bold text-[22px] tracking-[-1px]">C</span>
            </div>
            <div>
              <div className={
                isLight 
                  ? "font-semibold text-[26px] tracking-[-1.2px] leading-none text-zinc-900" 
                  : "font-semibold text-[26px] tracking-[-1.2px] leading-none"
              }>
                ComfyUI Video Queue
              </div>
              <div className={isLight ? "text-[11px] text-zinc-500 mt-0.5" : "text-[11px] text-zinc-500 mt-0.5"}>
                Queue management for video generation
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className={
                isLight
                  ? "px-4 py-2 rounded-2xl border border-zinc-200 bg-white hover:bg-zinc-50 text-sm font-medium flex items-center gap-2 transition-all"
                  : "px-4 py-2 rounded-2xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-sm font-medium flex items-center gap-2 transition-all"
              }
            >
              {isLight ? "☀︎ Light" : "☾ Dark"}
            </button>

            <div className={
              isLight 
                ? "px-5 py-1.5 bg-white border border-zinc-200 rounded-2xl text-sm text-zinc-600 font-medium tracking-[0.2px]"
                : "px-5 py-1.5 bg-zinc-900/80 border border-zinc-800 rounded-2xl text-sm text-zinc-400 font-medium tracking-[0.2px]"
            }>
              {jobs.length} jobs
            </div>
            <div className={
              isLight 
                ? "px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-sm text-emerald-600 font-mono tracking-[0.5px]"
                : "px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-sm text-emerald-400 font-mono tracking-[0.5px]"
            }>
              {comfyUrl.replace('http://', '')}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-8 pt-8 pb-12">
        <div className="flex gap-8 items-start">
          {/* Modern Sidebar */}
          <div className="w-80 flex-shrink-0">
            <div className={
              isLight
                ? "bg-white border border-zinc-200 rounded-3xl p-7 sticky top-24 shadow-[0_8px_30px_rgb(0,0,0,0.06)]"
                : "bg-zinc-900 border border-zinc-800 rounded-3xl p-7 sticky top-24 shadow-2xl"
            }>
            
              <div className="mb-6">
                <div className={isLight ? "font-semibold text-[21px] tracking-[-0.6px] mb-1 text-zinc-900" : "font-semibold text-[21px] tracking-[-0.6px] mb-1"}>New Job</div>
                <div className={isLight ? "text-sm text-zinc-500" : "text-sm text-zinc-400"}>Create a video generation task</div>
              </div>

              <div className="space-y-5">
                {/* Prompt */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-[10px] font-medium text-zinc-400 tracking-[1px] uppercase">Prompt</div>
                    <button
                      onClick={enhancePrompt}
                      disabled={!newPrompt.trim()}
                      className={
                        isLight
                          ? "text-[10px] px-3 py-0.5 rounded-full bg-zinc-100 hover:bg-zinc-200 text-zinc-500 disabled:opacity-40 transition-all tracking-[0.5px]"
                          : "text-[10px] px-3 py-0.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 disabled:opacity-40 transition-all tracking-[0.5px]"
                      }
                    >
                      ✨ Enhance
                    </button>
                  </div>
                  <textarea
                    value={newPrompt}
                    onChange={(e) => setNewPrompt(e.target.value)}
                    placeholder="Describe the video scene in detail..."
                    className={
                      isLight
                        ? "w-full h-24 bg-white border border-zinc-200 focus:border-zinc-300 rounded-2xl px-4 py-3.5 text-sm resize-none placeholder:text-zinc-400 focus:outline-none text-zinc-900"
                        : "w-full h-24 bg-zinc-950 border border-zinc-800 focus:border-zinc-700 rounded-2xl px-4 py-3.5 text-sm resize-none placeholder:text-zinc-500 focus:outline-none"
                    }
                  />
                </div>

                {/* Duration & Aspect Ratio */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className={isLight ? "text-[10px] font-medium text-zinc-500 mb-1.5 tracking-[1px] uppercase" : "text-[10px] font-medium text-zinc-400 mb-1.5 tracking-[1px] uppercase"}>Duration</div>
                    <select
                      value={newDuration}
                      onChange={(e) => setNewDuration(Number(e.target.value))}
                      className={
                        isLight
                          ? "w-full bg-[#E8F0FE] border border-[#C9DDFD] focus:border-[#A8C9F9] rounded-2xl px-4 py-2.5 text-sm focus:outline-none text-zinc-900"
                          : "w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-700 rounded-2xl px-4 py-2.5 text-sm focus:outline-none"
                      }
                    >
                      <option value={5}>5 seconds</option>
                      <option value={10}>10 seconds</option>
                      <option value={15}>15 seconds</option>
                    </select>
                  </div>
                  <div>
                    <div className={isLight ? "text-[10px] font-medium text-zinc-500 mb-1.5 tracking-[1px] uppercase" : "text-[10px] font-medium text-zinc-400 mb-1.5 tracking-[1px] uppercase"}>Aspect Ratio</div>
                    <select
                      value={newAspectId}
                      onChange={(e) => setNewAspectId(e.target.value)}
                      className={
                        isLight
                          ? "w-full bg-[#E8F0FE] border border-[#C9DDFD] focus:border-[#A8C9F9] rounded-2xl px-4 py-2.5 text-sm focus:outline-none text-zinc-900"
                          : "w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-700 rounded-2xl px-4 py-2.5 text-sm focus:outline-none"
                      }
                    >
                      {aspectPresets.map(p => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Reference Image Upload */}
                <div>
                  <div className="text-[10px] font-medium text-zinc-400 mb-1.5 tracking-[1px] uppercase">Reference Image (auto-cropped)</div>
                  {!newImagePreview && (
                    <label className={
                      isLight
                        ? "block w-full border border-dashed border-zinc-300 hover:border-zinc-400 rounded-2xl p-4 text-center cursor-pointer transition-all bg-white"
                        : "block w-full border border-dashed border-zinc-700 hover:border-zinc-600 rounded-2xl p-4 text-center cursor-pointer transition-all bg-zinc-950/50"
                    }>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageSelect}
                        className="hidden"
                      />
                      <div className={isLight ? "text-sm text-zinc-600" : "text-sm text-zinc-400"}>Click to upload initial frame</div>
                      <div className={isLight ? "text-[10px] text-zinc-500 mt-0.5" : "text-[10px] text-zinc-500 mt-0.5"}>Will be centered-cropped to aspect ratio</div>
                    </label>
                  )}
                  {newImagePreview && (
                    <div className="relative">
                      <div 
                        className={
                          isLight
                            ? "w-full rounded-2xl border border-zinc-200 overflow-hidden bg-white"
                            : "w-full rounded-2xl border border-zinc-800 overflow-hidden bg-zinc-950"
                        }
                        style={{ maxHeight: '160px' }}
                      >
                        <img 
                          src={liveCroppedPreview || newImagePreview} 
                          alt="Preview (cropped to aspect)" 
                          className="w-full h-full object-cover" 
                        />
                      </div>
                      <button
                        onClick={clearNewImage}
                        className={
                          isLight
                            ? "absolute top-2 right-2 px-2.5 py-0.5 text-xs bg-white border border-zinc-200 rounded-full text-zinc-600 hover:bg-zinc-100 transition-all z-10 shadow-sm"
                            : "absolute top-2 right-2 px-2.5 py-0.5 text-xs bg-zinc-900 rounded-full text-white hover:bg-red-600 transition-all z-10"
                        }
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>

                <button
                  onClick={addJob}
                  className="w-full mt-2 bg-white hover:bg-zinc-100 active:bg-white transition-all text-zinc-950 font-semibold py-3.5 rounded-2xl text-sm tracking-[0.5px]"
                >
                  ADD TO QUEUE
                </button>
              </div>

              {/* ComfyUI Settings */}
              <div className={
                isLight
                  ? "mt-6 pt-5 border-t border-zinc-100"
                  : "mt-6 pt-5 border-t border-zinc-800"
              }>
                <div className={isLight ? "text-[10px] font-medium text-zinc-500 mb-1.5 tracking-[1px] uppercase" : "text-[10px] font-medium text-zinc-400 mb-1.5 tracking-[1px] uppercase"}>ComfyUI Endpoint</div>
                <input
                  type="text"
                  value={comfyUrl}
                  onChange={(e) => setComfyUrl(e.target.value)}
                  className={
                    isLight
                      ? "w-full bg-white border border-zinc-200 focus:border-zinc-300 rounded-2xl px-4 py-2.5 text-sm focus:outline-none font-mono text-xs text-zinc-900"
                      : "w-full bg-zinc-950 border border-zinc-800 focus:border-zinc-700 rounded-2xl px-4 py-2.5 text-sm focus:outline-none font-mono text-xs"
                  }
                />
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className={isLight ? "text-2xl font-semibold tracking-tight text-zinc-900" : "text-2xl font-semibold tracking-tight"}>Queue</div>
                <div className={isLight ? "text-zinc-500 text-sm mt-0.5" : "text-zinc-400 text-sm mt-0.5"}>Drag to scroll horizontally • Fixed-size cards</div>
              </div>
              <div className={isLight ? "text-xs px-3 py-1 bg-white border border-zinc-200 rounded-full text-zinc-500" : "text-xs px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-full text-zinc-500"}>Drag to scroll</div>
            </div>

            {jobs.length === 0 ? (
              <div className={isLight ? "bg-white border border-zinc-200 rounded-3xl p-16 text-center shadow-sm" : "bg-zinc-900 border border-zinc-800 rounded-3xl p-16 text-center"}>
                <div className="text-6xl mb-4 opacity-20">🎥</div>
                <div className={isLight ? "text-xl text-zinc-600" : "text-xl text-zinc-400"}>No jobs yet</div>
                <div className={isLight ? "text-sm text-zinc-500 mt-1" : "text-sm text-zinc-500 mt-1"}>Add your first video generation task from the sidebar</div>
              </div>
            ) : (
              <>
                <div
                  ref={queueScrollRef}
                  className="flex gap-5 overflow-x-auto pb-8 snap-x snap-mandatory scrollbar-hide min-w-0 cursor-grab active:cursor-grabbing touch-pan-x"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseLeave}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  onScroll={handleQueueScroll}
                >
                  {jobs.map((job) => (
                  <div
                    key={job.id}
                    className={
                      isLight
                        ? "flex-shrink-0 w-[340px] min-w-[340px] bg-white border border-zinc-200 rounded-3xl overflow-hidden snap-start shadow-[0_8px_30px_rgb(0,0,0,0.06)]"
                        : "flex-shrink-0 w-[340px] min-w-[340px] bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden snap-start shadow-2xl"
                    }
                  >
                    {/* Card Header */}
                    <div className={
                      isLight
                        ? "px-6 pt-5 pb-4 flex items-center justify-between border-b border-zinc-100"
                        : "px-6 pt-5 pb-4 flex items-center justify-between border-b border-zinc-800"
                    }>
                      <div className={isLight ? "font-mono text-xs text-zinc-400 tracking-[0.5px]" : "font-mono text-xs text-zinc-500 tracking-[0.5px]"}>#{job.id}</div>
                      <div className={`px-3.5 py-0.5 rounded-full text-[10px] font-medium tracking-[0.8px] flex items-center gap-1.5 ${
                        job.status === 'completed' ? (isLight ? 'bg-emerald-500/10 text-emerald-600' : 'bg-emerald-500/15 text-emerald-400') :
                        job.status === 'running' ? (isLight ? 'bg-amber-500/10 text-amber-600' : 'bg-amber-500/15 text-amber-400') :
                        (isLight ? 'bg-zinc-100 text-zinc-500' : 'bg-zinc-800 text-zinc-400')
                      }`}>
                        {job.status === 'completed' && '✓ COMPLETED'}
                        {job.status === 'running' && '⟳ RENDERING'}
                        {job.status === 'pending' && '○ PENDING'}
                      </div>
                    </div>

                    {/* Prompt */}
                    <div className="px-6 pt-4">
                      <p className="text-[14.5px] leading-snug text-zinc-100 line-clamp-3 min-h-[58px]">{job.prompt}</p>
                    </div>

                    {/* Meta */}
                    <div className="px-6 pt-4 pb-4 flex gap-6 text-sm">
                      <div>
                        <div className="text-[10px] text-zinc-500 tracking-[0.8px] uppercase">Duration</div>
                        <div className="font-medium mt-px">{job.duration}s</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-zinc-500 tracking-[0.8px] uppercase">Resolution</div>
                        <div className="font-medium mt-px">{job.resolution}</div>
                        {job.aspectRatio && <div className="text-[10px] text-zinc-500">{job.aspectRatio}</div>}
                      </div>
                      <div className="ml-auto text-right">
                        <div className="text-[10px] text-zinc-500 tracking-[0.8px] uppercase">Created</div>
                        <div className="font-medium mt-px text-xs text-zinc-400">{new Date(job.created).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    </div>

                    {/* Image Area */}
                    <div className="px-6">
                      {job.imageUrl ? (
                        <img 
                          src={job.imageUrl} 
                          alt="Reference" 
                          className={
                            isLight
                              ? "w-full h-[165px] object-cover rounded-2xl border border-zinc-200"
                              : "w-full h-[165px] object-cover rounded-2xl border border-zinc-800"
                          } 
                        />
                      ) : (
                        <div 
                          onClick={() => addImage(job.id)}
                          className={
                            isLight
                              ? "h-[165px] bg-white border border-dashed border-zinc-300 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-zinc-400 transition-all group"
                              : "h-[165px] bg-zinc-950 border border-dashed border-zinc-700 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-zinc-600 transition-all group"
                          }
                        >
                          <div className={isLight ? "text-3xl mb-1.5 opacity-30 group-hover:opacity-50 text-zinc-400" : "text-3xl mb-1.5 opacity-30 group-hover:opacity-50"}>+</div>
                          <div className={isLight ? "text-xs text-zinc-500" : "text-xs text-zinc-400"}>Add reference image</div>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="p-5 pt-4 flex gap-3">
                      {job.status === 'pending' && (
                        <button
                          onClick={() => submitToComfyUI(job.id)}
                          className={
                            isLight
                              ? "flex-1 bg-white border border-zinc-200 hover:bg-zinc-50 active:bg-white text-zinc-700 py-3 rounded-2xl text-sm font-semibold transition-all tracking-[0.3px] shadow-sm"
                              : "flex-1 bg-white hover:bg-zinc-100 active:bg-white text-zinc-950 py-3 rounded-2xl text-sm font-semibold transition-all tracking-[0.3px]"
                          }
                        >
                          Submit to ComfyUI
                        </button>
                      )}
                      {job.status === 'running' && (
                        <button
                          onClick={() => markComplete(job.id)}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-600 text-white py-3 rounded-2xl text-sm font-semibold transition-all tracking-[0.3px]"
                        >
                          Mark as Complete
                        </button>
                      )}
                      <button
                        onClick={() => removeJob(job.id)}
                        className={
                          isLight
                            ? "px-5 bg-white border border-zinc-200 hover:bg-zinc-50 active:bg-white text-zinc-600 py-3 rounded-2xl text-sm font-medium transition-all shadow-sm"
                            : "px-5 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-800 text-zinc-300 py-3 rounded-2xl text-sm font-medium transition-all"
                        }
                      >
                        Remove
                      </button>
                    </div>

                    {/* Video Player */}
                    {job.status === 'completed' && job.videoUrl && (
                      <div className="px-5 pb-5">
                        <video 
                          controls 
                          className={
                            isLight
                              ? "w-full rounded-2xl border border-zinc-200 bg-white"
                              : "w-full rounded-2xl border border-zinc-800 bg-black"
                          }
                          src={job.videoUrl}
                        />
                      </div>
                    )}

                    {job.status === 'running' && (
                      <div className="px-5 pb-5">
                        <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3.5 text-center">
                          <div className="text-emerald-400 text-sm flex items-center justify-center gap-2">
                            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></div>
                            Rendering on ComfyUI...
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  ))}
                </div>

                <div className={
                  isLight
                    ? "mx-auto mt-1 flex w-full max-w-[520px] items-center gap-4 rounded-full border border-zinc-200 bg-white px-7 py-4 shadow-[0_10px_35px_rgb(0,0,0,0.10)]"
                    : "mx-auto mt-1 flex w-full max-w-[520px] items-center gap-4 rounded-full border border-zinc-800 bg-zinc-900 px-7 py-4 shadow-2xl"
                }>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(scrollProgress)}
                    onInput={(e) => scrollToPercent(Number(e.currentTarget.value))}
                    onChange={(e) => scrollToPercent(Number(e.currentTarget.value))}
                    aria-label="Scroll queue cards"
                    className="queue-scroll-range"
                    style={{ '--scroll-progress': `${scrollProgress}%` }}
                  />
                  <div className={isLight ? "w-12 text-right text-base font-semibold text-zinc-700" : "w-12 text-right text-base font-semibold text-zinc-200"}>
                    {Math.round(scrollProgress)}%
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
