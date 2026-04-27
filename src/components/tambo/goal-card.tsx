'use client'
import { z } from 'zod'
import { Card, CardHeader, CardContent, Progress, Badge } from '@crawfordyoung/ui'
import { CheckCircle2, Circle } from 'lucide-react'

export const goalCardPropsSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string(),
  progress: z.number().min(0).max(1),
  milestones: z.array(z.object({ label: z.string(), completed: z.boolean() })),
  targetDate: z.string().nullable().optional(),
})

export type GoalCardProps = z.infer<typeof goalCardPropsSchema>

export function GoalCard({ title, progress, milestones, targetDate }: GoalCardProps) {
  const pct = Math.round(progress * 100)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{title}</span>
          <Badge>{pct}%</Badge>
        </div>
        {targetDate && <p className="text-muted-foreground text-xs">Target: {targetDate}</p>}
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={pct} aria-label={`Goal ${pct}% complete`} />
        {milestones.length > 0 && (
          <ul className="space-y-1" aria-label="Milestones">
            {milestones.map((m) => (
              <li key={m.label} className="flex items-center gap-2 text-sm">
                {m.completed ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" aria-label="Completed" />
                ) : (
                  <Circle className="text-muted-foreground h-4 w-4" aria-label="Not completed" />
                )}
                <span className={m.completed ? 'text-muted-foreground line-through' : ''}>
                  {m.label}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
