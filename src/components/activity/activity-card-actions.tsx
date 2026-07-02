'use client'
import * as React from 'react'
import { Button } from '@/lib/ui'
import { Pencil, Trash2 } from 'lucide-react'
import {
  useActivityActions,
  type ActivityKind,
  type ActivityCardActionsProps,
} from '@/components/activity/use-activity-actions'

export type { ActivityKind, ActivityCardActionsProps }

export function ActivityCardActions(props: ActivityCardActionsProps): React.JSX.Element {
  const { type } = props
  const { isComplete, completeLabel, isPending, handleComplete, openEdit, openDelete, dialogs } =
    useActivityActions(props)

  return (
    <>
      <div className="flex items-center gap-1">
        {!isComplete && (
          <Button variant="outline" size="sm" onClick={handleComplete} disabled={isPending}>
            {completeLabel}
          </Button>
        )}
        <Button variant="ghost" size="icon" aria-label={`Edit ${type}`} onClick={openEdit}>
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </Button>
        <Button variant="ghost" size="icon" aria-label={`Delete ${type}`} onClick={openDelete}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>

      {dialogs}
    </>
  )
}
