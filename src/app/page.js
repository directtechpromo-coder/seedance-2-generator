'use client'
import { useState } from 'react'

export default function Home() {
  const [prompt, setPrompt] = useState('')
  const [mode, setMode] = useState('text')
  const [resolution, setResolution] = useState('720p')
  const [duration, setDuration] = useState('5s')
  const [ratio, setRatio] = useState('16:9')
  const [voice, setVoice] = useState('none')

  return (
    <main style={{ background: '#0f0a2e', minHeight: '100vh', padding: '24px 20px' }}>

      {/* PAGE TITLE */}
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#fff', letterSpacing: '-1px', marginBottom: '6px' }}>
          Vidro <span style={{ background: 'linear-gradient(135deg,#a78bfa,#f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>AI Studio</span>
        </h1>
        <p style={{ fontSize: '14px', color: '#9080cc' }}>
          Generate cinematic videos with voice — no editing skills required
        </p>
      </div>

      {/* MAIN GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: '18px', maxWidth: '1100px', margin: '0 auto', alignItems: 'start' }}>

        {/* LEFT — GENERATOR */}
        <div style={{ background: 'rgba(26,18,69,0.8)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: '16px', overflow: 'hidden', position: 'relative' }}>
          <div style={{ height: '2px', background: 'linear-gradient(90deg,transparent,#8b5cf6,#f472b6,transparent)' }} />

          {/* MODE TABS */}
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
              }}>{tab.label}</button>
            ))}
          </div>

          {/* PROMPT */}
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
                <button style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#c4b5fd', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: '6px', padding: '4px 9px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  ✨ Enhance prompt
                </button>
                <span style={{ fontSize: '11px', color: '#9080cc' }}>{prompt.length} / 500</span>
              </div>
            </div>
          </div>

          {/* NEGATIVE PROMPT */}
          <div style={{ padding: '8px 14px 0' }}>
            <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '8px', padding: '8px 11px', display: 'flex', alignItems: 'center', gap: '7px' }}>
              <span style={{ fontSize: '13px', color: 'rgba(239,68,68,0.6)' }}>⊘</span>
              <input placeholder="Negative prompt: blurry, distorted, watermark..." style={{ background: 'transparent', border: 'none', outline: 'none', color: '#9080cc', fontSize: '12px', flex: 1, fontFamily: 'inherit' }} />
            </div>
          </div>

          {/* SETTINGS */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px', padding: '10px 14px 0' }}>
            {/* Resolution */}
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

            {/* Duration */}
            <div style={{ background: 'rgba(15,10,46,0.6)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: '9px', padding: '9px 11px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: '6px' }}>Duration</div>
              <div style={{ display: 'flex', gap: '3px' }}>
                {['5s', '10s', '15s'].map((d) => (
                  <button key={d} onClick={() => setDuration(d)} style={{
                    flex: 1, padding: '5px 3px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, textAlign: 'center', cursor: 'pointer', border: 'none', fontFamily: 'inherit',
                    background: duration === d ? 'rgba(139,92,246,0.2)' : 'transparent',
                    color: duration === d ? '#c4b5fd' : '#9080cc',
                    outline: duration === d ? '1px solid rgba(139,92,246,0.35)' : '1px solid transparent',
                  }}>{d}</button>
                ))}
              </div>
            </div>

            {/* Aspect Ratio */}
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

            {/* Voice */}
            <div style={{ background: 'rgba(15,10,46,0.6)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: '9px', padding: '9px 11px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: '6px' }}>Voice</div>
              <div style={{ display: 'flex', gap: '3px' }}>
                {['None', 'Adam', 'Aria'].map((v) => (
                  <button key={v} onClick={() => setVoice(v.toLowerCase())} style={{
                    flex: 1, padding: '5px 3px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, textAlign: 'center', cursor: 'pointer', border: 'none', fontFamily: 'inherit',
                    background: voice === v.toLowerCase() ? 'rgba(139,92,246,0.2)' : 'transparent',
                    color: voice === v.toLowerCase() ? '#c4b5fd' : '#9080cc',
                    outline: voice === v.toLowerCase() ? '1px solid rgba(139,92,246,0.35)' : '1px solid transparent',
                  }}>{v}</button>
                ))}
              </div>
            </div>
          </div>

          {/* GENERATE BUTTON */}
          <div style={{ padding: '12px 14px 14px' }}>
            <a href="/api/auth/signin" style={{
              display: 'flex', width: '100%', height: '48px', background: '#8b5cf6', border: 'none', borderRadius: '11px', color: '#fff', fontSize: '15px', fontWeight: 800, alignItems: 'center', justifyContent: 'center', gap: '7px', cursor: 'pointer', textDecoration: 'none', boxShadow: '0 0 28px rgba(139,92,246,0.4)',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              Sign in to Generate
              <span style={{ fontSize: '12px', fontWeight: 500, opacity: .75 }}>· 8 credits</span>
            </a>
            <p style={{ textAlign: 'center', fontSize: '11px', color: '#9080cc', marginTop: '8px' }}>
              10 free credits on signup — no card required
            </p>
          </div>
        </div>

        {/* RIGHT — PREVIEW + INFO */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* VIDEO PREVIEW */}
          <div style={{ background: 'rgba(26,18,69,0.8)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: '16px', overflow: 'hidden' }}>
            <div style={{ height: '1px', background: 'linear-gradient(90deg,transparent,#22d3ee,transparent)' }} />
            <div style={{ padding: '11px 14px', fontSize: '10px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid rgba(139,92,246,0.15)' }}>
              Preview
            </div>
            <div style={{ height: '220px', background: 'linear-gradient(145deg,#07051a,#120d35)', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(139,92,246,0.1)', margin: '12px', borderRadius: '10px' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg,transparent,rgba(139,92,246,0.8),rgba(244,114,182,0.5),transparent)', animation: 'scan 3s linear infinite' }} />
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="1.5">
                  <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
                </svg>
              </div>
              <div style={{ position: 'absolute', bottom: '10px', width: '80%', textAlign: 'center', fontSize: '12px', color: '#9080cc' }}>
                Sign in to generate your first video
              </div>
              {/* Corner decorations */}
              <div style={{ position: 'absolute', top: '8px', left: '8px', width: '12px', height: '12px', borderTop: '1.5px solid rgba(139,92,246,0.5)', borderLeft: '1.5px solid rgba(139,92,246,0.5)' }} />
              <div style={{ position: 'absolute', top: '8px', right: '8px', width: '12px', height: '12px', borderTop: '1.5px solid rgba(139,92,246,0.5)', borderRight: '1.5px solid rgba(139,92,246,0.5)' }} />
              <div style={{ position: 'absolute', bottom: '8px', left: '8px', width: '12px', height: '12px', borderBottom: '1.5px solid rgba(139,92,246,0.5)', borderLeft: '1.5px solid rgba(139,92,246,0.5)' }} />
              <div style={{ position: 'absolute', bottom: '8px', right: '8px', width: '12px', height: '12px', borderBottom: '1.5px solid rgba(139,92,246,0.5)', borderRight: '1.5px solid rgba(139,92,246,0.5)' }} />
            </div>
            <div style={{ padding: '0 12px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ background: 'rgba(15,10,46,0.6)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: '9px', padding: '10px' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#c4b5fd' }}>0</div>
                <div style={{ fontSize: '10px', color: '#9080cc' }}>Videos generated</div>
              </div>
              <div style={{ background: 'rgba(15,10,46,0.6)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: '9px', padding: '10px' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#34d399' }}>10</div>
                <div style={{ fontSize: '10px', color: '#9080cc' }}>Free credits</div>
              </div>
            </div>
          </div>

          {/* CREDIT GUIDE */}
          <div style={{ background: 'rgba(26,18,69,0.8)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ padding: '11px 14px', fontSize: '12px', fontWeight: 700, color: '#fff', borderBottom: '1px solid rgba(139,92,246,0.15)' }}>Credit guide</div>
            {[
              { label: '480p · 5 sec', sub: 'Draft', credits: '3 cr' },
              { label: '720p · 10 sec', sub: 'Most popular ⭐', credits: '8 cr', hot: true },
              { label: '1080p · 10 sec', sub: 'Premium', credits: '15 cr' },
              { label: '+ Voice narration', sub: 'Any video', credits: 'Free', green: true },
            ].map((item) => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderBottom: '1px solid rgba(139,92,246,0.1)', background: item.hot ? 'rgba(139,92,246,0.07)' : 'transparent' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>{item.label}</div>
                  <div style={{ fontSize: '10px', color: item.hot ? '#c4b5fd' : '#9080cc' }}>{item.sub}</div>
                </div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: item.green ? '#34d399' : '#c4b5fd' }}>{item.credits}</div>
              </div>
            ))}
          </div>

          {/* WHY VIDRO */}
          <div style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.1),rgba(244,114,182,0.07))', border: '1px solid rgba(139,92,246,0.25)', borderRadius: '14px', padding: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#fff', marginBottom: '10px' }}>Why Vidro?</div>
            {[
              { icon: '🎬', text: 'Seedance quality at 75% less cost' },
              { icon: '🎙️', text: 'Built-in voice — no ElevenLabs needed' },
              { icon: '✂️', text: 'Auto stitching — no CapCut needed' },
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
      `}</style>
    </main>
  )
}
