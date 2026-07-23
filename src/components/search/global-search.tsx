'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Kbd,
} from '@/lib/ui'
import { globalSearch, searchUsersGlobal } from '@/server/actions/search'
import { filterPages, PAGE_INDEX } from '@/lib/search-pages'
import {
  SEARCH_QUERY_MIN_LENGTH,
  type ActivitySearchResult,
  type EventSearchResult,
} from '@/lib/schemas/search'
import type { UserSearchResult } from '@/server/queries/profile'
import { weekParamFromDate } from '@/lib/calendar-week-param'

const SEARCH_DEBOUNCE_MS = 300
// The two parallel server lookups per query (globalSearch + searchUsersGlobal);
// each decrements pendingCount by 1 in its .finally.
const SEARCH_ACTION_COUNT = 2

interface GlobalSearchProps {
  readonly username: string | null
}

export function GlobalSearch({ username }: GlobalSearchProps): React.JSX.Element {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [eventResults, setEventResults] = React.useState<readonly EventSearchResult[] | null>(null)
  const [activityResults, setActivityResults] = React.useState<
    readonly ActivitySearchResult[] | null
  >(null)
  const [userResults, setUserResults] = React.useState<readonly UserSearchResult[] | null>(null)
  const [pendingCount, setPendingCount] = React.useState(0)
  const requestIdRef = React.useRef(0)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const openRef = React.useRef(open)

  const clearResults = React.useCallback((): void => {
    setEventResults(null)
    setActivityResults(null)
    setUserResults(null)
  }, [])

  function closeSearch(): void {
    setOpen(false)
  }

  React.useEffect(() => {
    openRef.current = open
  }, [open])

  // Ctrl/Cmd+K toggles: focuses the input when closed, closes + blurs when open.
  // Reads `openRef` (kept in sync above) rather than `open` directly so this
  // effect never needs `open` in its deps and only registers the listener once.
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        if (openRef.current) {
          inputRef.current?.blur()
          closeSearch()
        } else {
          setOpen(true)
          inputRef.current?.focus()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Outside pointerdown closes the dropdown — only wired while open.
  React.useEffect(() => {
    if (!open) return undefined
    function onPointerDown(e: PointerEvent): void {
      if (
        containerRef.current &&
        e.target instanceof Node &&
        !containerRef.current.contains(e.target)
      ) {
        closeSearch()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  // Reset-on-close lives here (keyed on `open` itself) rather than only inside
  // an open-change handler, so EVERY close path — Escape, outside click, item
  // selection, and the global keyboard toggle above — resets query, results,
  // and the request id (stale-cache-on-reopen rule).
  React.useEffect(() => {
    if (!open) {
      requestIdRef.current += 1
      // Resetting query/results on close is a prop(open)->state sync, not a value
      // derivable during render — the stale-cache-on-reopen rule requires it fire
      // regardless of which path closed it.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery('')
      clearResults()
    }
  }, [open, clearResults])

  React.useEffect(() => {
    const trimmed = query.trim()
    if (!open || trimmed.length < SEARCH_QUERY_MIN_LENGTH) {
      // Clearing stale results when the query drops below the search threshold
      // is a prop(query)->state sync, not derivable during render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      clearResults()
      return undefined
    }
    const timer = setTimeout(() => {
      const requestId = ++requestIdRef.current
      setPendingCount((count) => count + SEARCH_ACTION_COUNT)
      void globalSearch({ query: trimmed })
        .then((result) => {
          if (requestIdRef.current !== requestId || !('data' in result)) return
          setEventResults(result.data.events)
          setActivityResults(result.data.activities)
        })
        .finally(() => setPendingCount((count) => count - 1))
      void searchUsersGlobal({ query: trimmed })
        .then((result) => {
          if (requestIdRef.current !== requestId || !('data' in result)) return
          setUserResults(result.data)
        })
        .finally(() => setPendingCount((count) => count - 1))
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [open, query, clearResults])

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      closeSearch()
      inputRef.current?.blur()
    }
  }

  function navigate(route: string): void {
    closeSearch()
    // With experimental viewTransition on, a raw router.push from inside a
    // cmdk select event aborts the View Transition ("InvalidStateError:
    // Transition was aborted because of invalid state") and the navigation is
    // dropped entirely — <Link> navs work because Next wraps them in a React
    // transition internally. Wrapping the push does the same for this
    // programmatic nav. (Live-QA-only failure: unit tests mock the router.)
    React.startTransition(() => router.push(route))
  }

  const pages = filterPages(query, [
    ...PAGE_INDEX,
    ...(username === null
      ? []
      : [{ label: 'My profile', route: `/u/${username}`, keywords: ['profile', 'me', 'account'] }]),
  ])

  return (
    <div ref={containerRef} className="relative w-full max-w-md min-w-0">
      <Command
        shouldFilter={false}
        label="Global search"
        className="[&_[cmdk-group-heading]]:text-muted-foreground h-auto w-full flex-col overflow-visible bg-transparent [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]]:border-b-0 [&_[cmdk-input]]:h-9 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4"
      >
        {/* Styled to match the library Input (rounded border border-input bg-background)
            so the field reads as a real input in the bar; the lib CommandInput wrapper's
            own border-b is stripped above — inline it looked like a second topbar line. */}
        <div className="border-input bg-background focus-within:ring-ring relative rounded border focus-within:ring-1">
          <CommandInput
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            onFocus={() => setOpen(true)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search events, activities, people…"
            aria-label="Global search"
            className="pr-12"
          />
          <Kbd className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2">
            ⌘K
          </Kbd>
        </div>
        {open ? (
          <div className="border-border bg-surface absolute top-full right-0 left-0 z-50 mt-2 overflow-hidden rounded-md border shadow-lg">
            <CommandList>
              <CommandEmpty>{pendingCount > 0 ? 'Searching…' : 'No results found.'}</CommandEmpty>
              {pages.length > 0 ? (
                <CommandGroup heading="Pages">
                  {pages.map((page) => (
                    <CommandItem
                      key={page.route}
                      value={`page:${page.route}`}
                      onSelect={() => navigate(page.route)}
                    >
                      {page.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {eventResults !== null && eventResults.length > 0 ? (
                <CommandGroup heading="Events">
                  {eventResults.map((event) => (
                    <CommandItem
                      key={event.id}
                      value={`event:${event.id}`}
                      onSelect={() =>
                        navigate(
                          event.startAt
                            ? `/calendar?week=${weekParamFromDate(event.startAt)}`
                            : '/calendar',
                        )
                      }
                    >
                      <span>{event.title}</span>
                      <span className="text-muted-foreground ml-auto text-xs">
                        {event.startAt
                          ? event.startAt.toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })
                          : null}
                        {event.location ? ` · ${event.location}` : null}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {activityResults !== null && activityResults.length > 0 ? (
                <CommandGroup heading="Activities">
                  {activityResults.map((activity) => (
                    <CommandItem
                      key={activity.id}
                      value={`activity:${activity.id}`}
                      onSelect={() =>
                        navigate(`/activities?q=${encodeURIComponent(activity.title)}`)
                      }
                    >
                      {activity.title}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {userResults !== null && userResults.length > 0 ? (
                <CommandGroup heading="People">
                  {userResults.map((user) => (
                    <CommandItem
                      key={user.username}
                      value={`user:${user.username}`}
                      onSelect={() => navigate(`/u/${user.username}`)}
                    >
                      <span>{user.name ?? user.username}</span>
                      <span className="text-muted-foreground ml-auto text-xs">
                        @{user.username}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </CommandList>
          </div>
        ) : null}
      </Command>
    </div>
  )
}
