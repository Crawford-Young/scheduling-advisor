'use client'
import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Input } from '@/lib/ui'

const SEARCH_DEBOUNCE_MS = 300

/**
 * Title-search control for the Activities surface. Typing buffers locally for
 * instant feedback; the `?q=` URL update is debounced and preserves any other
 * query params. The server component reads `?q=` to filter activities. The old
 * type/status/recurring filters died with the task/goal/series model.
 */
export function ActivityFilters(): React.JSX.Element {
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
    router.replace(query ? `${pathname}?${query}` : pathname)
  }

  function handleSearchChange(value: string): void {
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
      aria-label="Search activities"
      placeholder="Search activities…"
      value={search}
      onChange={(e) => handleSearchChange(e.target.value)}
      className="min-w-[12rem] flex-1"
    />
  )
}
