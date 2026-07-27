import * as React from 'react'
import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '@/lib/ui'

const INITIALS_WORD_COUNT = 2
const USERNAME_INITIALS_LENGTH = 2
const FALLBACK_INITIALS = '?'
const FALLBACK_NAME = 'Unknown user'

export interface FriendRowUser {
  readonly userId: string
  readonly username: string | null
  readonly name: string | null
  readonly image: string | null
}

interface FriendRowProps {
  readonly user: FriendRowUser
  readonly children?: React.ReactNode
}

/** First letters of the first `INITIALS_WORD_COUNT` words in `name`, uppercased. */
function initialsFromName(name: string): string {
  const words = name.trim().split(/\s+/)
  return words
    .slice(0, INITIALS_WORD_COUNT)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase()
}

function computeInitials(name: string | null, username: string | null): string {
  if (name !== null) return initialsFromName(name)
  if (username !== null) return username.slice(0, USERNAME_INITIALS_LENGTH).toUpperCase()
  return FALLBACK_INITIALS
}

/** Display name shared by every /friends row and list — name, else @username, else the fallback. */
export function friendDisplayName(user: FriendRowUser): string {
  return user.name ?? user.username ?? FALLBACK_NAME
}

/**
 * Shared presentational row for the /friends page — avatar, display name,
 * `@username` text (not a link — the whole row is a stretched overlay link
 * to the same href when a username exists, so a second nested link would be
 * a duplicate-link a11y smell), and an action slot on the right, above the
 * overlay, for callers to render accept/decline/cancel/⋯-menu affordances.
 */
export function FriendRow({ user, children }: FriendRowProps): React.JSX.Element {
  const initials = computeInitials(user.name, user.username)
  const displayName = friendDisplayName(user)

  return (
    <div className="hover:bg-muted/50 relative flex items-center justify-between gap-4 rounded-md px-2 py-3 transition-colors">
      <div className="flex items-center gap-3">
        <Avatar>
          {user.image !== null && <AvatarImage src={user.image} alt={displayName} />}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-foreground text-sm font-medium">{displayName}</p>
          {user.username !== null && (
            <p className="text-muted-foreground text-sm">@{user.username}</p>
          )}
        </div>
      </div>
      {user.username !== null && (
        <Link
          href={`/u/${user.username}`}
          className="focus-visible:ring-ring absolute inset-0 rounded-md focus-visible:ring-2 focus-visible:outline-none"
        >
          <span className="sr-only">View {displayName}&apos;s profile</span>
        </Link>
      )}
      <div className="relative z-10">{children}</div>
    </div>
  )
}
