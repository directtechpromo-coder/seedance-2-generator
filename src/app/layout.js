import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/Providers'
import { Navbar } from '@/components/saas/Navbar'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Vidro — AI Video Studio',
  description: 'Create cinematic AI videos with voice narration.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className} style={{ background: '#0f0a2e', margin: 0 }}>
        <Providers>
          <Navbar />
          {children}
        </Providers>
      </body>
    </html>
  )
}
