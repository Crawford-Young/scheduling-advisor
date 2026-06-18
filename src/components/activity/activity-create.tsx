'use client'
import * as React from 'react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ActivityFormDialog, type ActivityFormValues, buildIso, Button, Input } from '@/lib/ui'
import { Plus } from 'lucide-react'
import { createTask } from '@/server/actions/tasks'

const QUICK_ADD_START = '09:00'
const QUICK_ADD_END = '10:00'
const TARGET_DATE_TIME_SUFFIX = 'T12:00:00.000Z'
const MAX_TITLE_LENGTH = 200

function toIsoTargetDate(dateOnly: string | null | undefined): string | null {
  return dateOnly ? new Date(`${dateOnly}${TARGET_DATE_TIME_SUFFIX}`).toISOString() : null
}

export function ActivityCreate(): React.JSX.Element {
  const router = useRouter()
  const [quickTitle, setQuickTitle] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleQuickAdd(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault()
    const title = quickTitle.trim()
    if (!title) return
    const today = new Date()
    startTransition(async () => {
      await createTask({
        type: 'task',
        title,
        startAt: buildIso(today, QUICK_ADD_START),
        endAt: buildIso(today, QUICK_ADD_END),
      })
      setQuickTitle('')
      router.refresh()
    })
  }

  function handleDialogSubmit(values: ActivityFormValues): void {
    startTransition(async () => {
      await createTask({
        type: values.type,
        title: values.title,
        recurrence: values.recurrence ?? null,
        recurrenceCount: values.recurrenceCount,
        startAt: values.startAt ?? null,
        endAt: values.endAt ?? null,
        targetDate: toIsoTargetDate(values.targetDate),
      })
      setDialogOpen(false)
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-2">
      <form onSubmit={handleQuickAdd} className="flex flex-1 gap-2">
        <Input
          aria-label="Quick add task"
          placeholder="Add a task…"
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          maxLength={MAX_TITLE_LENGTH}
        />
        <Button type="submit" disabled={!quickTitle.trim() || isPending}>
          Add
        </Button>
      </form>
      <Button type="button" variant="outline" onClick={() => setDialogOpen(true)}>
        <Plus className="mr-1 h-4 w-4" aria-hidden />
        New
      </Button>

      <ActivityFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleDialogSubmit}
        isPending={isPending}
      />
    </div>
  )
}
