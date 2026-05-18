'use client'
import * as React from 'react'
import { useState, useTransition } from 'react'
import { z } from 'zod'
import { Card, CardHeader, CardContent, Badge } from '@/lib/ui'
import { updateTask } from '@/server/actions/tasks'

export const goalCardPropsSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed']),
  targetDate: z.string().nullable().optional(),
})

export type GoalCardProps = z.infer<typeof goalCardPropsSchema>

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
}

export function GoalCard({
  taskId,
  title,
  status: initialStatus,
  targetDate,
}: GoalCardProps): React.JSX.Element {
  const [status, setStatus] = useState(initialStatus)
  const [, startTransition] = useTransition()

  function handleComplete() {
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
          <Badge>{STATUS_LABELS[status]}</Badge>
        </div>
        {targetDate && <p className="text-muted-foreground text-xs">Target: {targetDate}</p>}
      </CardHeader>
      {status !== 'completed' && (
        <CardContent>
          <button
            type="button"
            onClick={handleComplete}
            className="bg-accent text-accent-foreground hover:bg-accent-hover rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
          >
            Mark complete
          </button>
        </CardContent>
      )}
    </Card>
  )
}
