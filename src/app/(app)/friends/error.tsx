'use client'

import { RouteErrorFallback } from '@/lib/ui'

export default function FriendsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <RouteErrorFallback error={error} reset={reset} title="Failed to load friends" />
}
