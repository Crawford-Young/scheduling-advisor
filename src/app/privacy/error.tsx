'use client'

import { RouteErrorFallback } from '@/lib/ui'

export default function PrivacyError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <RouteErrorFallback error={error} reset={reset} title="Failed to load privacy" />
}
