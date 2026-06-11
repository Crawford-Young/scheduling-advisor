import * as React from 'react'
import { Card, CardHeader, CardContent } from '@/lib/ui'

const RATING_SCALE = 5

export interface CompletedReflectionCardProps {
  readonly scheduledAt: Date
  readonly rating: number | null
  readonly reflectionText: string | null
}

export function CompletedReflectionCard({
  scheduledAt,
  rating,
  reflectionText,
}: CompletedReflectionCardProps): React.JSX.Element {
  const formattedDate = scheduledAt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })

  return (
    <Card>
      <CardHeader>
        <span className="font-medium">{formattedDate}</span>
      </CardHeader>
      <CardContent>
        {rating !== null ? (
          <div aria-label={`Rating: ${rating} out of ${RATING_SCALE}`} className="mb-4">
            {Array.from({ length: RATING_SCALE }).map((_, index) => (
              <span key={index}>{index < rating ? '★' : '☆'}</span>
            ))}
          </div>
        ) : (
          <p className="mb-4">No rating.</p>
        )}

        {reflectionText !== null ? (
          <p>{reflectionText}</p>
        ) : (
          <p className="text-muted-foreground">No notes left.</p>
        )}
      </CardContent>
    </Card>
  )
}
