import { Inter } from 'next/font/google'
import './globals.css'
import SessionProvider from '@/components/SessionProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Vidro — AI Video Studio',
  description: 'Create cinematic AI videos with voice narration.',
}

export default async function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className} style={{ background: '#0f0a2e', margin: 0 }}>
        <SessionProvider session={null}>
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
            <a href="/" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              textDecoration: 'none',
              flex: 1,
            }}>
              <div style={{
                width: '34px',
                height: '34px',
                borderRadius: '9px',
                background: '#8b5cf6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                  <path d="M6 5L18 12L6 19V5Z" fill="white"/>
                  <path d="M15 12L20 9V15L15 12Z" fill="rgba(255,255,255,0.5)"/>
                </svg>
              </div>
              <span style={{ fontSize: '20px', fontWeight: 900, color: '#fff', letterSpacing: '-.5px' }}>
                Vid<span style={{ color: '#a78bfa' }}>ro</span>
              </span>
            </a>

            <div style={{ display: 'flex', gap: '4px', marginRight: '16px' }}>
              <a href="/generate" style={{
                padding: '7px 14px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#c8c0ff',
                borderRadius: '8px',
                textDecoration: 'none',
              }}>Generation</a>
              <a href="/gallery" style={{
                padding: '7px 14px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#c8c0ff',
                borderRadius: '8px',
                textDecoration: 'none',
              }}>Gallery</a>
              <a href="#pricing" style={{
                padding: '7px 14px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#c8c0ff',
                borderRadius: '8px',
                textDecoration: 'none',
              }}>Pricing</a>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <a href="/api/auth/signin" style={{
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#c8c0ff',
                borderRadius: '9px',
                border: '1px solid rgba(139,92,246,0.3)',
                background: 'transparent',
                textDecoration: 'none',
              }}>Log in</a>
              <a href="/api/auth/signin" style={{
                padding: '8px 20px',
                fontSize: '13px',
                fontWeight: 800,
                color: '#fff',
                borderRadius: '9px',
                textDecoration: 'none',
                background: '#8b5cf6',
                boxShadow: '0 0 20px rgba(139,92,246,0.4)',
              }}>Start free</a>
            </div>
          </nav>
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}
