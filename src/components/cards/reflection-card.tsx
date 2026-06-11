'use client'
import { z } from 'zod'
import { useState } from 'react'
import { Card, CardHeader, CardContent, CardFooter, Button, Textarea } from '@/lib/ui'
import { completeCheckIn } from '@/server/actions/check-ins'

export const reflectionCardPropsSchema = z.object({
  checkInId: z.string().uuid(),
  promptText: z.string(),
  taskTitle: z.string().nullable().optional(),
})

export type ReflectionCardProps = z.infer<typeof reflectionCardPropsSchema>

const RATINGS = [1, 2, 3, 4, 5] as const

export function ReflectionCard({ checkInId, promptText, taskTitle }: ReflectionCardProps) {
  const [rating, setRating] = useState<number | null>(null)
  const [reflection, setReflection] = useState('')
  const [submitted, setSubmitted] = useState(false)

  async function handleSave() {
    /* v8 ignore next */
    if (!rating) return
    await completeCheckIn({
      id: checkInId,
      rating,
      reflectionText: reflection || undefined,
    })
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-sm">Reflection saved. Keep going.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <p className="font-medium">{promptText}</p>
        {taskTitle && <p className="text-muted-foreground text-sm">{taskTitle}</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2" role="group" aria-label="Rating">
          {RATINGS.map((n) => (
            <button
              key={n}
              aria-label={String(n)}
              aria-pressed={rating === n}
              onClick={() => setRating(n)}
              className={`h-9 w-9 rounded-full border text-sm font-medium transition-colors focus-visible:ring-2 ${
                rating === n
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'hover:bg-accent border-input'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <Textarea
          placeholder="How did it go? (optional)"
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
          rows={3}
        />
      </CardContent>
      <CardFooter>
        <Button onClick={() => void handleSave()} disabled={!rating}>
          Save reflection
        </Button>
      </CardFooter>
    </Card>
  )
}
