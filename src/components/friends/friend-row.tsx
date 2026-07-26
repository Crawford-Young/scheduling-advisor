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

/**
 * Shared presentational row for the /friends page — avatar, display name,
 * `@username` link (only when a username exists), and an action slot on the
 * right for callers to render accept/decline/cancel/remove buttons.
 */
export function FriendRow({ user, children }: FriendRowProps): React.JSX.Element {
  const initials = computeInitials(user.name, user.username)
  const displayName = user.name ?? user.username ?? FALLBACK_NAME

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Avatar>
          {user.image !== null && <AvatarImage src={user.image} alt={displayName} />}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-foreground text-sm font-medium">{displayName}</p>
          {user.username !== null && (
            <Link
              href={`/u/${user.username}`}
              className="text-muted-foreground text-sm hover:underline"
            >
              @{user.username}
            </Link>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}
