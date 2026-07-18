'use client'
import * as React from 'react'
import { useSplash } from '@/components/splash/splash-provider'

/** Sidebar wordmark — morph target for the splash handoff. The
    view-transition-name may exist only once the splash is gone (two mounted
    elements sharing a name make the browser skip the transition). */
export function BrandMark(): React.JSX.Element {
  const { splashActive } = useSplash()
  return (
    <span
      className="text-foreground text-sm font-bold"
      style={splashActive ? undefined : { viewTransitionName: 'brand-wordmark' }}
    >
      Cybond
    </span>
  )
}
