'use client'
import * as React from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
} from '@/lib/ui'
import { FriendRow } from './friend-row'
import { FRIEND_ACTION_ERROR_MESSAGE, useFriendRequestAction } from './use-friend-action'
import { searchUsersGlobal } from '@/server/actions/search'
import { sendFriendRequest } from '@/server/actions/friends'
import { SEARCH_QUERY_MIN_LENGTH } from '@/lib/schemas/search'
import type { FriendshipView } from '@/lib/friendship-view'
import type { UserSearchResult } from '@/server/queries/profile'

export const SEARCH_DEBOUNCE_MS = 300
export const SEARCH_PLACEHOLDER = 'Search by name or @username'

const RELATION_STATUS_LABEL: Record<Exclude<FriendshipView, 'none'>, string> = {
  friends: 'Friends',
  outgoing: 'Requested',
  incoming: 'Sent you a request',
}

interface AddFriendDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly relations: ReadonlyMap<string, FriendshipView>
}

interface ResultRowProps {
  readonly user: UserSearchResult
  readonly relation: FriendshipView
  readonly onSent: (userId: string) => void
}

function ResultRow({ user, relation, onSent }: ResultRowProps): React.JSX.Element {
  const { isPending, hasError, run } = useFriendRequestAction()

  function handleAdd(): void {
    run(async () => {
      const result = await sendFriendRequest({ addresseeId: user.id })
      if ('data' in result) onSent(user.id)
      return result
    })
  }

  return (
    <FriendRow
      user={{ userId: user.id, username: user.username, name: user.name, image: user.image }}
    >
      <div className="flex flex-col items-end gap-1">
        {relation === 'none' ? (
          <Button type="button" size="sm" onClick={handleAdd} disabled={isPending}>
            Add
          </Button>
        ) : (
          <span className="text-muted-foreground text-sm">{RELATION_STATUS_LABEL[relation]}</span>
        )}
        {hasError && <p className="text-destructive text-sm">{FRIEND_ACTION_ERROR_MESSAGE}</p>}
      </div>
    </FriendRow>
  )
}

export function AddFriendDialog({
  open,
  onOpenChange,
  relations,
}: AddFriendDialogProps): React.JSX.Element {
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<readonly UserSearchResult[] | null>(null)
  const [isSearching, setIsSearching] = React.useState(false)
  const [sentIds, setSentIds] = React.useState<ReadonlySet<string>>(new Set())
  const requestIdRef = React.useRef(0)

  const trimmed = query.trim()
  // Below the minimum the stored results are simply not rendered (see the
  // `isActive` gates below) — clearing them in the effect body would be a
  // `react-hooks/set-state-in-effect` lint error, the repo's known trap.
  const isActive = trimmed.length >= SEARCH_QUERY_MIN_LENGTH

  React.useEffect(() => {
    if (!isActive) return
    const timer = setTimeout(() => {
      const requestId = ++requestIdRef.current
      setIsSearching(true)
      void searchUsersGlobal({ query: trimmed, excludeSelf: true }).then((result) => {
        if (requestIdRef.current !== requestId) return
        setIsSearching(false)
        setResults('data' in result ? result.data : [])
      })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [isActive, trimmed])

  function relationFor(userId: string): FriendshipView {
    if (sentIds.has(userId)) return 'outgoing'
    return relations.get(userId) ?? 'none'
  }

  function handleSent(userId: string): void {
    setSentIds((prev) => new Set(prev).add(userId))
  }

  const visibleResults = isActive && results !== null ? results : []
  const showEmpty = isActive && results !== null && !isSearching && visibleResults.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add friend</DialogTitle>
          <DialogDescription>Search for people by name or @username.</DialogDescription>
        </DialogHeader>
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={SEARCH_PLACEHOLDER}
          aria-label="Search people"
        />
        <div className="min-h-24 space-y-1">
          {isSearching && <p className="text-muted-foreground text-sm">Searching…</p>}
          {showEmpty && <EmptyState message="No people found." />}
          {!isSearching &&
            visibleResults.map((user) => (
              <ResultRow
                key={user.id}
                user={user}
                relation={relationFor(user.id)}
                onSent={handleSent}
              />
            ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
