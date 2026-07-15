import * as React from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/lib/ui'
import type { ProfileIdentity } from '@/server/queries/profile'

const INITIALS_WORD_COUNT = 2
const USERNAME_INITIALS_LENGTH = 2

/** First letters of the first `INITIALS_WORD_COUNT` words in `name`, uppercased. */
function initialsFromName(name: string): string {
  const words = name.trim().split(/\s+/)
  return words
    .slice(0, INITIALS_WORD_COUNT)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase()
}

function computeInitials(name: string | null, username: string): string {
  if (name === null) return username.slice(0, USERNAME_INITIALS_LENGTH).toUpperCase()
  return initialsFromName(name)
}

function formatMemberSince(createdAt: Date): string {
  const label = createdAt.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return `Member since ${label}`
}

interface ProfileHeaderProps {
  readonly identity: ProfileIdentity
}

export function ProfileHeader({ identity }: ProfileHeaderProps): React.JSX.Element {
  const initials = computeInitials(identity.name, identity.username)
  const displayName = identity.name ?? `@${identity.username}`

  return (
    <div className="flex items-start gap-4">
      <Avatar size="lg">
        {identity.image !== null && <AvatarImage src={identity.image} alt={displayName} />}
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="space-y-1">
        <h1 className="text-foreground text-2xl font-semibold">{displayName}</h1>
        <p className="text-muted-foreground text-sm">@{identity.username}</p>
        {identity.bio !== null && (
          <p className="text-sm" data-testid="profile-bio">
            {identity.bio}
          </p>
        )}
        <p className="text-muted-foreground text-sm">{formatMemberSince(identity.createdAt)}</p>
      </div>
    </div>
  )
}
