'use client'

import '@/app/globals.css'
import * as Sentry from '@sentry/nextjs'
import { RouteErrorFallback } from '@/lib/ui'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en" className="dark">
      <body className="flex min-h-screen items-center justify-center">
        <RouteErrorFallback error={error} reset={reset} />
      </body>
    </html>
  )
}
