'use client'

import * as Sentry from '@sentry/nextjs'
import { RouteErrorFallback } from '@/lib/ui'
import { useEffect } from 'react'

export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return <RouteErrorFallback error={error} reset={reset} title="Failed to load profile" />
}
