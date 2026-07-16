'use client'
import { useState, useRef, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { AD_TEMPLATES } from '@/lib/adTemplates'
import { scanForRiskyContent } from '@/lib/contentRiskCheck'

// NEW: Pre-Flight Content Check — shows a non-blocking warning when the prompt/
// scenes contain words that commonly trigger AI video model content filters
// (based on real failures we've seen: smoking, police chases, weapons, etc.).
// This does NOT block generation — it's a heads-up so the customer can decide
// whether to reword before spending credits on a scene that might fail.
function RiskWarningBanner({ text }) {
  const risks = scanForRiskyContent(text)
  if (risks.length === 0) return null
  return (
    <div style={{ margin: '8px 0', padding: '10px 12px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '8px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#fbbf24', marginBottom: '6px' }}>⚠ Possible content risk detected</div>
      {risks.map((r) => (
        <div key={r.term} style={{ fontSize: '11px', color: '#fde68a', marginBottom: '4px' }}>
          <strong>"{r.term}"</strong> ({r.category}) — {r.suggestion}
        </div>
      ))}
      <div style={{ fontSize: '10px', color: '#9080cc', marginTop: '4px' }}>
        This is a best-effort check — the AI model may still flag other content, or may accept these words. You can generate anyway.
      </div>
    </div>
  )
}

// NEW: approximate cost estimator shown in the right-hand Cost Estimator card.
// Anchored to the same $ values as the old cost guide table (480p/5s no-audio
// ≈ $0.20, 720p/10s no-audio ≈ $0.80, 720p/8s audio ≈ $1.20).
function estimateCredits(resolution, duration, audioOn) {
  const perSecond = { '480p': 0.04, '720p': 0.08, '1080p': 0.12 }[resolution] || 0.08
  const audioMultiplier = audioOn ? 1.5 : 1
  const cost = perSecond * duration * audioMultiplier
  return cost.toFixed(2)
}

export default function Home() {
  const { data: session, status: sessionStatus } = useSession()
  const isSignedIn = sessionStatus === 'authenticated'

  const [prompt, setPrompt] = useState('')
  const [characterBible, setCharacterBible] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [mode, setMode] = useState('text')
  const [resolution, setResolution] = useState('720p')
  const [duration, setDuration] = useState(5)
  const [ratio, setRatio] = useState('16:9')
  const [audioOn, setAudioOn] = useState(false)

  const [generating, setGenerating] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [videoUrl, setVideoUrl] = useState(null)
  const [videoParts, setVideoParts] = useState(null)
  const [error, setError] = useState('')
  const [videosGenerated, setVideosGenerated] = useState(0)

  const [sceneScript, setSceneScript] = useState('')
  const [sceneResults, setSceneResults] = useState([]) // [{index, text, status, url, error}]
  const sceneResultsRef = useRef([]) // mirrors sceneResults to avoid stale-closure issues on retry
  const multiSceneSeedRef = useRef(undefined) // shared seed across scenes, persists across retries
  const [retryingIndex, setRetryingIndex] = useState(null)
  const [stitching, setStitching] = useState(false)
  const cancelRef = useRef(false)

  // NEW: Scene-by-scene approval — in Multi-Scene mode, pause after each scene
  // so the customer can preview it before the next (and costlier) scene is
  // generated. Prevents wasting credits on a whole multi-scene run when an
  // early scene came out wrong.
  const [reviewEachScene, setReviewEachScene] = useState(true)
  const [awaitingApproval, setAwaitingApproval] = useState(false)
  const [pendingSceneIndex, setPendingSceneIndex] = useState(null)

  // NEW: Prompt clarity review — before generating, the prompt/scene script is
  // checked for ambiguity. If flagged, the customer sees original vs. an
  // AI-suggested clearer version and picks one before any credits are spent.
  const [checkingPrompt, setCheckingPrompt] = useState(false)
  const [promptReview, setPromptReview] = useState(null) // { original, issues, improvedPrompt }

  // NEW: AI Smart Scene Split — when a customer pastes a script without
  // [SCENE N] tags (e.g. a GPT-written screenplay with headers, dialogue,
  // "Visual Prompt:" labels, etc.), an LLM reads the whole thing and splits
  // it into clean per-scene prompts automatically. Runs before generation,
  // fails open (falls back to treating the text as one scene) on any error.
  const [autoSplitting, setAutoSplitting] = useState(false)

  // NEW: Post-generation AI QA check — after the final video is ready, grabs a
  // frame and asks a vision model whether it looks consistent with the prompt.
  // Purely informational (never blocks download/use).
  const [qaChecking, setQaChecking] = useState(false)
  const [qaResult, setQaResult] = useState(null) // { matches, note }
  const [lastGenPromptForQA, setLastGenPromptForQA] = useState('')

  // NEW: Structured Prompt Builder — guided fields (one clear subject + one
  // clear action) compose into the prompt, instead of relying on the customer
  // to freehand a well-formed prompt. Reduces the ambiguity that confuses the
  // video model in the first place.
  const [showPromptBuilder, setShowPromptBuilder] = useState(false)
  const [builderSubject, setBuilderSubject] = useState('')
  const [builderAction, setBuilderAction] = useState('')
  const [builderSetting, setBuilderSetting] = useState('')
  const [builderCamera, setBuilderCamera] = useState('')
  const [builderStyle, setBuilderStyle] = useState('')

  const composeStructuredPrompt = () => {
    const parts = []
    if (builderSubject.trim()) parts.push(builderSubject.trim())
    if (builderAction.trim()) parts.push(builderAction.trim())
    let sentence = parts.join(', ')
    if (builderSetting.trim()) sentence += `, in ${builderSetting.trim()}`
    sentence = sentence.trim()
    if (sentence && !sentence.endsWith('.')) sentence += '.'
    const extras = []
    if (builderCamera) extras.push(builderCamera)
    if (builderStyle.trim()) extras.push(builderStyle.trim())
    if (extras.length) sentence += ' ' + extras.join(', ') + '.'
    return sentence.trim()
  }

  const applyStructuredPrompt = () => {
    const composed = composeStructuredPrompt()
    if (!composed) return
    setPrompt(composed)
  }

  // NEW: Ad Template Library state
  const [selectedTemplateId, setSelectedTemplateId] = useState(null)
  const [templateFieldValues, setTemplateFieldValues] = useState({})

  // NEW: Product/Character Reference Images (Multi-Scene) — optional, shows the AI
  // exactly what your product/character looks like instead of it being imagined.
  const [referenceImages, setReferenceImages] = useState([]) // array of {url, uploading}
  const referenceImageInputRef = useRef(null)

  // NEW: Reference Video Editing state
  const [referenceVideoUrl, setReferenceVideoUrl] = useState('')
  const [referencePrompt, setReferencePrompt] = useState('')
  const [referenceUploading, setReferenceUploading] = useState(false)
  const referenceFileInputRef = useRef(null)

  // NEW: Ad Template Library — builds the final [SCENE N] script by replacing
  // {{PLACEHOLDER}} tokens in the chosen template with the customer's field inputs.
  const selectedTemplate = AD_TEMPLATES.find((t) => t.id === selectedTemplateId) || null

  const handleSelectTemplate = (templateId) => {
    setSelectedTemplateId(templateId)
    setTemplateFieldValues({})
  }

  const handleTemplateFieldChange = (key, value) => {
    setTemplateFieldValues((prev) => ({ ...prev, [key]: value }))
  }

  const applyTemplate = () => {
    if (!selectedTemplate) return
    const missing = selectedTemplate.fields.filter((f) => !templateFieldValues[f.key]?.trim())
    if (missing.length > 0) {
      setError(`Please fill in: ${missing.map((f) => f.label).join(', ')}`)
      return
    }
    setError('')
    const filledScenes = selectedTemplate.scenes.map((sceneText, i) => {
      let filled = sceneText
      selectedTemplate.fields.forEach((f) => {
        filled = filled.replaceAll(`{{${f.key}}}`, templateFieldValues[f.key].trim())
      })
      return `[SCENE ${i + 1}]\n${filled}`
    })
    setSceneScript(filledScenes.join('\n\n'))
    setSelectedTemplateId(null)
  }

  // NEW: Uploads a product/character reference image (up to 3), used to ground
  // Multi-Scene generations in what the product/character actually looks like.
  const handleReferenceImageUpload = async (event) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return
    const MAX_SIZE_BYTES = 4.5 * 1024 * 1024
    const room = 3 - referenceImages.length
    const filesToUpload = files.slice(0, room)

    for (const file of filesToUpload) {
      if (file.size > MAX_SIZE_BYTES) {
        setError(`${file.name} is larger than 4.5MB. Try a smaller image.`)
        continue
      }
      const placeholderId = `${Date.now()}-${Math.random()}`
      setReferenceImages((prev) => [...prev, { id: placeholderId, url: null, uploading: true }])
      try {
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch('/api/upload-video', { method: 'POST', body: formData })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.url) throw new Error(data.error || 'Upload failed.')
        setReferenceImages((prev) => prev.map((img) => (img.id === placeholderId ? { ...img, url: data.url, uploading: false } : img)))
      } catch (err) {
        setError(err.message || 'Image upload failed.')
        setReferenceImages((prev) => prev.filter((img) => img.id !== placeholderId))
      }
    }
    if (referenceImageInputRef.current) referenceImageInputRef.current.value = ''
  }

  const removeReferenceImage = (id) => {
    setReferenceImages((prev) => prev.filter((img) => img.id !== id))
  }

  const pollTimer = useRef(null)
  const ffmpegRef = useRef(null) // caches the loaded FFmpeg.wasm instance so we don't reload it for every stitch/export

  // Loads FFmpeg.wasm once and reuses it for stitching AND multi-aspect export.
  const loadFFmpeg = async () => {
    if (ffmpegRef.current) return ffmpegRef.current
    const { FFmpeg } = await import('@ffmpeg/ffmpeg')
    const { toBlobURL } = await import('@ffmpeg/util')
    const ffmpeg = new FFmpeg()
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    })
    ffmpegRef.current = ffmpeg
    return ffmpeg
  }

  // Scene parser. Only splits into multiple scenes when the customer explicitly
  // uses [SCENE 1], [SCENE 2]... markers. Without those markers, the ENTIRE
  // text is treated as a single scene — even if it has paragraph breaks — so a
  // longer description written across multiple paragraphs doesn't silently
  // turn into extra scenes (and extra credits spent) the customer never asked for.
  const parseScenes = (text) => {
    const sceneMarkerRegex = /\[SCENE\s*\d+\]/gi
    if (sceneMarkerRegex.test(text)) {
      return text
        .split(/\[SCENE\s*\d+\]/gi)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    }
    const trimmed = text.trim()
    return trimmed ? [trimmed] : []
  }

  // NEW: Calls the AI scene-splitter for scripts that don't use [SCENE N]
  // tags. Returns an array of clean scene prompts, or null if the split
  // wasn't useful/failed (caller should fall back to treating the text as
  // one scene in that case — never throws).
  const smartSplitScenes = async (text) => {
    try {
      const res = await fetch('/api/seedance/smart-scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: text }),
      })
      if (!res.ok) return null
      const data = await res.json()
      if (Array.isArray(data.scenes) && data.scenes.length > 1) return data.scenes
      return null
    } catch (e) {
      return null
    }
  }

  const stopPolling = () => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current)
      pollTimer.current = null
    }
  }

  const pollStatus = (requestId) =>
    new Promise((resolve, reject) => {
      let attempts = 0
      // FIX: raised from 100 (5 min) to 240 (12 min) — reference-image generations
      // (Seedance 2.0) and some audio generations can genuinely take longer than 5
      // minutes; the old limit was cutting off requests that were still processing.
      const MAX_ATTEMPTS = 240
      pollTimer.current = setInterval(async () => {
        attempts += 1
        try {
          const res = await fetch('/api/seedance/check-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requestId }),
          })
          const data = await res.json()

          if (data.status === 'completed') {
            clearInterval(pollTimer.current)
            resolve(data.imageUrl)
          } else if (data.status === 'failed') {
            clearInterval(pollTimer.current)
            reject(new Error(data.error || 'Generation failed. Please try again.'))
          } else if (attempts > MAX_ATTEMPTS) {
            clearInterval(pollTimer.current)
            reject(new Error('Timed out waiting for video'))
          }
        } catch (e) {
          if (attempts > MAX_ATTEMPTS) {
            clearInterval(pollTimer.current)
            reject(e)
          }
        }
      }, 3000)
    })

  // UPDATED: now accepts { seed, previousVideoUrl } so scenes can chain visually,
  // and returns { urls, seed } so the caller can capture the seed for the next scene.
  const generateOneClip = async (promptText, chainOptions = {}) => {
    const { seed, previousVideoUrl, durationOverride, imageUrls } = chainOptions
    const useReferenceImages = Array.isArray(imageUrls) && imageUrls.length > 0

    const body = useReferenceImages
      ? {
          mode: 'reference-images',
          prompt: promptText,
          image_urls: imageUrls,
          resolution,
          aspect_ratio: ratio,
          duration: durationOverride ? String(durationOverride) : 'auto',
          generate_audio: audioOn,
        }
      : {
          mode: 'text-to-video',
          prompt: promptText,
          negative_prompt: negativePrompt || undefined,
          aspect_ratio: ratio,
          resolution,
          duration: durationOverride ?? duration,
          generate_audio: audioOn,
          seed,
          previous_video_url: previousVideoUrl,
        }

    const res = await fetch('/api/seedance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || `Request failed (${res.status})`)
    }

    const result = await res.json()
    const resolvedSeed = result?.metadata?.seed

    if (result.clips && result.clips.length > 0) {
      const urls = []
      for (const clip of result.clips) {
        urls.push(await pollStatus(clip.request_id))
      }
      return { urls, seed: resolvedSeed }
    }
    const url = await pollStatus(result.request_id)
    return { urls: [url], seed: resolvedSeed }
  }

  const stitchClips = async (urls) => {
    const { fetchFile } = await import('@ffmpeg/util')
    const ffmpeg = await loadFFmpeg()
    setStatusText('Loading video engine...')

    let listContent = ''
    for (let i = 0; i < urls.length; i++) {
      setStatusText(`Downloading clip ${i + 1}/${urls.length} for stitching...`)
      const data = await fetchFile(urls[i])
      const filename = `clip${i}.mp4`
      await ffmpeg.writeFile(filename, data)
      listContent += `file '${filename}'\n`
    }
    await ffmpeg.writeFile('list.txt', listContent)

    setStatusText('Stitching all clips together...')
    await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'output.mp4'])

    const output = await ffmpeg.readFile('output.mp4')
    const blob = new Blob([output.buffer], { type: 'video/mp4' })
    return URL.createObjectURL(blob)
  }

  // NEW: Multi-Aspect Export. Re-crops the already-generated video into a
  // different aspect ratio using a smart center-crop (no re-generation needed).
  const EXPORT_FORMATS = [
    { id: '9:16', label: 'TikTok / Reels / Shorts', ratio: 9 / 16 },
    { id: '1:1', label: 'Instagram Feed', ratio: 1 },
    { id: '16:9', label: 'YouTube', ratio: 16 / 9 },
  ]

  const [exportingFormat, setExportingFormat] = useState(null)
  const [addingCaptions, setAddingCaptions] = useState(false)
  const [showSafeZones, setShowSafeZones] = useState(false)

  const reframeVideo = async (sourceUrl, targetRatio, label) => {
    setExportingFormat(label)
    setError('')
    try {
      const { fetchFile } = await import('@ffmpeg/util')
      const ffmpeg = await loadFFmpeg()
      const data = await fetchFile(sourceUrl)
      await ffmpeg.writeFile('reframe_input.mp4', data)

      const r = targetRatio
      const cropExpr = [
        '-vf',
        `crop=w='if(gt(iw/ih,${r}),ih*${r},iw)':h='if(gt(iw/ih,${r}),ih,iw/${r})'`,
      ]

      await ffmpeg.exec(['-i', 'reframe_input.mp4', ...cropExpr, '-c:a', 'copy', 'reframe_output.mp4'])

      const output = await ffmpeg.readFile('reframe_output.mp4')
      const blob = new Blob([output.buffer], { type: 'video/mp4' })
      const url = URL.createObjectURL(blob)

      const a = document.createElement('a')
      a.href = url
      a.download = `vidro-${label.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.mp4`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
      setError(e.message || 'Export failed. Please try again.')
    } finally {
      setExportingFormat(null)
    }
  }

  // NEW: Auto-Captions. Converts transcribed chunks into SRT subtitle format.
  const buildSRT = (chunks) => {
    const formatTime = (s) => {
      const h = String(Math.floor(s / 3600)).padStart(2, '0')
      const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
      const sec = String(Math.floor(s % 60)).padStart(2, '0')
      const ms = String(Math.round((s % 1) * 1000)).padStart(3, '0')
      return `${h}:${m}:${sec},${ms}`
    }
    return chunks
      .map((c, i) => `${i + 1}\n${formatTime(c.start)} --> ${formatTime(c.end)}\n${c.text.trim()}\n`)
      .join('\n')
  }

  // NEW: Transcribes the current video's audio and burns in TikTok-style captions.
  const handleAddCaptions = async () => {
    if (!videoUrl) return
    setError('')
    setAddingCaptions(true)
    try {
      setStatusText('Transcribing audio...')
      const res = await fetch('/api/seedance/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_url: videoUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Transcription failed.')

      const chunks = data.data?.chunks || []
      if (chunks.length === 0) {
        throw new Error('No speech was detected in this video — captions need audio with dialogue (Audio ON).')
      }

      const srtContent = buildSRT(chunks)

      setStatusText('Burning in captions...')
      const ffmpeg = await loadFFmpeg()
      const { fetchFile } = await import('@ffmpeg/util')
      const videoData = await fetchFile(videoUrl)
      await ffmpeg.writeFile('caption_input.mp4', videoData)
      await ffmpeg.writeFile('captions.srt', srtContent)

      await ffmpeg.exec([
        '-i', 'caption_input.mp4',
        '-vf', "subtitles=captions.srt:force_style='FontName=Arial,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=60'",
        '-c:a', 'copy',
        'caption_output.mp4',
      ])

      const output = await ffmpeg.readFile('caption_output.mp4')
      const blob = new Blob([output.buffer], { type: 'video/mp4' })
      const url = URL.createObjectURL(blob)
      setVideoUrl(url)
      setStatusText('')
    } catch (e) {
      console.error(e)
      setError(e.message || 'Failed to add captions. Please try again.')
      setStatusText('')
    } finally {
      setAddingCaptions(false)
    }
  }

  // Grabs a single frame from a video URL via an off-screen <video> + <canvas>.
  // Works for both FAL-hosted clips and locally-stitched blob: URLs. Fails
  // silently (QA check just gets skipped) if the source can't be read into a
  // canvas — this must never break the customer's actual video.
  const captureFrameFromVideoUrl = (url) =>
    new Promise((resolve, reject) => {
      const video = document.createElement('video')
      video.crossOrigin = 'anonymous'
      video.muted = true
      video.playsInline = true
      video.src = url
      video.onloadeddata = () => {
        try {
          video.currentTime = Math.min(1, (video.duration || 2) / 2)
        } catch {
          resolve(null)
        }
      }
      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = video.videoWidth || 640
          canvas.height = video.videoHeight || 360
          const ctx = canvas.getContext('2d')
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL('image/jpeg', 0.85))
        } catch {
          resolve(null)
        }
      }
      video.onerror = () => resolve(null)
    })

  const runQACheck = async (url, promptText) => {
    if (!url || !promptText) return
    setQaChecking(true)
    setQaResult(null)
    try {
      const frameDataUrl = await captureFrameFromVideoUrl(url)
      if (!frameDataUrl) {
        setQaChecking(false)
        return // couldn't read a frame — skip silently, don't bother the customer
      }
      const res = await fetch('/api/seedance/verify-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText, frameDataUrl }),
      })
      const data = await res.json()
      setQaResult(data)
    } catch (e) {
      console.error('QA check failed', e)
    } finally {
      setQaChecking(false)
    }
  }

  // Runs automatically whenever a final video becomes ready.
  useEffect(() => {
    if (videoUrl && lastGenPromptForQA) {
      runQACheck(videoUrl, lastGenPromptForQA)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl])

  const handleGenerateSingle = async (promptOverride) => {
    const activePrompt = promptOverride ?? prompt
    if (!activePrompt.trim()) {
      setError('Please write a prompt first.')
      return
    }
    if (promptOverride) setPrompt(promptOverride)

    setError('')
    setVideoUrl(null)
    setVideoParts(null)
    setGenerating(true)
    setStatusText('Submitting...')
    setQaResult(null)

    const finalPrompt = characterBible.trim()
      ? `${characterBible.trim()}. ${activePrompt.trim()}`
      : activePrompt.trim()
    setLastGenPromptForQA(activePrompt.trim())

    try {
      setStatusText('Generating your video... (usually 1-3 min)')
      const { urls } = await generateOneClip(finalPrompt)
      if (urls.length > 1) {
        setStatusText('Stitching parts into one final video...')
        setStitching(true)
        const finalUrl = await stitchClips(urls)
        setStitching(false)
        setVideoUrl(finalUrl)
      } else {
        setVideoUrl(urls[0])
      }
      setVideosGenerated((v) => v + 1)
      setStatusText('')
    } catch (e) {
      console.error(e)
      setError(e.message || 'Something went wrong.')
      setStatusText('')
      setStitching(false)
    } finally {
      setGenerating(false)
      stopPolling()
    }
  }

  // NEW: Uploads a video file chosen from the user's device to FAL storage.
  const handleReferenceFileUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const MAX_SIZE_BYTES = 4.5 * 1024 * 1024 // 4.5MB — Vercel serverless request body limit
    if (file.size > MAX_SIZE_BYTES) {
      setError(`Video is larger than 4.5MB (${(file.size / 1024 / 1024).toFixed(1)}MB). Try a smaller or compressed video.`)
      if (referenceFileInputRef.current) referenceFileInputRef.current.value = ''
      return
    }
    try {
      setReferenceUploading(true)
      setError('')
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload-video', { method: 'POST', body: formData })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.url) throw new Error(data.error || 'Upload failed.')
      setReferenceVideoUrl(data.url)
    } catch (err) {
      setError(err.message || 'Video upload failed.')
    } finally {
      setReferenceUploading(false)
      if (referenceFileInputRef.current) referenceFileInputRef.current.value = ''
    }
  }

  // NEW: Reference Video Editing — user pastes a link to their own video and
  // describes what to change. Single request, single result (no scenes, no split).
  const handleGenerateReferenceEdit = async () => {
    if (!referenceVideoUrl.trim()) {
      setError('Please paste a reference video link first.')
      return
    }
    if (!referencePrompt.trim()) {
      setError('Please describe what you want changed (write a prompt).')
      return
    }

    setError('')
    setVideoUrl(null)
    setVideoParts(null)
    setGenerating(true)
    setStatusText('Submitting...')

    try {
      setStatusText('Editing your video... (usually 1-3 min)')
      const res = await fetch('/api/seedance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'reference-edit',
          prompt: referencePrompt.trim(),
          video_url: referenceVideoUrl.trim(),
          resolution,
          aspect_ratio: 'auto',
          duration: 'auto',
          generate_audio: audioOn,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Request failed (${res.status})`)
      }

      const result = await res.json()
      const url = await pollStatus(result.request_id)
      setVideoUrl(url)
      setVideosGenerated((v) => v + 1)
      setStatusText('')
    } catch (e) {
      console.error(e)
      setError(e.message || 'Something went wrong.')
      setStatusText('')
    } finally {
      setGenerating(false)
      stopPolling()
    }
  }

  // Builds the final prompt for a scene, including Character Bible + reference image tag.
  const buildScenePrompt = (sceneText) => {
    const readyReferenceImages = referenceImages.filter((img) => img.url).map((img) => img.url)
    const referenceTag = readyReferenceImages.length > 0
      ? `@Image1 shows exactly what the product/character looks like — keep it visually identical. `
      : ''
    const finalPrompt = referenceTag + (characterBible.trim() ? `${characterBible.trim()}. ${sceneText}` : sceneText)
    return { finalPrompt, readyReferenceImages }
  }

  const updateSceneResult = (index, patch) => {
    sceneResultsRef.current = sceneResultsRef.current.map((s) => (s.index === index ? { ...s, ...patch } : s))
    setSceneResults(sceneResultsRef.current)
  }

  const runSingleScene = async (index, sceneText) => {
    updateSceneResult(index, { status: 'generating', error: null })
    const { finalPrompt, readyReferenceImages } = buildScenePrompt(sceneText)
    const sceneDuration = audioOn ? 8 : 10
    try {
      const { urls, seed } = await generateOneClip(finalPrompt, {
        seed: multiSceneSeedRef.current,
        durationOverride: sceneDuration,
        imageUrls: readyReferenceImages,
      })
      if (multiSceneSeedRef.current === undefined) multiSceneSeedRef.current = seed
      updateSceneResult(index, { status: 'done', url: urls[urls.length - 1] })
      return true
    } catch (e) {
      updateSceneResult(index, { status: 'failed', error: e.message || 'Generation failed' })
      return false
    }
  }

  const tryFinalizeIfAllDone = async () => {
    const results = sceneResultsRef.current
    if (results.length === 0 || !results.every((s) => s.status === 'done')) return
    const orderedUrls = [...results].sort((a, b) => a.index - b.index).map((s) => s.url)
    try {
      if (orderedUrls.length === 1) {
        setVideoUrl(orderedUrls[0])
      } else {
        setStitching(true)
        setStatusText('Stitching all scenes together...')
        const finalUrl = await stitchClips(orderedUrls)
        setVideoUrl(finalUrl)
      }
      setVideosGenerated((v) => v + 1)
    } catch (e) {
      setError(e.message || 'Stitching failed.')
    } finally {
      setStitching(false)
      setStatusText('')
    }
  }

  // Generates exactly one scene, then either pauses for approval (reviewEachScene
  // mode) or continues straight to the next scene (auto mode) / finalizes if it
  // was the last one.
  const generateNextScene = async (index) => {
    if (cancelRef.current) {
      setStatusText('Cancelled.')
      setGenerating(false)
      return
    }
    const scene = sceneResultsRef.current[index]
    if (!scene) return

    setGenerating(true)
    setAwaitingApproval(false)
    setStatusText(`Scene ${index + 1}/${sceneResultsRef.current.length}: generating...`)

    const ok = await runSingleScene(index, scene.text)

    if (cancelRef.current) {
      setStatusText('Cancelled.')
      setGenerating(false)
      return
    }

    if (!ok) {
      // Failed scene — stop and let the customer retry it from the scene strip.
      // No credits are spent moving forward until this one succeeds.
      setGenerating(false)
      setStatusText('')
      return
    }

    if (reviewEachScene) {
      // Pause here — show this scene for approval before spending credits on the next.
      setGenerating(false)
      setStatusText('')
      setPendingSceneIndex(index)
      setAwaitingApproval(true)
      return
    }

    // Auto mode — continue straight to the next scene, or finalize if done.
    const nextIndex = index + 1
    if (nextIndex >= sceneResultsRef.current.length) {
      setGenerating(false)
      setStatusText('')
      stopPolling()
      await tryFinalizeIfAllDone()
    } else {
      await generateNextScene(nextIndex)
    }
  }

  const handleGenerateMultiScene = async (scriptOverride) => {
    const scriptToUse = scriptOverride ?? sceneScript
    let scenes = parseScenes(scriptToUse)
    let finalScript = scriptOverride ?? null

    // No [SCENE N] tags found and there's a meaningful amount of text —
    // likely a pasted script in some other format (screenplay, GPT output,
    // etc). Ask the AI splitter to find the real scene boundaries instead
    // of treating the whole thing as one clip.
    const hasTags = /\[SCENE\s*\d+\]/i.test(scriptToUse)
    if (!hasTags && scriptToUse.trim().length > 300) {
      setAutoSplitting(true)
      setStatusText('Detecting scenes in your script...')
      const split = await smartSplitScenes(scriptToUse)
      setAutoSplitting(false)
      setStatusText('')
      if (split) {
        scenes = split
        finalScript = split.map((s, i) => `[SCENE ${i + 1}]\n${s}`).join('\n\n')
      }
    }

    if (scenes.length === 0) {
      setError('Please write at least one scene.')
      return
    }
    if (finalScript) setSceneScript(finalScript)

    setError('')
    setVideoUrl(null)
    setVideoParts(null)
    setStitching(false)
    cancelRef.current = false
    multiSceneSeedRef.current = undefined
    setAwaitingApproval(false)
    setPendingSceneIndex(null)
    setQaResult(null)
    setLastGenPromptForQA(scenes.join(' — '))

    const initial = scenes.map((text, i) => ({ index: i, text, status: 'pending', url: null, error: null }))
    sceneResultsRef.current = initial
    setSceneResults(initial)

    await generateNextScene(0)
  }

  // Called when the customer approves the scene currently awaiting review —
  // moves on to generating the next scene (or finalizes if it was the last one).
  const approveSceneAndContinue = async () => {
    if (pendingSceneIndex === null) return
    const nextIndex = pendingSceneIndex + 1
    setAwaitingApproval(false)
    setPendingSceneIndex(null)
    if (nextIndex >= sceneResultsRef.current.length) {
      stopPolling()
      await tryFinalizeIfAllDone()
    } else {
      await generateNextScene(nextIndex)
    }
  }

  // Called when the customer isn't happy with the scene awaiting review —
  // re-generates that same scene (same credits spent again, but nothing beyond it).
  const regeneratePendingScene = async () => {
    if (pendingSceneIndex === null) return
    const index = pendingSceneIndex
    setAwaitingApproval(false)
    setPendingSceneIndex(null)
    await generateNextScene(index)
  }

  // Used by the "Retry" button on a failed scene in the thumbnail strip —
  // re-generates that scene and resumes the normal flow (approval pause or auto-continue).
  const retryScene = async (index) => {
    setError('')
    setRetryingIndex(index)
    await generateNextScene(index)
    setRetryingIndex(null)
  }

  const handleCancel = () => {
    cancelRef.current = true
  }

  const handleGenerate = (override) => {
    if (mode === 'multi') {
      handleGenerateMultiScene(override)
    } else if (mode === 'text') {
      handleGenerateSingle(override)
    } else if (mode === 'reference') {
      handleGenerateReferenceEdit()
    } else {
      setError('This mode is still being built — use Text to Video, Multi-Scene, or Reference Video for now.')
    }
  }

  // NEW: Prompt clarity check — runs before generation for Text-to-Video and
  // Multi-Scene (Reference Video edits an existing clip, so there's no prompt
  // to misread the same way). If the AI flags real ambiguity, generation pauses
  // and the customer picks their original wording or the suggested rewrite.
  const checkPromptClarity = async (text) => {
    const res = await fetch('/api/seedance/refine-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: text }),
    })
    if (!res.ok) return null
    return res.json()
  }

  const handleGenerateClick = async () => {
    const textToCheck = mode === 'multi' ? sceneScript : mode === 'text' ? prompt : null

    if (textToCheck && textToCheck.trim()) {
      setCheckingPrompt(true)
      setError('')
      try {
        const review = await checkPromptClarity(textToCheck)
        setCheckingPrompt(false)
        if (review && review.clear === false && review.improvedPrompt && review.improvedPrompt.trim() !== textToCheck.trim()) {
          setPromptReview({ original: textToCheck, issues: review.issues || [], improvedPrompt: review.improvedPrompt })
          return // wait for the customer's choice — don't generate yet
        }
      } catch (e) {
        setCheckingPrompt(false)
        // If the clarity check itself fails, don't block generation — proceed normally.
      }
    }

    handleGenerate()
  }

  const resolvePromptReview = (useSuggested) => {
    const chosenText = useSuggested ? promptReview.improvedPrompt : promptReview.original
    setPromptReview(null)
    handleGenerate(chosenText)
  }

  const MODES = [
    { id: 'text', title: 'Text to Video', subtitle: 'Generate from text description', icon: 'text' },
    { id: 'reference', title: 'Reference Video', subtitle: 'Use a video to guide generation', icon: 'ref' },
    { id: 'multi', title: 'Multi-Scene Story', subtitle: 'Create and stitch multiple scenes', icon: 'multi', badge: 'NEW' },
  ]

  const estCredits = estimateCredits(resolution, mode === 'multi' ? (audioOn ? 8 : 10) : duration, audioOn)

  return (
    <main style={{ background: '#0f0a2e', minHeight: '100vh', padding: '24px' }}>
      <div style={{ maxWidth: '1360px', margin: '0 auto' }}>

        {/* Mode selector — big cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '18px' }}>
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                padding: '16px 18px', borderRadius: '14px',
                background: mode === m.id ? 'rgba(139,92,246,0.12)' : 'rgba(26,18,69,0.6)',
                border: mode === m.id ? '1px solid rgba(139,92,246,0.6)' : '1px solid rgba(139,92,246,0.15)',
              }}
            >
              <div style={{
                width: '38px', height: '38px', borderRadius: '10px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: m.id === 'text' ? 'rgba(139,92,246,0.2)' : m.id === 'reference' ? 'rgba(34,211,238,0.15)' : 'rgba(52,211,153,0.15)',
              }}>
                {m.icon === 'text' && (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
                )}
                {m.icon === 'ref' && (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#67e8f9" strokeWidth="1.8"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                )}
                {m.icon === 'multi' && (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#fff' }}>{m.title}</span>
                  {m.badge && (
                    <span style={{ fontSize: '9px', fontWeight: 800, color: '#0f0a2e', background: '#34d399', padding: '1.5px 6px', borderRadius: '5px' }}>{m.badge}</span>
                  )}
                </div>
                <div style={{ fontSize: '11.5px', color: '#9080cc' }}>{m.subtitle}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Main 3-column layout: Prompt form | Preview | Settings */}
        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr 320px', gap: '16px', alignItems: 'start' }}>

          {/* LEFT: Prompt / Character Bible / Scenes */}
          <div style={{ background: 'rgba(26,18,69,0.8)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: '16px', overflow: 'hidden' }}>
            <div style={{ height: '2px', background: 'linear-gradient(90deg,transparent,#8b5cf6,#f472b6,transparent)' }} />

            {mode !== 'reference' && (
              <div style={{ padding: '14px 14px 0' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Character Bible <span style={{ opacity: 0.6, textTransform: 'none', fontWeight: 400 }}>(optional)</span></div>
                <div style={{ background: 'rgba(15,10,46,0.8)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '10px' }}>
                  <textarea
                    value={characterBible}
                    onChange={(e) => setCharacterBible(e.target.value)}
                    placeholder="e.g. A 28-year-old South Asian woman, short black hair, red hoodie..."
                    style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '13px', lineHeight: 1.6, resize: 'none', padding: '10px 12px', minHeight: '54px', fontFamily: 'inherit' }}
                  />
                </div>
              </div>
            )}

            {mode === 'reference' ? (
              <div style={{ padding: '14px 14px 0' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
                  Reference Video <span style={{ opacity: 0.6, textTransform: 'none', fontWeight: 400 }}>(max 4.5MB, or paste a URL)</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ flex: 1, background: 'rgba(15,10,46,0.8)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '10px' }}>
                    <input
                      value={referenceVideoUrl}
                      onChange={(e) => setReferenceVideoUrl(e.target.value)}
                      placeholder="https://... or upload below"
                      style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '13px', padding: '11px 12px', fontFamily: 'inherit' }}
                    />
                  </div>
                  <input type="file" ref={referenceFileInputRef} hidden accept="video/mp4,video/quicktime,video/webm" onChange={handleReferenceFileUpload} />
                  <button
                    onClick={() => referenceFileInputRef.current?.click()}
                    disabled={referenceUploading}
                    style={{ padding: '0 14px', borderRadius: '10px', border: '1px solid rgba(139,92,246,0.3)', background: referenceUploading ? 'rgba(139,92,246,0.1)' : 'rgba(139,92,246,0.15)', color: '#c4b5fd', fontSize: '11px', fontWeight: 700, cursor: referenceUploading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                  >
                    {referenceUploading ? '...' : '⬆ Upload'}
                  </button>
                </div>
                {referenceVideoUrl && !referenceUploading && (
                  <div style={{ marginBottom: '10px', fontSize: '11px', color: '#34d399' }}>✓ Video ready</div>
                )}

                <div style={{ fontSize: '10px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
                  What do you want to change?
                </div>
                <div style={{ background: 'rgba(15,10,46,0.8)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '10px' }}>
                  <textarea
                    value={referencePrompt}
                    onChange={(e) => setReferencePrompt(e.target.value)}
                    placeholder="e.g. Replace the background with a modern office..."
                    style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '13px', lineHeight: 1.65, resize: 'none', padding: '11px 12px', minHeight: '90px', fontFamily: 'inherit' }}
                  />
                </div>
                <RiskWarningBanner text={referencePrompt} />
              </div>
            ) : mode === 'multi' ? (
              <div style={{ padding: '14px 14px 0' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
                  Ad Templates <span style={{ opacity: 0.6, textTransform: 'none', fontWeight: 400 }}>(optional)</span>
                </div>
                <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '10px', marginBottom: selectedTemplate ? '10px' : '4px' }}>
                  {AD_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleSelectTemplate(selectedTemplateId === t.id ? null : t.id)}
                      style={{
                        flex: '0 0 auto', padding: '8px 12px', borderRadius: '9px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                        border: selectedTemplateId === t.id ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(139,92,246,0.15)',
                        background: selectedTemplateId === t.id ? 'rgba(139,92,246,0.25)' : 'rgba(15,10,46,0.6)',
                        color: selectedTemplateId === t.id ? '#c4b5fd' : '#9080cc',
                      }}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>

                {selectedTemplate && (
                  <div style={{ background: 'rgba(15,10,46,0.8)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
                    <p style={{ fontSize: '11px', color: '#9080cc', marginBottom: '10px' }}>{selectedTemplate.description}</p>
                    {selectedTemplate.fields.map((f) => (
                      <div key={f.key} style={{ marginBottom: '8px' }}>
                        <label style={{ fontSize: '10px', color: '#c4b5fd', fontWeight: 600, display: 'block', marginBottom: '4px' }}>{f.label}</label>
                        <input
                          value={templateFieldValues[f.key] || ''}
                          onChange={(e) => handleTemplateFieldChange(f.key, e.target.value)}
                          placeholder={f.placeholder}
                          style={{ width: '100%', background: 'rgba(15,10,46,0.6)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '8px', color: '#fff', fontSize: '12px', padding: '8px 10px', fontFamily: 'inherit', outline: 'none' }}
                        />
                      </div>
                    ))}
                    <button
                      onClick={applyTemplate}
                      style={{ width: '100%', marginTop: '6px', padding: '9px', borderRadius: '8px', border: 'none', background: 'rgba(139,92,246,0.3)', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      ✨ Fill Scenes From This Template
                    </button>
                  </div>
                )}

                <div style={{ fontSize: '10px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
                  Reference Images <span style={{ opacity: 0.6, textTransform: 'none', fontWeight: 400 }}>(optional, up to 3)</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  {referenceImages.map((img) => (
                    <div key={img.id} style={{ position: 'relative', width: '56px', height: '56px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(15,10,46,0.6)' }}>
                      {img.uploading ? (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: '#9080cc' }}>...</div>
                      ) : (
                        <>
                          <img src={img.url} alt="reference" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <button onClick={() => removeReferenceImage(img.id)} style={{ position: 'absolute', top: '2px', right: '2px', width: '16px', height: '16px', borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '10px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
                        </>
                      )}
                    </div>
                  ))}
                  {referenceImages.length < 3 && (
                    <>
                      <input type="file" ref={referenceImageInputRef} hidden accept="image/png,image/jpeg,image/webp" multiple onChange={handleReferenceImageUpload} />
                      <button onClick={() => referenceImageInputRef.current?.click()} style={{ width: '56px', height: '56px', borderRadius: '8px', border: '1px dashed rgba(139,92,246,0.4)', background: 'rgba(15,10,46,0.4)', color: '#9080cc', fontSize: '18px', cursor: 'pointer' }}>+</button>
                    </>
                  )}
                </div>

                <div style={{ fontSize: '10px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
                  Scenes <span style={{ opacity: 0.6, textTransform: 'none', fontWeight: 400 }}>(use [SCENE 1], [SCENE 2]... tags, or just paste any script — AI will auto-detect the scenes for you. Each scene is {audioOn ? '8s' : '10s'}.)</span>
                </div>
                <div style={{ background: 'rgba(15,10,46,0.8)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '10px' }}>
                  <textarea
                    value={sceneScript}
                    onChange={(e) => setSceneScript(e.target.value)}
                    placeholder={'[SCENE 1]\nWoman walks into a bright kitchen...\n\n[SCENE 2]\nClose-up of product on the counter...'}
                    style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '13px', lineHeight: 1.65, resize: 'none', padding: '11px 12px', minHeight: '120px', fontFamily: 'inherit' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderTop: '1px solid rgba(139,92,246,0.15)' }}>
                    <span style={{ fontSize: '11px', color: '#9080cc' }}>
                      {parseScenes(sceneScript).length} scenes · ~{parseScenes(sceneScript).length * duration}s total
                    </span>
                  </div>
                </div>

                <RiskWarningBanner text={sceneScript} />

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={reviewEachScene}
                    onChange={(e) => setReviewEachScene(e.target.checked)}
                    disabled={generating}
                    style={{ width: '14px', height: '14px', accentColor: '#8b5cf6' }}
                  />
                  <span style={{ fontSize: '11.5px', color: '#c8c0ff' }}>
                    Review each scene before continuing <span style={{ color: '#9080cc' }}>(recommended — avoids wasting credits on later scenes)</span>
                  </span>
                </label>

                {generating && (
                  <button onClick={handleCancel} style={{ marginTop: '8px', width: '100%', padding: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#fca5a5', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Cancel remaining scenes
                  </button>
                )}
              </div>
            ) : (
              <div style={{ padding: '14px 14px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '1px' }}>Prompt</span>
                  <button
                    onClick={() => setShowPromptBuilder((v) => !v)}
                    style={{ fontSize: '10px', color: '#c4b5fd', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}
                  >
                    {showPromptBuilder ? '✕ Close Builder' : '🧩 Prompt Builder'}
                  </button>
                </div>

                {showPromptBuilder && (
                  <div style={{ background: 'rgba(15,10,46,0.8)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '10px', padding: '12px', marginBottom: '10px' }}>
                    <p style={{ fontSize: '10.5px', color: '#9080cc', marginBottom: '10px', lineHeight: 1.4 }}>
                      Fill these in and we'll compose a clear, well-formed prompt — one clear subject and one clear action works far better than a long freeform description.
                    </p>
                    <div style={{ marginBottom: '8px' }}>
                      <label style={{ fontSize: '10px', color: '#c4b5fd', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Subject / Character</label>
                      <input value={builderSubject} onChange={(e) => setBuilderSubject(e.target.value)} placeholder="e.g. A young woman in a red hoodie" style={{ width: '100%', background: 'rgba(15,10,46,0.6)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '8px', color: '#fff', fontSize: '12px', padding: '8px 10px', fontFamily: 'inherit', outline: 'none' }} />
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                      <label style={{ fontSize: '10px', color: '#c4b5fd', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Action <span style={{ opacity: 0.6, fontWeight: 400 }}>(just one)</span></label>
                      <input value={builderAction} onChange={(e) => setBuilderAction(e.target.value)} placeholder="e.g. smiles and holds up a coffee cup" style={{ width: '100%', background: 'rgba(15,10,46,0.6)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '8px', color: '#fff', fontSize: '12px', padding: '8px 10px', fontFamily: 'inherit', outline: 'none' }} />
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                      <label style={{ fontSize: '10px', color: '#c4b5fd', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Setting</label>
                      <input value={builderSetting} onChange={(e) => setBuilderSetting(e.target.value)} placeholder="e.g. a bright modern kitchen" style={{ width: '100%', background: 'rgba(15,10,46,0.6)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '8px', color: '#fff', fontSize: '12px', padding: '8px 10px', fontFamily: 'inherit', outline: 'none' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '10px', color: '#c4b5fd', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Camera</label>
                        <select value={builderCamera} onChange={(e) => setBuilderCamera(e.target.value)} style={{ width: '100%', background: 'rgba(15,10,46,0.6)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '8px', color: '#fff', fontSize: '12px', padding: '8px 10px', fontFamily: 'inherit', outline: 'none' }}>
                          <option value="">Default</option>
                          <option value="Static camera shot">Static</option>
                          <option value="Slow pan across the scene">Slow pan</option>
                          <option value="Slow zoom in">Slow zoom in</option>
                          <option value="Handheld camera movement">Handheld</option>
                          <option value="Drone aerial shot">Drone / aerial</option>
                        </select>
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '10px', color: '#c4b5fd', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Style</label>
                        <input value={builderStyle} onChange={(e) => setBuilderStyle(e.target.value)} placeholder="e.g. cinematic, warm lighting" style={{ width: '100%', background: 'rgba(15,10,46,0.6)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '8px', color: '#fff', fontSize: '12px', padding: '8px 10px', fontFamily: 'inherit', outline: 'none' }} />
                      </div>
                    </div>
                    {composeStructuredPrompt() && (
                      <div style={{ fontSize: '11px', color: '#9080cc', marginBottom: '8px', lineHeight: 1.5 }}>
                        <strong style={{ color: '#c8c0ff' }}>Preview:</strong> {composeStructuredPrompt()}
                      </div>
                    )}
                    <button
                      onClick={applyStructuredPrompt}
                      disabled={!builderSubject.trim() && !builderAction.trim()}
                      style={{ width: '100%', padding: '9px', borderRadius: '8px', border: 'none', background: 'rgba(139,92,246,0.3)', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: (!builderSubject.trim() && !builderAction.trim()) ? 0.4 : 1 }}
                    >
                      ✨ Use This Prompt
                    </button>
                  </div>
                )}

                <div style={{ background: 'rgba(15,10,46,0.8)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '10px' }}>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe your video... e.g. A cinematic drone shot over a neon-lit city at night, rain falling on wet streets, slow pan with bokeh lights..."
                    style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '13px', lineHeight: 1.65, resize: 'none', padding: '11px 12px', minHeight: '150px', fontFamily: 'inherit' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '8px 12px', borderTop: '1px solid rgba(139,92,246,0.15)' }}>
                    <span style={{ fontSize: '11px', color: '#9080cc' }}>{prompt.length} / 500</span>
                  </div>
                </div>
                <RiskWarningBanner text={prompt} />
              </div>
            )}

            <div style={{ padding: '8px 14px 14px' }}>
              <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '8px', padding: '8px 11px', display: 'flex', alignItems: 'center', gap: '7px' }}>
                <span style={{ fontSize: '13px', color: 'rgba(239,68,68,0.6)' }}>⊘</span>
                <input
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder="Negative prompt: blurry, distorted, watermark..."
                  style={{ background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '12px', flex: 1, fontFamily: 'inherit' }}
                />
              </div>
            </div>
          </div>

          {/* CENTER: Preview */}
          <div style={{ background: 'rgba(26,18,69,0.8)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: '16px', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(139,92,246,0.15)' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>▷ Preview</span>
              {videoUrl && <span style={{ fontSize: '10px', color: '#9080cc' }}>Ready</span>}
            </div>

            {awaitingApproval && pendingSceneIndex !== null ? (
              <div style={{ padding: '14px' }}>
                <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '8px', padding: '9px 12px', marginBottom: '10px', fontSize: '12px', color: '#fde68a', fontWeight: 600 }}>
                  Scene {pendingSceneIndex + 1} of {sceneResultsRef.current.length} is ready — review before the next scene generates
                </div>
                <video
                  src={sceneResults.find((s) => s.index === pendingSceneIndex)?.url}
                  controls autoPlay loop
                  style={{ width: '100%', display: 'block', borderRadius: '10px', background: '#000' }}
                />
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <button
                    onClick={approveSceneAndContinue}
                    style={{ flex: 1, padding: '11px', borderRadius: '9px', border: 'none', background: '#34d399', color: '#0f0a2e', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    ✓ Approve & Continue
                  </button>
                  <button
                    onClick={regeneratePendingScene}
                    style={{ flex: 1, padding: '11px', borderRadius: '9px', border: '1px solid rgba(139,92,246,0.4)', background: 'rgba(139,92,246,0.15)', color: '#c4b5fd', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    ↻ Regenerate This Scene
                  </button>
                </div>
                {pendingSceneIndex + 1 >= sceneResultsRef.current.length && (
                  <p style={{ fontSize: '10.5px', color: '#9080cc', marginTop: '8px' }}>This is the last scene — approving will stitch the full video together.</p>
                )}
              </div>
            ) : videoUrl ? (
              <div style={{ padding: '14px' }}>
                {(qaChecking || qaResult) && (
                  <div style={{
                    marginBottom: '10px', padding: '9px 12px', borderRadius: '8px', fontSize: '11.5px',
                    background: qaChecking ? 'rgba(139,92,246,0.08)' : qaResult?.matches === false ? 'rgba(251,191,36,0.08)' : 'rgba(52,211,153,0.08)',
                    border: qaChecking ? '1px solid rgba(139,92,246,0.25)' : qaResult?.matches === false ? '1px solid rgba(251,191,36,0.3)' : '1px solid rgba(52,211,153,0.25)',
                    color: qaChecking ? '#c4b5fd' : qaResult?.matches === false ? '#fde68a' : '#6ee7b7',
                  }}>
                    {qaChecking ? '◐ Checking if the video matches your prompt...' : qaResult?.matches === false ? `⚠ AI QA note: ${qaResult.note || 'This may not fully match your prompt — worth a look before using it.'}` : `✓ Looks consistent with your prompt${qaResult?.note ? ` — ${qaResult.note}` : ''}`}
                  </div>
                )}
                <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden' }}>
                  <video src={videoUrl} controls autoPlay loop style={{ width: '100%', display: 'block', borderRadius: '10px', background: '#000' }} />
                  {showSafeZones && ratio === '9:16' && (
                    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '18%', background: 'repeating-linear-gradient(45deg, rgba(239,68,68,0.25), rgba(239,68,68,0.25) 6px, rgba(239,68,68,0.1) 6px, rgba(239,68,68,0.1) 12px)', borderTop: '1px dashed rgba(239,68,68,0.6)' }} />
                      <div style={{ position: 'absolute', right: 0, top: '35%', bottom: '18%', width: '14%', background: 'repeating-linear-gradient(45deg, rgba(239,68,68,0.25), rgba(239,68,68,0.25) 6px, rgba(239,68,68,0.1) 6px, rgba(239,68,68,0.1) 12px)', borderLeft: '1px dashed rgba(239,68,68,0.6)' }} />
                      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '6%', background: 'repeating-linear-gradient(45deg, rgba(239,68,68,0.2), rgba(239,68,68,0.2) 6px, rgba(239,68,68,0.08) 6px, rgba(239,68,68,0.08) 12px)' }} />
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                  <button onClick={() => setShowSafeZones((v) => !v)} style={{ flex: '1 1 160px', padding: '9px', borderRadius: '8px', border: '1px solid rgba(139,92,246,0.2)', background: showSafeZones ? 'rgba(139,92,246,0.15)' : 'transparent', color: '#9080cc', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {showSafeZones ? '✓ ' : '👁 '}Safe Zones
                  </button>
                  <button onClick={handleAddCaptions} disabled={addingCaptions || exportingFormat !== null} style={{ flex: '1 1 160px', padding: '9px', borderRadius: '8px', border: '1px solid rgba(139,92,246,0.3)', background: addingCaptions ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.15)', color: '#c4b5fd', fontSize: '11px', fontWeight: 700, cursor: addingCaptions ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                    {addingCaptions ? (statusText || 'Adding...') : '💬 Captions'}
                  </button>
                  <a href={videoUrl} download target="_blank" rel="noopener noreferrer" style={{ flex: '1 1 160px', textAlign: 'center', padding: '9px', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '8px', color: '#c4b5fd', fontSize: '11px', fontWeight: 700, textDecoration: 'none' }}>⬇ Download</a>
                </div>
                {showSafeZones && ratio !== '9:16' && (
                  <p style={{ fontSize: '10px', color: '#9080cc', marginTop: '6px' }}>Safe zone guides apply to 9:16 vertical video.</p>
                )}

                <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid rgba(139,92,246,0.15)' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
                    Export for Other Platforms
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {EXPORT_FORMATS.map((f) => (
                      <button key={f.id} onClick={() => reframeVideo(videoUrl, f.ratio, `${f.label} ${f.id}`)} disabled={exportingFormat !== null || addingCaptions} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: '8px', border: '1px solid rgba(139,92,246,0.25)', background: 'rgba(15,10,46,0.6)', color: '#c8c0ff', fontSize: '12px', fontWeight: 600, cursor: exportingFormat !== null ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                        <span>{f.label}</span>
                        <span style={{ color: '#9080cc', fontSize: '11px' }}>{exportingFormat === `${f.label} ${f.id}` ? 'Exporting...' : `${f.id} ⬇`}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : videoParts ? (
              <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ fontSize: '11px', color: '#9080cc' }}>Your video was generated in 2 parts:</p>
                {videoParts.map((url, i) => (
                  <div key={i}>
                    <video src={url} controls style={{ width: '100%', borderRadius: '10px', background: '#000' }} />
                    <a href={url} download target="_blank" rel="noopener noreferrer" style={{ display: 'block', textAlign: 'center', marginTop: '6px', padding: '8px', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '9px', color: '#c4b5fd', fontSize: '11px', fontWeight: 700, textDecoration: 'none' }}>⬇ Download Part {i === 0 ? 'A' : 'B'}</a>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ height: '340px', background: 'linear-gradient(145deg,#07051a,#120d35)', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(139,92,246,0.1)', margin: '14px', borderRadius: '10px' }}>
                {generating && (
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg,transparent,rgba(139,92,246,0.8),rgba(244,114,182,0.5),transparent)', animation: 'scan 3s linear infinite' }} />
                )}
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                </div>
                <div style={{ position: 'absolute', bottom: '14px', width: '80%', textAlign: 'center', fontSize: '12px', color: '#9080cc' }}>
                  {generating ? (statusText || 'Generating...') : 'Write a prompt and click Generate'}
                </div>
              </div>
            )}

            {/* Scene thumbnails strip — Multi-Scene mode only */}
            {mode === 'multi' && sceneResults.length > 0 && (
              <div style={{ padding: '0 14px 14px', display: 'flex', gap: '8px', overflowX: 'auto' }}>
                {sceneResults.map((s) => (
                  <div key={s.index} style={{ flex: '0 0 auto', width: '96px' }}>
                    <div style={{
                      width: '96px', height: '64px', borderRadius: '8px', overflow: 'hidden', position: 'relative',
                      border: s.status === 'done' ? '1px solid rgba(52,211,153,0.5)' : s.status === 'failed' ? '1px solid rgba(248,113,113,0.5)' : '1px solid rgba(139,92,246,0.25)',
                      background: '#07051a', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {s.url ? (
                        <video src={s.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                      ) : (
                        <span style={{ fontSize: '16px' }}>
                          {s.status === 'generating' ? '◐' : s.status === 'failed' ? '✕' : '○'}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                      <span style={{ fontSize: '10px', color: '#9080cc' }}>Scene {s.index + 1}</span>
                      {s.status === 'failed' && !generating && (
                        <button onClick={() => retryScene(s.index)} disabled={retryingIndex !== null} style={{ fontSize: '9px', color: '#c4b5fd', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                          {retryingIndex === s.index ? '...' : '↻ Retry'}
                        </button>
                      )}
                    </div>
                    {s.status === 'failed' && s.error && (
                      <div style={{ fontSize: '9px', color: '#fca5a5', marginTop: '2px', lineHeight: '1.3', wordBreak: 'break-word' }}>
                        {s.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div style={{ margin: '0 14px 14px', padding: '9px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#fca5a5', fontSize: '12px' }}>
                {error}
              </div>
            )}
          </div>

          {/* RIGHT: Video Settings + Cost Estimator + Generate */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ background: 'rgba(26,18,69,0.8)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: '16px', padding: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', marginBottom: '14px' }}>Video Settings</div>

              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: '7px' }}>Resolution</div>
                <div style={{ display: 'flex', gap: '5px' }}>
                  {['480p', '720p', '1080p'].map((r) => (
                    <button key={r} onClick={() => setResolution(r)} style={{ flex: 1, padding: '9px 3px', borderRadius: '8px', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer', border: resolution === r ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(139,92,246,0.15)', background: resolution === r ? 'rgba(139,92,246,0.2)' : 'rgba(15,10,46,0.5)', color: resolution === r ? '#c4b5fd' : '#9080cc', fontFamily: 'inherit' }}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: '7px' }}>Duration</div>
                <div style={{ display: 'flex', gap: '5px' }}>
                  {[5, 10, 15].map((d) => (
                    <button key={d} onClick={() => setDuration(d)} style={{ flex: 1, padding: '9px 3px', borderRadius: '8px', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer', border: duration === d ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(139,92,246,0.15)', background: duration === d ? 'rgba(139,92,246,0.2)' : 'rgba(15,10,46,0.5)', color: duration === d ? '#c4b5fd' : '#9080cc', fontFamily: 'inherit' }}>
                      {d}s
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: '7px' }}>Aspect Ratio</div>
                <div style={{ display: 'flex', gap: '5px' }}>
                  {['16:9', '9:16', '1:1'].map((r) => (
                    <button key={r} onClick={() => setRatio(r)} style={{ flex: 1, padding: '9px 3px', borderRadius: '8px', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer', border: ratio === r ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(139,92,246,0.15)', background: ratio === r ? 'rgba(139,92,246,0.2)' : 'rgba(15,10,46,0.5)', color: ratio === r ? '#c4b5fd' : '#9080cc', fontFamily: 'inherit' }}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '.7px' }}>Audio</span>
                  <button
                    onClick={() => setAudioOn((v) => !v)}
                    style={{ width: '38px', height: '21px', borderRadius: '11px', border: 'none', cursor: 'pointer', position: 'relative', background: audioOn ? '#8b5cf6' : 'rgba(139,92,246,0.2)', transition: 'background .15s' }}
                  >
                    <span style={{ position: 'absolute', top: '2px', left: audioOn ? '19px' : '2px', width: '17px', height: '17px', borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
                  </button>
                </div>
                <p style={{ fontSize: '10.5px', color: '#9080cc', marginTop: '6px', lineHeight: 1.4 }}>
                  Generate native audio with lip-sync and sound effects.
                </p>
              </div>
            </div>

            {/* Cost Estimator */}
            <div style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: '16px', padding: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#fbbf24', marginBottom: '10px' }}>Cost Estimator</div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '24px', fontWeight: 800, color: '#fff' }}>~{estCredits} Credits</span>
                <span style={{ fontSize: '10px', color: '#9080cc' }}>Estimated cost</span>
              </div>
              <div style={{ fontSize: '11px', color: '#c8c0ff', marginTop: '6px' }}>
                {resolution} · {mode === 'multi' ? (audioOn ? '8s/scene' : '10s/scene') : `${duration}s`} · {audioOn ? 'Audio on' : 'No audio'}
              </div>
            </div>

            {promptReview && (
              <div style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.35)', borderRadius: '12px', padding: '14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#c4b5fd', marginBottom: '8px' }}>
                  ✨ This prompt could be clearer — here's why:
                </div>
                <ul style={{ margin: '0 0 10px', paddingLeft: '16px' }}>
                  {promptReview.issues.map((issue, i) => (
                    <li key={i} style={{ fontSize: '11px', color: '#c8c0ff', marginBottom: '3px' }}>{issue}</li>
                  ))}
                </ul>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: '4px' }}>Suggested rewrite</div>
                <div style={{ background: 'rgba(15,10,46,0.7)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '8px', padding: '9px 11px', fontSize: '12px', color: '#fff', lineHeight: 1.5, marginBottom: '10px' }}>
                  {promptReview.improvedPrompt}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => resolvePromptReview(true)}
                    style={{ flex: 1, padding: '9px', borderRadius: '8px', border: 'none', background: '#8b5cf6', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Use Suggested
                  </button>
                  <button
                    onClick={() => resolvePromptReview(false)}
                    style={{ flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid rgba(139,92,246,0.3)', background: 'transparent', color: '#c8c0ff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Keep My Original
                  </button>
                </div>
              </div>
            )}

            {!isSignedIn && sessionStatus !== 'loading' && (
              <div style={{ padding: '9px 12px', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '10px', color: '#c4b5fd', fontSize: '12px', textAlign: 'center' }}>
                Sign in above to start generating videos.
              </div>
            )}

            <button
              onClick={handleGenerateClick}
              disabled={generating || checkingPrompt || autoSplitting || referenceUploading || !isSignedIn || awaitingApproval}
              style={{
                display: 'flex', width: '100%', height: '50px', background: (generating || checkingPrompt || autoSplitting || !isSignedIn || awaitingApproval) ? '#5b3fa0' : 'linear-gradient(135deg,#8b5cf6,#7c3aed)', border: 'none', borderRadius: '13px', color: '#fff', fontSize: '15px', fontWeight: 800, alignItems: 'center', justifyContent: 'center', gap: '7px', cursor: (generating || checkingPrompt || autoSplitting || !isSignedIn || awaitingApproval) ? 'not-allowed' : 'pointer', fontFamily: 'inherit', boxShadow: '0 0 28px rgba(139,92,246,0.4)', opacity: !isSignedIn ? 0.6 : 1,
              }}
            >
              {checkingPrompt ? (
                <>
                  <span style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                  Reviewing your prompt...
                </>
              ) : autoSplitting ? (
                <>
                  <span style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                  Detecting scenes in your script...
                </>
              ) : generating ? (
                <>
                  <span style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                  {statusText || 'Generating...'}
                </>
              ) : awaitingApproval ? (
                'Review the scene above to continue'
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                  {isSignedIn ? 'Generate Video' : 'Sign in to Generate'}
                </>
              )}
            </button>
            <p style={{ textAlign: 'center', fontSize: '11px', color: '#9080cc', marginTop: '-4px' }}>
              Generation takes 1–3 minutes
            </p>
          </div>
        </div>

        {/* Your Creations strip */}
        <div style={{ marginTop: '22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>Your Creations</span>
          <a href="/creations" style={{ fontSize: '12px', color: '#c4b5fd', textDecoration: 'none', fontWeight: 600 }}>View all →</a>
        </div>
        <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
          <div style={{ flex: 1, background: 'rgba(26,18,69,0.6)', border: '1px dashed rgba(139,92,246,0.25)', borderRadius: '12px', padding: '18px', textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#c4b5fd' }}>{videosGenerated}</div>
            <div style={{ fontSize: '11px', color: '#9080cc' }}>Videos generated this session — full history on the Gallery page</div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes scan { 0% { top: 0; } 100% { top: 100%; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </main>
  )
}
