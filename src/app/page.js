'use client'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function Home() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/generate')
    }
  }, [status, router])

  if (status === 'loading') return null
  if (status === 'authenticated') return null

  return (
    <main style={{ background: '#0f0a2e', minHeight: '100vh' }}>

      {/* HERO */}
      <section style={{ textAlign: 'center', padding: '72px 24px 52px', maxWidth: '860px', margin: '0 auto', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '700px', height: '500px', background: 'radial-gradient(ellipse,rgba(139,92,246,0.2) 0%,transparent 65%)', pointerEvents: 'none' }} />

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.4)', borderRadius: '20px', padding: '6px 16px 6px 10px', fontSize: '12px', fontWeight: 700, color: '#c4b5fd', marginBottom: '24px', position: 'relative' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#8b5cf6', boxShadow: '0 0 8px #8b5cf6' }} />
          Now with native voice generation
        </div>

        <h1 style={{ fontSize: '54px', fontWeight: 900, letterSpacing: '-2px', lineHeight: 1.05, marginBottom: '18px', color: '#fff', position: 'relative' }}>
          Create cinematic<br />videos with{' '}
          <span style={{ background: 'linear-gradient(135deg,#c4b5fd,#f472b6,#22d3ee)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            AI
          </span>
        </h1>

        <p style={{ fontSize: '17px', color: '#c8c0ff', lineHeight: 1.7, maxWidth: '540px', margin: '0 auto 32px', position: 'relative' }}>
          Vidro replaces <strong style={{ color: '#fff' }}>Seedance</strong>,{' '}
          <strong style={{ color: '#fff'
