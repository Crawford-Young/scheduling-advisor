'use client'

import { RouteErrorFallback } from '@/lib/ui'

export default function ChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <RouteErrorFallback error={error} reset={reset} title="Failed to load chat" />
}
