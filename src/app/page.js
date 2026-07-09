'use client'
import { useState, useRef } from 'react'
import { AD_TEMPLATES } from '@/lib/adTemplates'

export default function Home() {
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


  // Smart scene parser. If the script uses [SCENE 1], [SCENE 2]... markers,
  // split on those. Otherwise, split on blank lines (paragraph breaks) — so a
  // multi-line description of one scene stays as ONE scene, not several.
  const parseScenes = (text) => {
    const sceneMarkerRegex = /\[SCENE\s*\d+\]/gi
    if (sceneMarkerRegex.test(text)) {
      return text
        .split(/\[SCENE\s*\d+\]/gi)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    }
    return text
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
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
    const { FFmpeg } = await import('@ffmpeg/ffmpeg')
    const { fetchFile, toBlobURL } = await import('@ffmpeg/util')

    const ffmpeg = new FFmpeg()
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
    setStatusText('Loading video engine...')
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    })

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

  const handleGenerateSingle = async () => {
    if (!prompt.trim()) {
      setError('Please write a prompt first.')
      return
    }

    setError('')
    setVideoUrl(null)
    setVideoParts(null)
    setGenerating(true)
    setStatusText('Submitting...')

    const finalPrompt = characterBible.trim()
      ? `${characterBible.trim()}. ${prompt.trim()}`
      : prompt.trim()

    try {
      setStatusText('Generating your video... (usually 1-3 min)')
      const { urls } = await generateOneClip(finalPrompt)
      if (urls.length > 1) {
        // FIX: previously this just showed separate Part A / Part B downloads.
        // Now we auto-stitch them into one final video, same as Multi-Scene mode does.
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

  // NEW: Uploads a video file chosen from the user's device to FAL storage,
  // then fills referenceVideoUrl with the resulting public URL automatically.
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

  // Generates (or re-generates) exactly ONE scene. Used both by the initial run and
  // by retryScene() — same logic, same shared seed, so a retried scene still matches
  // the rest of the video.
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

  // If every scene is now 'done' (after the initial run, or after a retry fixed the
  // last failing scene), automatically stitch everything into the final video.
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

  const handleGenerateMultiScene = async () => {
    const scenes = parseScenes(sceneScript)

    if (scenes.length === 0) {
      setError('Please write at least one scene.')
      return
    }

    setError('')
    setVideoUrl(null)
    setVideoParts(null)
    setGenerating(true)
    setStitching(false)
    cancelRef.current = false
    multiSceneSeedRef.current = undefined

    const initial = scenes.map((text, i) => ({ index: i, text, status: 'pending', url: null, error: null }))
    sceneResultsRef.current = initial
    setSceneResults(initial)

    for (let i = 0; i < scenes.length; i++) {
      if (cancelRef.current) {
        setStatusText('Cancelled.')
        break
      }
      setStatusText(`Scene ${i + 1}/${scenes.length}: generating...`)
      // FIX: no longer throws/aborts on a single scene's failure — every scene gets
      // attempted, so a customer never loses successful scenes just because one failed.
      await runSingleScene(i, scenes[i])
    }

    setStatusText('')
    setGenerating(false)
    stopPolling()
    await tryFinalizeIfAllDone()
  }

  // NEW: Retry-Failed-Scene-Only. Re-generates just the one scene that failed —
  // successful scenes are untouched, so the customer doesn't pay/wait for a full
  // 5-scene re-run just because one scene hit a content-policy flag or timeout.
  const retryScene = async (index) => {
    const scene = sceneResultsRef.current.find((s) => s.index === index)
    if (!scene) return
    setError('')
    setRetryingIndex(index)
    await runSingleScene(index, scene.text)
    setRetryingIndex(null)
    await tryFinalizeIfAllDone()
  }

  const handleCancel = () => {
    cancelRef.current = true
  }

  const handleGenerate = () => {
    if (mode === 'multi') {
      handleGenerateMultiScene()
    } else if (mode === 'text') {
      handleGenerateSingle()
    } else if (mode === 'reference') {
      handleGenerateReferenceEdit()
    } else {
      setError('This mode is still being built — use Text to Video, Multi-Scene, or Reference Video for now.')
    }
  }

  return (
    <main style={{ background: '#0f0a2e', minHeight: '100vh', padding: '24px 20px' }}>

      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#fff', letterSpacing: '-1px', marginBottom: '6px' }}>
          Vidro <span style={{ background: 'linear-gradient(135deg,#a78bfa,#f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>AI Studio</span>
        </h1>
        <p style={{ fontSize: '14px', color: '#9080cc' }}>
          Generate cinematic videos with voice — no editing skills required
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: '18px', maxWidth: '1100px', margin: '0 auto', alignItems: 'start' }}>

        <div style={{ background: 'rgba(26,18,69,0.8)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: '16px', overflow: 'hidden', position: 'relative' }}>
          <div style={{ height: '2px', background: 'linear-gradient(90deg,transparent,#8b5cf6,#f472b6,transparent)' }} />

          <div style={{ display: 'flex', gap: '4px', padding: '14px 14px 0' }}>
            {[
              { id: 'text', label: 'Text to Video' },
              { id: 'reference', label: 'Reference Video' },
              { id: 'multi', label: 'Multi-Scene' },
            ].map((tab) => (
              <button key={tab.id} onClick={() => setMode(tab.id)} style={{
                padding: '7px 14px', fontSize: '12px', fontWeight: 600, borderRadius: '8px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: mode === tab.id ? 'rgba(139,92,246,0.2)' : 'transparent',
                color: mode === tab.id ? '#c4b5fd' : '#9080cc',
                outline: mode === tab.id ? '1px solid rgba(139,92,246,0.4)' : 'none',
              }}>{tab.label}</button>
            ))}
          </div>

          {mode !== 'reference' && (
            <div style={{ padding: '12px 14px 0' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Character Bible <span style={{ opacity: 0.6, textTransform: 'none', fontWeight: 400 }}>(optional — keeps character consistent)</span></div>
              <div style={{ background: 'rgba(15,10,46,0.8)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '10px' }}>
                <textarea
                  value={characterBible}
                  onChange={(e) => setCharacterBible(e.target.value)}
                  placeholder="e.g. A 28-year-old South Asian woman, short black hair, wearing a red hoodie, warm friendly expression..."
                  style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '13px', lineHeight: 1.6, resize: 'none', padding: '10px 12px', minHeight: '54px', fontFamily: 'inherit' }}
                />
              </div>
            </div>
          )}

          {mode === 'reference' ? (
            <div style={{ padding: '12px 14px 0' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
                Reference Video <span style={{ opacity: 0.6, textTransform: 'none', fontWeight: 400 }}>(upload a file — max 4.5MB — or paste a direct video URL)</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <div style={{ flex: 1, background: 'rgba(15,10,46,0.8)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '10px' }}>
                  <input
                    value={referenceVideoUrl}
                    onChange={(e) => setReferenceVideoUrl(e.target.value)}
                    placeholder="https://... direct video link, or upload below"
                    style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '13px', padding: '11px 12px', fontFamily: 'inherit' }}
                  />
                </div>
                <input type="file" ref={referenceFileInputRef} hidden accept="video/mp4,video/quicktime,video/webm" onChange={handleReferenceFileUpload} />
                <button
                  onClick={() => referenceFileInputRef.current?.click()}
                  disabled={referenceUploading}
                  style={{
                    padding: '0 16px', borderRadius: '10px', border: '1px solid rgba(139,92,246,0.3)',
                    background: referenceUploading ? 'rgba(139,92,246,0.1)' : 'rgba(139,92,246,0.15)',
                    color: '#c4b5fd', fontSize: '12px', fontWeight: 700, cursor: referenceUploading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                  }}
                >
                  {referenceUploading ? 'Uploading...' : '⬆ Upload Video'}
                </button>
              </div>
              {referenceVideoUrl && !referenceUploading && (
                <div style={{ marginBottom: '10px', fontSize: '11px', color: '#34d399' }}>✓ Video ready</div>
              )}

              <div style={{ fontSize: '10px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
                What do you want to change? <span style={{ opacity: 0.6, textTransform: 'none', fontWeight: 400 }}>(describe the edit — background, object, style, etc.)</span>
              </div>
              <div style={{ background: 'rgba(15,10,46,0.8)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '10px' }}>
                <textarea
                  value={referencePrompt}
                  onChange={(e) => setReferencePrompt(e.target.value)}
                  placeholder="e.g. Replace the background with a modern office, keep the person and their motion exactly the same"
                  style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '13px', lineHeight: 1.65, resize: 'none', padding: '11px 12px', minHeight: '90px', fontFamily: 'inherit' }}
                />
              </div>
            </div>
          ) : mode === 'multi' ? (
            <div style={{ padding: '12px 14px 0' }}>
              {/* NEW: Ad Template Library */}
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
                Ad Templates <span style={{ opacity: 0.6, textTransform: 'none', fontWeight: 400 }}>(optional — auto-fill your scenes from a proven ad structure)</span>
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

              {/* NEW: Product/Character Reference Images */}
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
                Product/Character Reference Images <span style={{ opacity: 0.6, textTransform: 'none', fontWeight: 400 }}>(optional — upload up to 3 photos so the AI shows the real thing instead of imagining it. Higher cost + longer generation time when used. Best for physical products/characters — avoid prompts describing readable screen/app content, as AI video models struggle to render on-screen text/UI accurately.)</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                {referenceImages.map((img) => (
                  <div key={img.id} style={{ position: 'relative', width: '64px', height: '64px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(15,10,46,0.6)' }}>
                    {img.uploading ? (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: '#9080cc' }}>...</div>
                    ) : (
                      <>
                        <img src={img.url} alt="reference" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button
                          onClick={() => removeReferenceImage(img.id)}
                          style={{ position: 'absolute', top: '2px', right: '2px', width: '16px', height: '16px', borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '10px', cursor: 'pointer', lineHeight: 1 }}
                        >✕</button>
                      </>
                    )}
                  </div>
                ))}
                {referenceImages.length < 3 && (
                  <>
                    <input type="file" ref={referenceImageInputRef} hidden accept="image/png,image/jpeg,image/webp" multiple onChange={handleReferenceImageUpload} />
                    <button
                      onClick={() => referenceImageInputRef.current?.click()}
                      style={{ width: '64px', height: '64px', borderRadius: '8px', border: '1px dashed rgba(139,92,246,0.4)', background: 'rgba(15,10,46,0.4)', color: '#9080cc', fontSize: '20px', cursor: 'pointer' }}
                    >+</button>
                  </>
                )}
              </div>

              <div style={{ fontSize: '10px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
                Scenes <span style={{ opacity: 0.6, textTransform: 'none', fontWeight: 400 }}>(use [SCENE 1], [SCENE 2]... tags, OR separate scenes with a blank line — each scene is a fixed {audioOn ? '8s' : '10s'} clip)</span>
              </div>
              <div style={{ background: 'rgba(15,10,46,0.8)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '10px' }}>
                <textarea
                  value={sceneScript}
                  onChange={(e) => setSceneScript(e.target.value)}
                  placeholder={'[SCENE 1]\nWoman walks into a bright kitchen, smiling, holding a product\n\n[SCENE 2]\nClose-up of product on the counter, soft morning light\n\n[SCENE 3]\nWoman talks to camera, enthusiastic expression'}
                  style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '13px', lineHeight: 1.65, resize: 'none', padding: '11px 12px', minHeight: '140px', fontFamily: 'inherit' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderTop: '1px solid rgba(139,92,246,0.15)' }}>
                  <span style={{ fontSize: '11px', color: '#9080cc' }}>
                    {parseScenes(sceneScript).length} scenes · ~{parseScenes(sceneScript).length * duration}s total
                  </span>
                </div>
              </div>

              {sceneResults.length > 0 && (
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '200px', overflowY: 'auto' }}>
                  {sceneResults.map((s) => (
                    <div key={s.index} style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '5px 9px', background: 'rgba(15,10,46,0.6)', borderRadius: '6px', fontSize: '11px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          color: s.status === 'done' ? '#34d399' : s.status === 'failed' ? '#f87171' : s.status === 'generating' ? '#c4b5fd' : '#9080cc',
                        }}>
                          {s.status === 'done' ? '✓' : s.status === 'failed' ? '✕' : s.status === 'generating' ? '◐' : '○'}
                        </span>
                        <span style={{ color: '#c8c0ff', flex: 1 }}>Scene {s.index + 1}</span>
                        <span style={{ color: '#9080cc', textTransform: 'capitalize' }}>{s.status}</span>
                        {s.status === 'failed' && !generating && (
                          <button
                            onClick={() => retryScene(s.index)}
                            disabled={retryingIndex !== null}
                            style={{ padding: '3px 10px', borderRadius: '6px', border: '1px solid rgba(139,92,246,0.4)', background: retryingIndex === s.index ? 'rgba(139,92,246,0.1)' : 'rgba(139,92,246,0.25)', color: '#c4b5fd', fontSize: '10px', fontWeight: 700, cursor: retryingIndex !== null ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                          >
                            {retryingIndex === s.index ? 'Retrying...' : '↻ Retry'}
                          </button>
                        )}
                      </div>
                      {s.status === 'failed' && s.error && (
                        <div style={{ color: '#f87171', fontSize: '10px', paddingLeft: '20px' }}>{s.error}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {generating && (
                <button
                  onClick={handleCancel}
                  style={{ marginTop: '8px', width: '100%', padding: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#fca5a5', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Cancel remaining scenes
                </button>
              )}
            </div>
          ) : (
            <div style={{ padding: '12px 14px 0' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Prompt</div>
              <div style={{ background: 'rgba(15,10,46,0.8)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '10px', transition: 'border-color .2s' }}>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe your video... e.g. A cinematic drone shot over a neon-lit city at night, rain falling on wet streets, slow pan with bokeh lights..."
                  style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '13px', lineHeight: 1.65, resize: 'none', padding: '11px 12px', minHeight: '90px', fontFamily: 'inherit' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderTop: '1px solid rgba(139,92,246,0.15)' }}>
                  <span style={{ fontSize: '11px', color: '#9080cc' }}>Text-to-Video is live now</span>
                  <span style={{ fontSize: '11px', color: '#9080cc' }}>{prompt.length} / 500</span>
                </div>
              </div>
            </div>
          )}

          <div style={{ padding: '8px 14px 0' }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px', padding: '10px 14px 0' }}>
            <div style={{ background: 'rgba(15,10,46,0.6)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: '9px', padding: '9px 11px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: '6px' }}>Resolution <span style={{ opacity: 0.6, textTransform: 'none', fontWeight: 400 }}>(720p+ recommended for Multi-Scene)</span></div>
              <div style={{ display: 'flex', gap: '3px' }}>
                {['480p', '720p', '1080p'].map((r) => (
                  <button key={r} onClick={() => setResolution(r)} style={{
                    flex: 1, padding: '5px 3px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, textAlign: 'center', cursor: 'pointer', border: 'none', fontFamily: 'inherit',
                    background: resolution === r ? 'rgba(139,92,246,0.2)' : 'transparent',
                    color: resolution === r ? '#c4b5fd' : '#9080cc',
                    outline: resolution === r ? '1px solid rgba(139,92,246,0.35)' : '1px solid transparent',
                  }}>{r}</button>
                ))}
              </div>
            </div>

            <div style={{ background: 'rgba(15,10,46,0.6)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: '9px', padding: '9px 11px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: '6px' }}>Duration</div>
              <div style={{ display: 'flex', gap: '3px' }}>
                {[5, 10, 15].map((d) => (
                  <button key={d} onClick={() => setDuration(d)} style={{
                    flex: 1, padding: '5px 3px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, textAlign: 'center', cursor: 'pointer', border: 'none', fontFamily: 'inherit',
                    background: duration === d ? 'rgba(139,92,246,0.2)' : 'transparent',
                    color: duration === d ? '#c4b5fd' : '#9080cc',
                    outline: duration === d ? '1px solid rgba(139,92,246,0.35)' : '1px solid transparent',
                  }}>{d}s</button>
                ))}
              </div>
            </div>

            <div style={{ background: 'rgba(15,10,46,0.6)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: '9px', padding: '9px 11px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: '6px' }}>Aspect Ratio</div>
              <div style={{ display: 'flex', gap: '3px' }}>
                {['16:9', '9:16', '1:1'].map((r) => (
                  <button key={r} onClick={() => setRatio(r)} style={{
                    flex: 1, padding: '5px 3px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, textAlign: 'center', cursor: 'pointer', border: 'none', fontFamily: 'inherit',
                    background: ratio === r ? 'rgba(139,92,246,0.2)' : 'transparent',
                    color: ratio === r ? '#c4b5fd' : '#9080cc',
                    outline: ratio === r ? '1px solid rgba(139,92,246,0.35)' : '1px solid transparent',
                  }}>{r}</button>
                ))}
              </div>
            </div>

            <div style={{ background: 'rgba(15,10,46,0.6)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: '9px', padding: '9px 11px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: '6px' }}>Audio / Lip-sync</div>
              <div style={{ display: 'flex', gap: '3px' }}>
                {[{ label: 'Off', val: false }, { label: 'On', val: true }].map((o) => (
                  <button key={o.label} onClick={() => setAudioOn(o.val)} style={{
                    flex: 1, padding: '5px 3px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, textAlign: 'center', cursor: 'pointer', border: 'none', fontFamily: 'inherit',
                    background: audioOn === o.val ? 'rgba(139,92,246,0.2)' : 'transparent',
                    color: audioOn === o.val ? '#c4b5fd' : '#9080cc',
                    outline: audioOn === o.val ? '1px solid rgba(139,92,246,0.35)' : '1px solid transparent',
                  }}>{o.label}</button>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <div style={{ margin: '10px 14px 0', padding: '9px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#fca5a5', fontSize: '12px' }}>
              {error}
            </div>
          )}

          <div style={{ padding: '12px 14px 14px' }}>
            <button
              onClick={handleGenerate}
              disabled={generating || referenceUploading}
              style={{
                display: 'flex', width: '100%', height: '48px', background: generating ? '#5b3fa0' : '#8b5cf6', border: 'none', borderRadius: '11px', color: '#fff', fontSize: '15px', fontWeight: 800, alignItems: 'center', justifyContent: 'center', gap: '7px', cursor: generating ? 'not-allowed' : 'pointer', textDecoration: 'none', boxShadow: '0 0 28px rgba(139,92,246,0.4)', fontFamily: 'inherit',
              }}>
              {generating ? (
                <>
                  <span style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                  {statusText || 'Generating...'}
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                  Generate Video
                </>
              )}
            </button>
            <p style={{ textAlign: 'center', fontSize: '11px', color: '#9080cc', marginTop: '8px' }}>
              Generation usually takes 1-3 minutes
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          <div style={{ background: 'rgba(26,18,69,0.8)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: '16px', overflow: 'hidden' }}>
            <div style={{ height: '1px', background: 'linear-gradient(90deg,transparent,#22d3ee,transparent)' }} />
            <div style={{ padding: '11px 14px', fontSize: '10px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid rgba(139,92,246,0.15)' }}>
              Preview
            </div>

            {videoUrl ? (
              <div style={{ padding: '12px' }}>
                <video src={videoUrl} controls autoPlay loop style={{ width: '100%', borderRadius: '10px', background: '#000' }} />
                <a href={videoUrl} download target="_blank" rel="noopener noreferrer" style={{
                  display: 'block', textAlign: 'center', marginTop: '10px', padding: '10px', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '9px', color: '#c4b5fd', fontSize: '12px', fontWeight: 700, textDecoration: 'none',
                }}>⬇ Download Video</a>
              </div>
            ) : videoParts ? (
              <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ fontSize: '11px', color: '#9080cc' }}>Your video was generated in 2 parts. Download both parts below:</p>
                {videoParts.map((url, i) => (
                  <div key={i}>
                    <video src={url} controls style={{ width: '100%', borderRadius: '10px', background: '#000' }} />
                    <a href={url} download target="_blank" rel="noopener noreferrer" style={{
                      display: 'block', textAlign: 'center', marginTop: '6px', padding: '8px', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '9px', color: '#c4b5fd', fontSize: '11px', fontWeight: 700, textDecoration: 'none',
                    }}>⬇ Download Part {i === 0 ? 'A' : 'B'}</a>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ height: '220px', background: 'linear-gradient(145deg,#07051a,#120d35)', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(139,92,246,0.1)', margin: '12px', borderRadius: '10px' }}>
                {generating && (
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg,transparent,rgba(139,92,246,0.8),rgba(244,114,182,0.5),transparent)', animation: 'scan 3s linear infinite' }} />
                )}
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="1.5">
                    <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
                  </svg>
                </div>
                <div style={{ position: 'absolute', bottom: '10px', width: '80%', textAlign: 'center', fontSize: '12px', color: '#9080cc' }}>
                  {generating ? (statusText || 'Generating...') : 'Write a prompt and click Generate'}
                </div>
                <div style={{ position: 'absolute', top: '8px', left: '8px', width: '12px', height: '12px', borderTop: '1.5px solid rgba(139,92,246,0.5)', borderLeft: '1.5px solid rgba(139,92,246,0.5)' }} />
                <div style={{ position: 'absolute', top: '8px', right: '8px', width: '12px', height: '12px', borderTop: '1.5px solid rgba(139,92,246,0.5)', borderRight: '1.5px solid rgba(139,92,246,0.5)' }} />
                <div style={{ position: 'absolute', bottom: '8px', left: '8px', width: '12px', height: '12px', borderBottom: '1.5px solid rgba(139,92,246,0.5)', borderLeft: '1.5px solid rgba(139,92,246,0.5)' }} />
                <div style={{ position: 'absolute', bottom: '8px', right: '8px', width: '12px', height: '12px', borderBottom: '1.5px solid rgba(139,92,246,0.5)', borderRight: '1.5px solid rgba(139,92,246,0.5)' }} />
              </div>
            )}

            <div style={{ padding: '0 12px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ background: 'rgba(15,10,46,0.6)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: '9px', padding: '10px' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#c4b5fd' }}>{videosGenerated}</div>
                <div style={{ fontSize: '10px', color: '#9080cc' }}>Videos generated</div>
              </div>
              <div style={{ background: 'rgba(15,10,46,0.6)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: '9px', padding: '10px' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#34d399' }}>∞</div>
                <div style={{ fontSize: '10px', color: '#9080cc' }}>Free while in beta</div>
              </div>
            </div>
          </div>

          <div style={{ background: 'rgba(26,18,69,0.8)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ padding: '11px 14px', fontSize: '12px', fontWeight: 700, color: '#fff', borderBottom: '1px solid rgba(139,92,246,0.15)' }}>Cost guide (approx.)</div>
            {[
              { label: '480p · 5 sec, no audio', sub: 'Draft', credits: '~$0.20' },
              { label: '720p · 10 sec, no audio', sub: 'Most popular ⭐', credits: '~$0.80', hot: true },
              { label: '720p · 8 sec, audio on', sub: 'Lip-sync', credits: '~$1.20' },
            ].map((item) => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderBottom: '1px solid rgba(139,92,246,0.1)', background: item.hot ? 'rgba(139,92,246,0.07)' : 'transparent' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>{item.label}</div>
                  <div style={{ fontSize: '10px', color: item.hot ? '#c4b5fd' : '#9080cc' }}>{item.sub}</div>
                </div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#c4b5fd' }}>{item.credits}</div>
              </div>
            ))}
          </div>

          <div style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.1),rgba(244,114,182,0.07))', border: '1px solid rgba(139,92,246,0.25)', borderRadius: '14px', padding: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#fff', marginBottom: '10px' }}>Why Vidro?</div>
            {[
              { icon: '🎬', text: 'Seedance quality at 75% less cost' },
              { icon: '🎙️', text: 'Native audio + lip-sync (Veo 3.1)' },
              { icon: '✂️', text: 'Auto stitching for Multi-Scene — live now' },
              { icon: '⚡', text: 'Ready in minutes, download instantly' },
            ].map((item) => (
              <div key={item.text} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px', fontSize: '12px', color: '#c8c0ff' }}>
                <span>{item.icon}</span>
                {item.text}
              </div>
            ))}
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
