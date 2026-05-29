'use client'
import * as React from 'react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/lib/ui'
import { recordCompletion } from '@/server/actions/consistency'

interface CheckInItem {
  readonly taskId: string
  readonly title: string
  readonly status: 'pending' | 'in_progress' | 'completed'
}

interface CheckInSheetProps {
  readonly item: CheckInItem
  readonly onClose: () => void
  readonly onPerfectWeek: () => void
}

export function CheckInSheet({
  item,
  onClose,
  onPerfectWeek,
}: CheckInSheetProps): React.JSX.Element {
  const router = useRouter()
  const [done, setDone] = useState(false)
  const [, startTransition] = useTransition()

  function handleDone(): void {
    setDone(true)
    startTransition(async () => {
      const result = await recordCompletion({ taskId: item.taskId, outcome: 'done' })
      if ('data' in result && result.data.isPerfectWeek) {
        onPerfectWeek()
      }
      router.refresh()
      onClose()
    })
  }

  function handleSkip(): void {
    setDone(true)
    startTransition(async () => {
      await recordCompletion({ taskId: item.taskId, outcome: 'skip' })
      router.refresh()
      onClose()
    })
  }

  function handleReschedule(): void {
    onClose()
  }

  return (
    <div className="border-border bg-card space-y-4 rounded-lg border p-4">
      <p className="font-medium">{item.title}</p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="default"
          onClick={handleDone}
          disabled={done || item.status === 'completed'}
          aria-label="Done"
        >
          Done
        </Button>
        <Button size="sm" variant="outline" onClick={handleSkip} disabled={done} aria-label="Skip">
          Skip
        </Button>
        <Button size="sm" variant="ghost" onClick={handleReschedule} aria-label="Reschedule">
          Reschedule
        </Button>
      </div>
    </div>
  )
}
