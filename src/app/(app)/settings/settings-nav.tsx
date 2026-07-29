'use client'

import * as React from 'react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Button } from '@/lib/ui'

interface SettingsSection {
  readonly id: string
  readonly label: string
}

export const SETTINGS_SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'integrations', label: 'Integrations' },
] as const satisfies readonly SettingsSection[]

const SPY_ROOT_MARGIN = '0px 0px -60% 0px'
const BOTTOM_EPSILON_PX = 2
const LAST_SECTION_ID = SETTINGS_SECTIONS.at(-1)?.id ?? SETTINGS_SECTIONS[0].id

function subscribeToHash(onStoreChange: () => void): () => void {
  window.addEventListener('hashchange', onStoreChange)
  return () => window.removeEventListener('hashchange', onStoreChange)
}

function getHashSnapshot(): string {
  return window.location.hash.slice(1)
}

function getServerHashSnapshot(): string {
  return ''
}

export function SettingsNav(): React.JSX.Element {
  const navRef = useRef<HTMLElement>(null)
  const visibleRef = useRef(new Map<string, boolean>())
  const hash = useSyncExternalStore(subscribeToHash, getHashSnapshot, getServerHashSnapshot)
  const [spyId, setSpyId] = useState<string | null>(null)

  const hashId = SETTINGS_SECTIONS.find((section) => section.id === hash)?.id ?? null
  const activeId = spyId ?? hashId ?? SETTINGS_SECTIONS[0].id

  useEffect(() => {
    const clearSpy = (): void => setSpyId(null)
    window.addEventListener('hashchange', clearSpy)
    return () => window.removeEventListener('hashchange', clearSpy)
  }, [])

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const elements = SETTINGS_SECTIONS.map((section) => document.getElementById(section.id)).filter(
      (element): element is HTMLElement => element !== null,
    )
    if (elements.length === 0) return
    const visible = visibleRef.current
    const root = navRef.current?.closest('main') ?? null

    function resolveActive(): void {
      // The last section sits above the spy band once the container bottoms
      // out, so it could never win on intersection alone. At max scroll it is
      // the current section by definition — this is what lets the spacer below
      // it stay small instead of a full viewport tall.
      // The scrollable guard is load-bearing: an unlaid-out container reports
      // every metric as 0, and 0 + 0 >= 0 would read as "at the bottom".
      const scrollable = root !== null && root.scrollHeight > root.clientHeight
      if (
        scrollable &&
        root.scrollTop + root.clientHeight >= root.scrollHeight - BOTTOM_EPSILON_PX
      ) {
        setSpyId(LAST_SECTION_ID)
        return
      }
      // Deepest visible section wins, not the first: a tall section still
      // spans the spy band while the next one's top has already entered it,
      // so first-in-document-order would stick to the section above.
      const current = SETTINGS_SECTIONS.filter((section) => visible.get(section.id) === true).at(-1)
      if (current) setSpyId(current.id)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting)
        resolveActive()
      },
      { root, rootMargin: SPY_ROOT_MARGIN },
    )
    for (const element of elements) observer.observe(element)
    root?.addEventListener('scroll', resolveActive, { passive: true })
    return () => {
      observer.disconnect()
      root?.removeEventListener('scroll', resolveActive)
    }
  }, [])

  return (
    <nav
      ref={navRef}
      aria-label="Settings sections"
      className="bg-background/95 border-border sticky top-0 z-10 -mt-6 flex gap-2 border-b pt-6 pb-3 backdrop-blur"
    >
      {SETTINGS_SECTIONS.map((section) => (
        <Button
          key={section.id}
          asChild
          size="sm"
          variant={activeId === section.id ? 'secondary' : 'ghost'}
        >
          <a href={`#${section.id}`} aria-current={activeId === section.id ? 'true' : undefined}>
            {section.label}
          </a>
        </Button>
      ))}
    </nav>
  )
}
