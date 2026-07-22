'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
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

interface GlobalSearchProps {
  readonly username: string
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

  const clearResults = React.useCallback((): void => {
    setEventResults(null)
    setActivityResults(null)
    setUserResults(null)
  }, [])

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Reset-on-close lives here (keyed on `open` itself) rather than only inside
  // handleOpenChange, so the global keyboard toggle above — which flips `open`
  // directly and does not go through handleOpenChange — still resets query,
  // results, and the request id on every close (stale-cache-on-reopen rule).
  React.useEffect(() => {
    if (!open) {
      requestIdRef.current += 1
      // Resetting query/results on close is a prop(open)->state sync, not a value
      // derivable during render — the stale-cache-on-reopen rule requires it fire
      // regardless of which path (Dialog onOpenChange or the global shortcut) closed it.
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
      setPendingCount((count) => count + 2)
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

  function handleOpenChange(next: boolean): void {
    setOpen(next)
  }

  function navigate(route: string): void {
    handleOpenChange(false)
    router.push(route)
  }

  const pages = filterPages(query, [
    ...PAGE_INDEX,
    { label: 'My profile', route: `/u/${username}`, keywords: ['profile', 'me', 'account'] },
  ])

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-muted-foreground gap-2"
        onClick={() => setOpen(true)}
      >
        Search…
        <kbd className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">⌘K</kbd>
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="overflow-hidden p-0 shadow-lg">
          <DialogTitle className="sr-only">Global search</DialogTitle>
          <DialogDescription className="sr-only">
            Search events, activities, people, and pages.
          </DialogDescription>
          <Command
            shouldFilter={false}
            label="Global search"
            className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
          >
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Search events, activities, people…"
            />
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
          </Command>
        </DialogContent>
      </Dialog>
    </>
  )
}
