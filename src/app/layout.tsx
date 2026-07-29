import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { SplashAnimationClient } from '@/components/splash/splash-animation-client'
import { SplashProvider } from '@/components/splash/splash-provider'
import { SITE_URL } from '@/lib/site-routes'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  // Pinned to the constant, not env.NEXT_PUBLIC_APP_URL: a canonical origin is
  // a published fact about the host, not a per-env knob. The carsickyak host
  // shipped og:url = http://localhost:3000 to production from exactly that
  // wiring, invisible to every gate because the value is correct locally.
  metadataBase: new URL(SITE_URL),
  title: 'Cybond',
  description: 'Bond to what matters.',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}): Promise<React.JSX.Element> {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <SplashProvider>
            <SplashAnimationClient />
            {children}
          </SplashProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
