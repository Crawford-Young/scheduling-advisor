import * as React from 'react'
import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage, Card, CardContent } from '@/lib/ui'
import type { UserSearchResult } from '@/server/queries/profile'

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

interface PersonCardProps {
  readonly result: UserSearchResult
}

/** Search-result card linking to a person's public profile at `/u/<username>`. */
export function PersonCard({ result }: PersonCardProps): React.JSX.Element {
  const displayName = result.name ?? `@${result.username}`
  const initials = computeInitials(result.name, result.username)

  return (
    <Link href={`/u/${result.username}`} className="block transition-opacity hover:opacity-80">
      <Card>
        <CardContent className="flex items-center gap-4 py-4">
          <Avatar>
            {result.image !== null && <AvatarImage src={result.image} alt={displayName} />}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-foreground font-semibold">{displayName}</p>
            <p className="text-muted-foreground text-sm">@{result.username}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
