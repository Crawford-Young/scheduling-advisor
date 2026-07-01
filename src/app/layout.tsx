import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { auth } from '@/auth'
import { db } from '@/db'
import { checkIns } from '@/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { SplashAnimationClient } from '@/components/splash/splash-animation-client'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Cybond',
  description: 'Bond to what matters.',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}): Promise<React.JSX.Element> {
  const session = await auth()

  let checkInDone = true
  if (session?.user?.id) {
    const [pending] = await db
      .select()
      .from(checkIns)
      .where(and(eq(checkIns.userId, session.user.id), isNull(checkIns.completedAt)))
      .limit(1)
    checkInDone = !pending
  }

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <SplashAnimationClient checkInDone={checkInDone} />
          {children}
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
