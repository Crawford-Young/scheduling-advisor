import { z } from 'zod'
import { Card, CardHeader, CardContent } from '@/lib/ui'

export const reflectionCardPropsSchema = z.object({
  checkInId: z.string().uuid(),
  promptText: z.string(),
  taskTitle: z.string().nullable().optional(),
})

export type ReflectionCardProps = z.infer<typeof reflectionCardPropsSchema>

/**
 * Display-only (A8, activity-model wave): the `check_ins` table and its
 * `completeCheckIn` action were dropped with the old model, so this card can
 * no longer accept a rating/reflection submission. It is kept, non-interactive,
 * purely to render OLD persisted chat messages via `tool-result-renderer.tsx`'s
 * legacy `showReflectionCard` map — see AGENTS.md.
 */
export function ReflectionCard({ promptText, taskTitle }: ReflectionCardProps) {
  return (
    <Card>
      <CardHeader>
        <p className="font-medium">{promptText}</p>
        {taskTitle && <p className="text-muted-foreground text-sm">{taskTitle}</p>}
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-muted-foreground text-sm">Reflections are no longer collected.</p>
      </CardContent>
    </Card>
  )
}
