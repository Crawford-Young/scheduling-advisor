'use client'
import * as React from 'react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { ActivityTemplateDialog, Button, toast, type ActivityTemplateValues } from '@/lib/ui'
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
        schedule: values.schedule,
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

      <ActivityTemplateDialog
        open={open}
        onOpenChange={setOpen}
        onSubmit={handleSubmit}
        isPending={isPending}
        use24h={use24h}
      />
    </>
  )
}
