'use client'
import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/lib/ui'

const ALL_VALUE = 'all'
const SEARCH_DEBOUNCE_MS = 300

/**
 * Option values mirror the server filter values read in `reflections/page.tsx`
 * (`type`) and the `ConversationType` union (`'check_in' | 'general'`). Keep
 * them centralised here so the two sides can't drift apart.
 */
const TYPE_OPTIONS = [
  { value: 'check_in', label: 'Check-in' },
  { value: 'general', label: 'General' },
] as const

/**
 * URL-driven filter controls for the Reflections surface. Each change rebuilds
 * the query string from the current params (preserving the others) and replaces
 * `?type=&q=`, which the server component reads to filter. Search text is
 * buffered locally for instant typing and the URL update is debounced; filter
 * changes use `router.replace` so they never pile up history.
 */
export function ConversationFilters(): React.JSX.Element {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const type = searchParams.get('type') ?? ALL_VALUE

  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function replaceParam(key: string, value: string | null): void {
    const params = new URLSearchParams(searchParams.toString())
    if (value === null || value === '' || value === ALL_VALUE) {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname)
  }

  function handleSearchChange(value: string): void {
    setSearch(value)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => replaceParam('q', value), SEARCH_DEBOUNCE_MS)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        aria-label="Search conversations"
        placeholder="Search conversations..."
        value={search}
        onChange={(e) => handleSearchChange(e.target.value)}
        className="min-w-[12rem] flex-1"
      />

      <Select value={type} onValueChange={(value) => replaceParam('type', value)}>
        <SelectTrigger aria-label="Filter by type" className="w-[9rem]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All types</SelectItem>
          {TYPE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
