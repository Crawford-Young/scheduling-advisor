'use client'
import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Input } from '@/lib/ui'

const SEARCH_DEBOUNCE_MS = 300

/**
 * Buffered, debounced people-search input for the Feed surface. Syncs its
 * value to `?q=` via `router.replace` (preserving other params, no scroll
 * jump) — `feed/page.tsx` reads `q` server-side and runs the actual search.
 */
export function PeopleSearchInput(): React.JSX.Element {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function replaceQuery(value: string): void {
    const params = new URLSearchParams(searchParams.toString())
    if (value === '') {
      params.delete('q')
    } else {
      params.set('q', value)
    }
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  function handleChange(value: string): void {
    setSearch(value)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => replaceQuery(value), SEARCH_DEBOUNCE_MS)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <Input
      aria-label="Search people"
      placeholder="Search people…"
      value={search}
      onChange={(e) => handleChange(e.target.value)}
      className="min-w-[12rem] flex-1"
    />
  )
}
