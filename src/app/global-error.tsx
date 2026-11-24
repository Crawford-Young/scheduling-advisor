'use client'

import '@/app/globals.css'
import { RouteErrorFallback } from '@/lib/ui'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en" className="dark">
      <body className="flex min-h-screen items-center justify-center">
        <RouteErrorFallback error={error} reset={reset} />
      </body>
    </html>
  )
}
