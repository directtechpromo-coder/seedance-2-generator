import { Inter } from 'next/font/google'
import './globals.css'
import { getServerSession } from 'next-auth'
import { authOptions } from './api/auth/[...nextauth]/route'
import SessionProvider from '@/components/SessionProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Vidro — AI Video Studio',
  description: 'Create cinematic AI videos with voice narration. Replaces Seedance, ElevenLabs, and CapCut at a fraction of the cost.',
}

export default async function RootLayout({ children }) {
  const session = await getServerSession(authOptions)

  return (
    <html lang="en">
      <body className={inter.className} style={{ background: '#0f0a2e', margin: 0 }}>
        <SessionProvider session={session}>
          <VidroNavbar session={session} />
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}

function VidroNavbar({ session }) {
  return (
    <nav style={{
      height: '60px',
      background: 'rgba(15,10,46,0.97)',
      borderBottom: '1px solid rgba(139,92,246,0.25)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 28px',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>

      {/* Logo */}
      <a href="/" style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        textDecoration: 'none', flex: 1,
      }}>
        <div style={{
          width: '34px', height: '34px', borderRadius: '9px',
          background: 'linear-gradient(135deg,#8b5cf6,#f472b6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M6 5L18 12L6 19V5Z" fill="white"/>
            <path d="M15 12L20 9V15L15 12Z" fill="rgba(255,255,255,0.5)"/>
          </svg>
        </div>
        <span style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '-.5px', color: '#fff' }}>
          Vid
          <span style={{
            background: 'linear-gradient(135deg,#a78bfa,#f472b6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>ro</span>
        </span>
      </a>

      {/* Nav Links */}
      <div style={{ display: 'flex', gap: '4px', marginRight: '16px' }}>
        {[
          { label: 'Generation', href: '/generate' },
          { label: 'Gallery', href: '/gallery' },
          { label: 'Pricing', href: '/pricing' },
        ].map((link) => (
          <a key={link.label} href={link.href} style={{
            padding: '7px 14px', fontSize: '13px', fontWeight: 600,
            color: '#c8c0ff', borderRadius: '8px', textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}>
            {link.label}
          </a>
        ))}
      </div>

      {/* Right Side */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
        {session ? (
          <>
            <span style={{ fontSize: '12px', color: '#c4b5fd', fontWeight: 700,
              background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)',
              padding: '5px 10px', borderRadius: '20px',
            }}>
              {session.user?.credits ?? 0} credits
            </span>
            <a href="/api/auth/signout" style={{
              padding: '8px 16px', fontSize: '13px', fontWeight: 600,
              color: '#c8c0ff', borderRadius: '9px',
              border: '1px solid rgba(139,92,246,0.3)', background: 'transparent',
              textDecoration: 'none',
            }}>Sign out</a>
          </>
        ) : (
          <>
            <a href="/api/auth/signin" style={{
              padding: '8px 16px', fontSize: '13px', fontWeight: 600,
              color: '#c8c0ff', borderRadius: '9px',
              border: '1px solid rgba(139,92,246,0.3)', background: 'transparent',
              textDecoration: 'none',
            }}>Log in</a>
            <a href="/api/auth/signin" style={{
              padding: '8px 20px', fontSize: '13px', fontWeight: 800,
              color: '#fff', borderRadius: '9px', textDecoration: 'none',
              background: 'linear-gradient(135deg,#8b5
