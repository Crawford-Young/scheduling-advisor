'use client'
import { z } from 'zod'
import { Card, CardHeader, CardContent, Badge, Progress } from '@crawfordyoung/ui'
import { Flame } from 'lucide-react'

export const habitCardPropsSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string(),
  streak: z.number().int().min(0),
  completionRate: z.number().min(0).max(1),
  nextPrompt: z.string().nullable().optional(),
})

export type HabitCardProps = z.infer<typeof habitCardPropsSchema>

export function HabitCard({ title, streak, completionRate, nextPrompt }: HabitCardProps) {
  const pct = Math.round(completionRate * 100)

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
      <CardContent className="space-y-3">
        <div>
          <div className="text-muted-foreground mb-1 flex justify-between text-sm">
            <span>Completion</span>
            <span>{pct}%</span>
          </div>
          <Progress value={pct} aria-label={`${pct}% completion rate`} />
        </div>
        {nextPrompt && <p className="text-muted-foreground text-sm">Next: {nextPrompt}</p>}
      </CardContent>
    </Card>
  )
}
