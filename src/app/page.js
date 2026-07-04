'use client'

export default function Home() {
  return (
    <main style={{ background: '#0f0a2e', minHeight: '100vh' }}>

      {/* HERO */}
      <section style={{ textAlign: 'center', padding: '72px 24px 52px', maxWidth: '860px', margin: '0 auto', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '700px', height: '500px', background: 'radial-gradient(ellipse,rgba(139,92,246,0.2) 0%,transparent 65%)', pointerEvents: 'none' }} />

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.4)', borderRadius: '20px', padding: '6px 16px 6px 10px', fontSize: '12px', fontWeight: 700, color: '#c4b5fd', marginBottom: '24px', position: 'relative' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#8b5cf6' }} />
          Now with native voice generation
        </div>

        <h1 style={{ fontSize: '54px', fontWeight: 900, letterSpacing: '-2px', lineHeight: 1.05, marginBottom: '18px', color: '#fff', position: 'relative' }}>
          Create cinematic
          <br />
          videos with AI
        </h1>

        <p style={{ fontSize: '17px', color: '#c8c0ff', lineHeight: 1.7, maxWidth: '540px', margin: '0 auto 32px', position: 'relative' }}>
          Vidro replaces Seedance, ElevenLabs, and CapCut — one tool that generates, narrates, and stitches your videos. For a fraction of the cost.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '16px', position: 'relative' }}>
          <a href="/api/auth/signin" style={{ padding: '15px 30px', fontSize: '15px', fontWeight: 800, color: '#fff', borderRadius: '12px', background: '#8b5cf6', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
            Start creating free
          </a>
          <a href="#how" style={{ padding: '15px 26px', fontSize: '15px', fontWeight: 700, color: '#c8c0ff', borderRadius: '12px', border: '1px solid rgba(139,92,246,0.4)', background: 'rgba(139,92,246,0.1)', textDecoration: 'none' }}>
            Watch demo
          </a>
        </div>

        <p style={{ fontSize: '12px', color: '#9080cc', position: 'relative' }}>
          10 free credits — no credit card required
        </p>
      </section>

      {/* PROBLEM */}
      <section style={{ padding: '64px 32px', maxWidth: '860px', margin: '0 auto', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.35)', borderRadius: '14px', padding: '5px 14px', fontSize: '11px', fontWeight: 700, color: '#fca5a5', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: '16px' }}>
          The problem
        </div>
        <h2 style={{ fontSize: '34px', fontWeight: 900, letterSpacing: '-1px', color: '#fff', marginBottom: '12px' }}>
          Too many tools. Too much cost.
        </h2>
        <p style={{ fontSize: '15px', color: '#c8c0ff', lineHeight: 1.7, maxWidth: '520px', margin: '0 auto 32px' }}>
          You need 3 separate subscriptions just to make one AI video. Costs add up every single month.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', maxWidth: '660px', margin: '0 auto' }}>
          <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '14px', padding: '22px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#fca5a5', textTransform: 'uppercase', marginBottom: '8px' }}>Seedance / Veo</div>
            <div style={{ fontSize: '32px', fontWeight: 900, color: '#f87171', marginBottom: '4px' }}>$44+</div>
            <div style={{ fontSize: '11px', color: '#c8c0ff' }}>Video generation</div>
          </div>
          <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '14px', padding: '22px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#fca5a5', textTransform: 'uppercase', marginBottom: '8px' }}>ElevenLabs</div>
            <div style={{ fontSize: '32px', fontWeight: 900, color: '#f87171', marginBottom: '4px' }}>$22</div>
            <div style={{ fontSize: '11px', color: '#c8c0ff' }}>Voice narration</div>
          </div>
          <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '14px', padding: '22px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#fca5a5', textTransform: 'uppercase', marginBottom: '8px' }}>CapCut Pro</div>
            <div style={{ fontSize: '32px', fontWeight: 900, color: '#f87171', marginBottom: '4px' }}>$10</div>
            <div style={{ fontSize: '11px', color: '#c8c0ff' }}>Video stitching</div>
          </div>
        </div>

        <div style={{ marginTop: '20px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '12px', padding: '18px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '660px', margin: '20px auto 0' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#c8c0ff' }}>You are paying every month</span>
          <span style={{ fontSize: '18px', color: '#9080cc' }}>to</span>
          <span style={{ fontSize: '28px', fontWeight: 900, color: '#f87171' }}>$76+/mo</span>
        </div>
      </section>

      {/* SOLUTION */}
      <section style={{ padding: '16px 32px 64px', maxWidth: '860px', margin: '0 auto', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.35)', borderRadius: '14px', padding: '5px 14px', fontSize: '11px', fontWeight: 700, color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: '16px' }}>
          The solution
        </div>
        <h2 style={{ fontSize: '34px', fontWeight: 900, letterSpacing: '-1px', color: '#fff', marginBottom: '12px' }}>
          One tool. Everything included.
        </h2>
        <p style={{ fontSize: '15px', color: '#c8c0ff', lineHeight: 1.7, maxWidth: '500px', margin: '0 auto 32px' }}>
          Vidro replaces all three. Generate videos, add voice narration, and stitch scenes in one place.
        </p>
        <div style={{ background: 'linear-gradient(135deg,rgba(52,211,153,0.1),rgba(139,92,246,0.08))', border: '1px solid rgba(52,211,153,0.3)', borderRadius: '16px', padding: '26px 36px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '560px', margin: '0 auto' }}>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: '6px' }}>Vidro Basic</div>
            <div style={{ fontSize: '40px', fontWeight: 900, color: '#34d399', lineHeight: 1 }}>$19/mo</div>
            <div style={{ fontSize: '13px', color: '#9080cc', marginTop: '4px' }}>Video + Voice + Stitching included</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '13px', color: '#c8c0ff', marginBottom: '8px' }}>Save $57/month vs 3 tools</div>
            <div style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.35)', borderRadius: '8px', padding: '5px 14px', fontSize: '13px', fontWeight: 800, color: '#34d399', display: 'inline-block' }}>75% cheaper</div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" style={{ padding: '64px 32px', maxWidth: '820px', margin: '0 auto', textAlign: 'center', borderTop: '1px solid rgba(139,92,246,0.15)' }}>
        <div style={{ display: 'inline-flex', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.35)', borderRadius: '14px', padding: '5px 14px', fontSize: '11px', fontWeight: 700, color: '#c4b5fd', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: '14px' }}>
          How it works
        </div>
        <h2 style={{ fontSize: '34px', fontWeight: 900, letterSpacing: '-1px', color: '#fff', marginBottom: '10px' }}>3 steps to your video</h2>
        <p style={{ fontSize: '14px', color: '#c8c0ff', marginBottom: '44px' }}>No learning curve. No timeline editing. Just describe and generate.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px' }}>
          <div style={{ padding: '0 16px' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 900, color: '#fff', margin: '0 auto 16px' }}>1</div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>Write your prompt</div>
            <div style={{ fontSize: '13px', color: '#c8c0ff', lineHeight: 1.6 }}>Describe your video in plain text. Pick voice, quality, and duration.</div>
          </div>
          <div style={{ padding: '0 16px' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 900, color: '#fff', margin: '0 auto 16px' }}>2</div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>Vidro generates</div>
            <div style={{ fontSize: '13px', color: '#c8c0ff', lineHeight: 1.6 }}>AI creates your video with narration and stitches all scenes automatically.</div>
          </div>
          <div style={{ padding: '0 16px' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 900, color: '#fff', margin: '0 auto 16px' }}>3</div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>Download and publish</div>
            <div style={{ fontSize: '13px', color: '#c8c0ff', lineHeight: 1.6 }}>Your finished video is ready in minutes. Download and post anywhere.</div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{ padding: '64px 32px', borderTop: '1px solid rgba(139,92,246,0.18)' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.35)', borderRadius: '14px', padding: '5px 14px', fontSize: '11px', fontWeight: 700, color: '#c4b5fd', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: '14px' }}>
            Pricing
          </div>
          <h2 style={{ fontSize: '34px', fontWeight: 900, letterSpacing: '-1px', color: '#fff', marginBottom: '10px' }}>Start free, scale as you grow</h2>
          <p style={{ fontSize: '14px', color: '#c8c0ff', marginBottom: '32px' }}>No contracts. Cancel anytime. Credits never expire.</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '11px' }}>
            <div style={{ background: 'rgba(26,18,69,0.9)', border: '1px solid rgba(139,92,246,0.18)', borderRadius: '14px', padding: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Free</div>
              <div style={{ fontSize: '30px', fontWeight: 900, color: '#fff', marginBottom: '2px' }}>$0</div>
              <div style={{ fontSize: '11px', color: '#9080cc', marginBottom: '10px' }}>/month</div>
              <div style={{ fontSize: '12px', color: '#c4b5fd', fontWeight: 700, marginBottom: '16px' }}>3 videos/month</div>
              <a href="/api/auth/signin" style={{ display: 'block', padding: '9px 0', borderRadius: '9px', fontSize: '12px', fontWeight: 700, textAlign: 'center', textDecoration: 'none', background: 'rgba(139,92,246,0.12)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.3)' }}>Get started</a>
            </div>
            <div style={{ background: 'rgba(26,18,69,0.9)', border: '1px solid rgba(139,92,246,0.18)', borderRadius: '14px', padding: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Basic</div>
              <div style={{ fontSize: '30px', fontWeight: 900, color: '#fff', marginBottom: '2px' }}>$19</div>
              <div style={{ fontSize: '11px', color: '#9080cc', marginBottom: '10px' }}>/month</div>
              <div style={{ fontSize: '12px', color: '#c4b5fd', fontWeight: 700, marginBottom: '16px' }}>20 videos/month</div>
              <a href="/api/auth/signin" style={{ display: 'block', padding: '9px 0', borderRadius: '9px', fontSize: '12px', fontWeight: 700, textAlign: 'center', textDecoration: 'none', background: 'rgba(139,92,246,0.12)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.3)' }}>Start Basic</a>
            </div>
            <div style={{ background: 'linear-gradient(145deg,rgba(139,92,246,0.18),rgba(15,10,46,0.8))', border: '2px solid rgba(139,92,246,0.6)', borderRadius: '14px', padding: '20px', position: 'relative' }}>
              <div style={{ position: 'absolute', top: '-11px', left: '50%', transform: 'translateX(-50%)', background: '#8b5cf6', color: '#fff', fontSize: '9px', fontWeight: 800, padding: '3px 11px', borderRadius: '8px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Most popular</div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Pro</div>
              <div style={{ fontSize: '30px', fontWeight: 900, color: '#fff', marginBottom: '2px' }}>$49</div>
              <div style={{ fontSize: '11px', color: '#9080cc', marginBottom: '10px' }}>/month</div>
              <div style={{ fontSize: '12px', color: '#c4b5fd', fontWeight: 700, marginBottom: '16px' }}>37 videos/month</div>
              <a href="/api/auth/signin" style={{ display: 'block', padding: '9px 0', borderRadius: '9px', fontSize: '12px', fontWeight: 700, textAlign: 'center', textDecoration: 'none', background: '#8b5cf6', color: '#fff' }}>Start Pro</a>
            </div>
            <div style={{ background: 'rgba(26,18,69,0.9)', border: '1px solid rgba(139,92,246,0.18)', borderRadius: '14px', padding: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#9080cc', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Agency</div>
              <div style={{ fontSize: '30px', fontWeight: 900, color: '#fff', marginBottom: '2px' }}>$149</div>
              <div style={{ fontSize: '11px', color: '#9080cc', marginBottom: '10px' }}>/month</div>
              <div style={{ fontSize: '12px', color: '#c4b5fd', fontWeight: 700, marginBottom: '16px' }}>150 videos/month</div>
              <a href="/api/auth/signin" style={{ display: 'block', padding: '9px 0', borderRadius: '9px', fontSize: '12px', fontWeight: 700, textAlign: 'center', textDecoration: 'none', background: 'rgba(139,92,246,0.12)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.3)' }}>Contact us</a>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ padding: '80px 32px', textAlign: 'center' }}>
        <h2 style={{ fontSize: '42px', fontWeight: 900, letterSpacing: '-1.5px', color: '#fff', marginBottom: '14px', lineHeight: 1.1 }}>
          Start creating videos in minutes
        </h2>
        <p style={{ fontSize: '16px', color: '#c8c0ff', maxWidth: '440px', margin: '0 auto 32px', lineHeight: 1.65 }}>
          Join thousands of creators already using Vidro. 10 free credits, no card required.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '14px' }}>
          <a href="/api/auth/signin" style={{ padding: '15px 30px', fontSize: '15px', fontWeight: 800, color: '#fff', borderRadius: '12px', background: '#8b5cf6', textDecoration: 'none' }}>
            Get started free
          </a>
          <a href="#pricing" style={{ padding: '15px 26px', fontSize: '15px', fontWeight: 700, color: '#c8c0ff', borderRadius: '12px', border: '1px solid rgba(139,92,246,0.4)', background: 'rgba(139,92,246,0.1)', textDecoration: 'none' }}>
            See pricing
          </a>
        </div>
        <p style={{ fontSize: '12px', color: '#9080cc' }}>
          Free forever plan available. No credit card. Cancel anytime.
        </p>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: '28px 32px', borderTop: '1px solid rgba(139,92,246,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '26px', height: '26px', borderRadius: '7px', background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M6 5L18 12L6 19V5Z" fill="white"/>
            </svg>
          </div>
          <span style={{ fontSize: '15px', fontWeight: 900, color: '#fff' }}>
            Vid<span style={{ color: '#a78bfa' }}>ro</span>
          </span>
        </div>
        <div style={{ display: 'flex', gap: '20px' }}>
          <a href="#" style={{ fontSize: '12px', color: '#9080cc', textDecoration: 'none' }}>Features</a>
          <a href="#" style={{ fontSize: '12px', color: '#9080cc', textDecoration: 'none' }}>Pricing</a>
          <a href="#" style={{ fontSize: '12px', color: '#9080cc', textDecoration: 'none' }}>Privacy</a>
          <a href="#" style={{ fontSize: '12px', color: '#9080cc', textDecoration: 'none' }}>Terms</a>
          <a href="#" style={{ fontSize: '12px', color: '#9080cc', textDecoration: 'none' }}>Contact</a>
        </div>
        <span style={{ fontSize: '12px', color: '#9080cc' }}>2026 Vidro. All rights reserved.</span>
      </footer>

    </main>
  )
}
