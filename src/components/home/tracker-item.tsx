'use client'
import * as React from 'react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/lib/ui'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { updateTask } from '@/server/actions/tasks'

interface TrackerItemProps {
  readonly id: string
  readonly title: string
  readonly startAt?: Date | null
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function TrackerItem({ id, title, startAt }: TrackerItemProps): React.JSX.Element {
  const router = useRouter()
  const [done, setDone] = useState(false)
  const [, startTransition] = useTransition()

  function handleComplete(): void {
    setDone(true)
    startTransition(async () => {
      await updateTask({ id, status: 'completed' })
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Complete ${title}`}
        onClick={handleComplete}
        disabled={done}
      >
        <Check className="h-4 w-4" aria-hidden />
      </Button>
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm', done && 'text-muted-foreground line-through')}>
          {title}
        </p>
        {startAt !== null && startAt !== undefined && (
          <p className="text-muted-foreground text-xs">{formatTime(startAt)}</p>
        )}
      </div>
    </div>
  )
}
