'use client'
import * as React from 'react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { ActivityFormDialog, Button, toast, type ActivityFormValues } from '@/lib/ui'
import { createTask } from '@/server/actions/tasks'

const TARGET_DATE_TIME_SUFFIX = 'T12:00:00.000Z'

/**
 * Converts the dialog's date-only `YYYY-MM-DD` `targetDate` into a noon-UTC ISO
 * string. A full ISO datetime into the goal-date schema yields Invalid Date and
 * silently wipes the target — see AGENTS.md (goal-date-wipe trap).
 */
function toIsoTargetDate(dateOnly: string | null | undefined): string | null {
  return dateOnly ? new Date(`${dateOnly}${TARGET_DATE_TIME_SUFFIX}`).toISOString() : null
}

export interface ActivityCreateButtonProps {
  /** Display task times as 24-hour instead of 12-hour with AM/PM. */
  readonly use24h?: boolean
}

export function ActivityCreateButton({ use24h }: ActivityCreateButtonProps): React.JSX.Element {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(values: ActivityFormValues): void {
    startTransition(async () => {
      const result = await createTask({
        type: values.type,
        title: values.title,
        recurrence: values.recurrence ?? null,
        recurrenceCount: values.recurrenceCount,
        recurrenceDays: values.recurrenceDays,
        startAt: values.startAt ?? null,
        endAt: values.endAt ?? null,
        targetDate: values.type === 'goal' ? toIsoTargetDate(values.targetDate) : null,
        color: values.color ?? null,
        location: values.location ?? null,
        description: values.description ?? null,
        allDay: values.allDay,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      if ('error' in result) {
        toast.error('Could not create activity')
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" aria-hidden />
        New
      </Button>

      <ActivityFormDialog
        open={open}
        onOpenChange={setOpen}
        onSubmit={handleSubmit}
        isPending={isPending}
        use24h={use24h}
      />
    </>
  )
}
