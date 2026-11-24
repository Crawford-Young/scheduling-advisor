'use client'

import { RouteErrorFallback } from '@/lib/ui'

export default function AppShellError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <RouteErrorFallback error={error} reset={reset} title="Failed to load this page" />
}
