'use client'
import * as React from 'react'
import { useState, useTransition } from 'react'
import { z } from 'zod'
import { Card, CardHeader, CardContent, Badge } from '@/lib/ui'
import { Flame } from 'lucide-react'
import { updateTask } from '@/server/actions/tasks'

export const habitCardPropsSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed']),
  streak: z.number().int().min(0),
})

export type HabitCardProps = z.infer<typeof habitCardPropsSchema>

export function HabitCard({
  taskId,
  title,
  status: initialStatus,
  streak,
}: HabitCardProps): React.JSX.Element {
  const [status, setStatus] = useState(initialStatus)
  const [, startTransition] = useTransition()

  function handleLog() {
    setStatus('completed')
    startTransition(async () => {
      await updateTask({ id: taskId, status: 'completed' })
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{title}</span>
          <Badge variant="outline" className="flex items-center gap-1">
            <Flame className="h-3 w-3 text-orange-500" aria-hidden />
            {streak} day streak
          </Badge>
        </div>
      </CardHeader>
      {status !== 'completed' && (
        <CardContent>
          <button
            type="button"
            onClick={handleLog}
            className="bg-accent text-accent-foreground hover:bg-accent-hover rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
          >
            Log today
          </button>
        </CardContent>
      )}
    </Card>
  )
}
