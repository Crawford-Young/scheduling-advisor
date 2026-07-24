'use client'
import * as React from 'react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button, toast } from '@/lib/ui'
import {
  ActivityTemplateDialog,
  type ActivityTemplateValues,
} from '@/components/forms/activity-template-dialog'
import { createActivity } from '@/server/actions/activities'

export interface ActivityCreateButtonProps {
  /** Display schedule times as 24-hour instead of 12-hour with AM/PM. */
  readonly use24h?: boolean
}

/** "New" button that opens the ActivityTemplateDialog and creates an activity template. */
export function ActivityCreateButton({ use24h }: ActivityCreateButtonProps): React.JSX.Element {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(values: ActivityTemplateValues): void {
    startTransition(async () => {
      const result = await createActivity({
        title: values.title,
        color: values.color ?? null,
        description: values.description ?? null,
        defaultLocation: values.defaultLocation ?? null,
        minDurationMin: values.minDurationMin,
        maxDurationMin: values.maxDurationMin,
        weeklyTargetSessions: values.weeklyTargetSessions,
        // Metadata-only (A5): no schedule/timeZone stamp.
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

      {/* Conditional-mount so each open re-seeds a fresh (blank) draft — a
          cancelled or completed create never leaks its draft into the next open. */}
      {open && (
        <ActivityTemplateDialog
          open
          onOpenChange={setOpen}
          onSubmit={handleSubmit}
          isPending={isPending}
          use24h={use24h}
        />
      )}
    </>
  )
}
