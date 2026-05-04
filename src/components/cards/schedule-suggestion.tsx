'use client'
import { z } from 'zod'
import { useState } from 'react'
import { Card, CardHeader, CardContent, Button } from '@crawfordyoung/ui'

export const scheduleSuggestionPropsSchema = z.object({
  taskId: z.string().uuid(),
  taskTitle: z.string(),
  slots: z.array(
    z.object({
      start: z.string(),
      end: z.string(),
      label: z.string(),
    }),
  ),
})

export type ScheduleSuggestionProps = z.infer<typeof scheduleSuggestionPropsSchema>

export function ScheduleSuggestion({ taskTitle, slots }: ScheduleSuggestionProps) {
  const [accepted, setAccepted] = useState<string | null>(null)
  const [rejected, setRejected] = useState<Set<string>>(new Set())

  async function acceptSlot(start: string, end: string) {
    const res = await fetch('/api/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: taskTitle, start, end }),
    })
    if (res.ok) setAccepted(start)
  }

  function rejectSlot(start: string) {
    setRejected((prev) => new Set([...prev, start]))
  }

  const activeSlots = slots.filter((s) => !rejected.has(s.start) && s.start !== accepted)

  return (
    <Card>
      <CardHeader>
        <p className="font-medium">Schedule: {taskTitle}</p>
        <p className="text-muted-foreground text-sm">Choose a time slot</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {accepted ? (
          <p className="text-sm text-green-600 dark:text-green-400">
            Scheduled! Added to your calendar.
          </p>
        ) : activeSlots.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            All slots skipped — ask me for more options.
          </p>
        ) : (
          activeSlots.map((slot) => (
            <div
              key={slot.start}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <span className="text-sm">{slot.label}</span>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void acceptSlot(slot.start, slot.end)}>
                  Accept
                </Button>
                <Button size="sm" variant="outline" onClick={() => rejectSlot(slot.start)}>
                  Skip
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
