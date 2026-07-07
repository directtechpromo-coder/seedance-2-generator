'use client'
import { useState, useRef } from 'react'

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
  const [multiProgress, setMultiProgress] = useState([])
  const [stitching, setStitching] = useState(false)
  const cancelRef = useRef(false)

  const pollTimer = useRef(null)

  // NEW: smart scene parser. If the script uses [SCENE 1], [SCENE 2]... markers,
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
            reject(new Error('Generation failed'))
          } else if (attempts > 100) {
            clearInterval(pollTimer.current)
            reject(new Error('Timed out waiting for video'))
          }
        } catch (e) {
          if (attempts > 100) {
            clearInterval(pollTimer.current)
            reject(e)
          }
        }
      }, 3000)
    })

  // UPDATED: now accepts { seed, previousVideoUrl } so scenes can chain visually,
  // and returns { urls, seed } so the caller can capture the seed for the next scene.
  const generateOneClip = async (promptText, chainOptions = {}) => {
    const { seed, previousVideoUrl } = chainOptions

    const res = await fetch('/api/seedance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'text-to-video',
        prompt: promptText,
        negative_prompt: negativePrompt || undefined,
        aspect_ratio: ratio,
        resolution,
        duration,
        generate_audio: audioOn,
        seed,
        previous_video_url: previousVideoUrl,
      }),
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
      setError('Prompt likho pehle.')
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

  const handleGenerateMultiScene = async () => {
    const scenes = parseScenes(sceneScript)

    if (scenes.length === 0) {
      setError('Kam se kam ek scene likho (har line ek scene hai).')
      return
    }

    setError('')
    setVideoUrl(null)
    setVideoParts(null)
    setGenerating(true)
    setStitching(false)
    cancelRef.current = false
    setMultiProgress(scenes.map((_, i) => ({ index: i, status: 'pending' })))

    const allUrls = []
    let sharedSeed = undefined // NEW: captured from scene 1, reused for every later scene
    let previousVideoUrl = undefined // NEW: last scene's resolved video URL, chains visual continuity

    try {
      for (let i = 0; i < scenes.length; i++) {
        if (cancelRef.current) {
          setStatusText('Cancelled.')
          break
        }
        setStatusText(`Scene ${i + 1}/${scenes.length}: generating...`)
        setMultiProgress((prev) => prev.map((p) => (p.index === i ? { ...p, status: 'generating' } : p)))

        const finalScenePrompt = characterBible.trim()
          ? `${characterBible.trim()}. ${scenes[i]}`
          : scenes[i]

        try {
          // NEW: pass sharedSeed + previousVideoUrl so this scene continues from
          // where the last one ended, instead of being an unrelated generation.
          const { urls, seed } = await generateOneClip(finalScenePrompt, {
            seed: sharedSeed,
            previousVideoUrl,
          })
          if (sharedSeed === undefined) sharedSeed = seed // lock in the seed from scene 1
          previousVideoUrl = urls[urls.length - 1] // chain from this scene's last clip

          allUrls.push(...urls)
          setMultiProgress((prev) => prev.map((p) => (p.index === i ? { ...p, status: 'done' } : p)))
        } catch (e) {
          setMultiProgress((prev) => prev.map((p) => (p.index === i ? { ...p, status: 'failed' } : p)))
          throw new Error(`Scene ${i + 1} fail ho gayi: ${e.message}`)
        }
      }

      if (allUrls.length === 0) {
        throw new Error('Koi clip generate nahi hui.')
      }

      if (allUrls.length === 1) {
        setVideoUrl(allUrls[0])
      } else {
        setStitching(true)
        const finalUrl = await stitchClips(allUrls)
        setStitching(false)
        setVideoUrl(finalUrl)
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

  const handleCancel = () => {
    cancelRef.current = true
  }

  const handleGenerate = () => {
    if (mode === 'multi') {
      handleGenerateMultiScene()
    } else if (mode === 'text') {
      handleGenerateSingle()
    } else {
      setError('Yeh mode abhi build ho raha hai — Text to Video ya Multi-Scene use karo filhaal.')
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
              { id: 'image', label: 'Image to Video' },
              { id: 'multi', label: 'Multi-Scene' },
            ].map((tab) => (
              <button key={tab.id} onClick={() => setMode(tab.id)} style={{
                padding: '7px 14px', fontSize: '12px', fontWeight: 600, borderRadius: '8px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: mode === tab.id ? 'rgba(139,92,246,0.2)' : 'transparent',
                color: mode === tab.id ? '#c4b5fd' : '#9080cc',
                outline: mode === tab.id ? '1px solid rgba(139,92,246,0.4)' : 'none',
              }}>{tab.label}{tab.id === 'image' ? ' (soon)' : ''}</button>
            ))}
          </div>

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

          {mode === 'multi' ? (
            <div style={{ padding: '12px 14px 0' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
                Scenes <span style={{ opacity: 0.6, textTransform: 'none', fontWeight: 400 }}>(use [SCENE 1], [SCENE 2]... tags, OR separate scenes with a blank line — each becomes one clip, chained for continuity)</span>
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

              {multiProgress.length > 0 && (
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '140px', overflowY: 'auto' }}>
                  {multiProgress.map((p) => (
                    <div key={p.index} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 9px', background: 'rgba(15,10,46,0.6)', borderRadius: '6px', fontSize: '11px' }}>
                      <span style={{
                        color: p.status === 'done' ? '#34d399' : p.status === 'failed' ? '#f87171' : p.status === 'generating' ? '#c4b5fd' : '#9080cc',
                      }}>
                        {p.status === 'done' ? '✓' : p.status === 'failed' ? '✕' : p.status === 'generating' ? '◐' : '○'}
                      </span>
                      <span style={{ color: '#c8c0ff', flex: 1 }}>Scene {p.index + 1}</span>
                      <span style={{ color: '#9080cc', textTransform: 'capitalize' }}>{p.status}</span>
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
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: '6px' }}>Resolution</div>
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
              disabled={generating}
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
              Generation mein 1-3 minute lag sakte hain
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
                <p style={{ fontSize: '11px', color: '#9080cc' }}>Video 2 parts mein bani hai (auto-split). Dono parts download kar lo:</p>
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
                  {generating ? (statusText || 'Generating...') : 'Prompt likho aur Generate dabao'}
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
