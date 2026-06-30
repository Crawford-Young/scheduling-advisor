'use client'
import * as React from 'react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/lib/ui'
import {
  ActivityFormDialog,
  type ActivityFormValues,
} from '@/components/activity/activity-form-dialog'
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

export function ActivityCreateButton(): React.JSX.Element {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(values: ActivityFormValues): void {
    startTransition(async () => {
      await createTask({
        type: values.type,
        title: values.title,
        recurrence: values.recurrence ?? null,
        recurrenceCount: values.recurrenceCount,
        startAt: values.startAt ?? null,
        endAt: values.endAt ?? null,
        targetDate: values.type === 'goal' ? toIsoTargetDate(values.targetDate) : null,
      })
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
      />
    </>
  )
}
