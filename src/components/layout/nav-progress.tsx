'use client'
import * as React from 'react'
import { useLinkStatus } from 'next/link'
import { ProgressLine } from '@/lib/ui'

/** Delay before a pending navigation surfaces feedback — motion.md §3 (>150ms). */
const NAV_PENDING_DELAY_MS = 150

const NavPendingContext = React.createContext<((delta: number) => void) | null>(null)

export function NavProgressProvider({
  children,
}: {
  readonly children: React.ReactNode
}): React.JSX.Element {
  const [pendingCount, setPendingCount] = React.useState(0)
  const report = React.useCallback((delta: number) => {
    setPendingCount((count) => count + delta)
  }, [])
  return (
    <NavPendingContext.Provider value={report}>
      <ProgressLine
        active={pendingCount > 0}
        className="fixed inset-x-0 top-0 z-50"
        label="Navigating"
      />
      {children}
    </NavPendingContext.Provider>
  )
}

/** Renders nothing; must sit inside a next/link Link. Reports pending
    navigation into NavProgressProvider once the 150ms threshold passes. */
export function LinkPendingReporter(): null {
  const { pending } = useLinkStatus()
  const report = React.useContext(NavPendingContext)
  React.useEffect(() => {
    if (!pending || report === null) return undefined
    let fired = false
    const timer = setTimeout(() => {
      fired = true
      report(1)
    }, NAV_PENDING_DELAY_MS)
    return () => {
      clearTimeout(timer)
      if (fired) report(-1)
    }
  }, [pending, report])
  return null
}
