'use client'
import { z } from 'zod'
import { Card, CardHeader, CardContent, Badge, Button } from '@/lib/ui'
import { updateTask } from '@/server/actions/tasks'

export const taskCardPropsSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string(),
  type: z.enum(['task', 'goal', 'habit']),
  status: z.enum(['pending', 'in_progress', 'completed']),
  nextSlot: z.string().nullable().optional(),
})

export type TaskCardProps = z.infer<typeof taskCardPropsSchema>

const typeLabels: Record<TaskCardProps['type'], string> = {
  task: 'Task',
  goal: 'Goal',
  habit: 'Habit',
}

const statusLabels: Record<TaskCardProps['status'], string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
}

export function TaskCard({ taskId, title, type, status, nextSlot }: TaskCardProps) {
  async function markComplete() {
    await updateTask({ id: taskId, status: 'completed' })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{title}</span>
          <div className="flex gap-2">
            <Badge variant="outline">{typeLabels[type]}</Badge>
            <Badge>{statusLabels[status]}</Badge>
          </div>
        </div>
      </CardHeader>
      {(nextSlot ?? status !== 'completed') && (
        <CardContent className="space-y-2">
          {nextSlot && <p className="text-muted-foreground text-sm">Next: {nextSlot}</p>}
          {status !== 'completed' && (
            <Button size="sm" variant="ghost" onClick={() => void markComplete()}>
              Mark complete
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  )
}
