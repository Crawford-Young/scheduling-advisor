'use client'
import * as React from 'react'

interface SplashContextValue {
  readonly splashActive: boolean
  readonly showSplash: () => void
  readonly endSplash: () => void
}

const SplashContext = React.createContext<SplashContextValue | null>(null)

export function SplashProvider({
  children,
}: {
  readonly children: React.ReactNode
}): React.JSX.Element {
  const [splashActive, setSplashActive] = React.useState(false)
  const showSplash = React.useCallback(() => setSplashActive(true), [])
  const endSplash = React.useCallback(() => setSplashActive(false), [])
  const value = React.useMemo(
    () => ({ splashActive, showSplash, endSplash }),
    [splashActive, showSplash, endSplash],
  )
  return <SplashContext.Provider value={value}>{children}</SplashContext.Provider>
}

export function useSplash(): SplashContextValue {
  const ctx = React.useContext(SplashContext)
  if (ctx === null) throw new Error('useSplash must be used within SplashProvider')
  return ctx
}
