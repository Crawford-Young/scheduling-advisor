'use client'
import * as React from 'react'
import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  RadioGroup,
  RadioGroupItem,
} from '@/lib/ui'

// ─── Public types ─────────────────────────────────────────────────────────────

export type ActivityType = 'task' | 'goal'

export interface ActivitySocial {
  readonly activityType: 'solo' | 'group'
  readonly visibility: 'everyone' | 'friends' | 'busy' | 'only_me'
  readonly joinability?: 'open' | 'request' | 'closed'
  readonly maxParticipants?: number
}

export interface ActivityFormValues {
  readonly type: ActivityType
  readonly title: string
  readonly targetDate?: string | null
  readonly startAt?: string | null
  readonly endAt?: string | null
  readonly recurrence?: string | null
  readonly recurrenceCount?: number
  readonly color?: string | null
  readonly location?: string | null
  readonly description?: string | null
  readonly allDay?: boolean
  readonly social: ActivitySocial
}

export interface ActivityFormDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onSubmit: (values: ActivityFormValues) => void | Promise<void>
  readonly initialType?: ActivityType
  readonly initialValues?: Partial<ActivityFormValues>
  readonly lockType?: boolean
  readonly isPending?: boolean
  readonly use24h?: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ActivityFormDialog({
  open,
  onOpenChange,
  initialType = 'task',
  initialValues,
  lockType = false,
  isPending = false,
}: ActivityFormDialogProps): React.JSX.Element {
  const [type, setType] = useState<ActivityType>(
    (initialValues?.type ?? initialType) as ActivityType,
  )

  const dialogTitle = `${initialValues ? 'Edit' : 'New'} ${type}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>Create or edit an activity.</DialogDescription>
        </DialogHeader>

        {!lockType && (
          <div className="space-y-2">
            <Label>Type</Label>
            <RadioGroup value={type} onValueChange={(v) => setType(v as ActivityType)}>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="task" id="afd-type-task" />
                  <Label htmlFor="afd-type-task">Task</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="goal" id="afd-type-goal" />
                  <Label htmlFor="afd-type-goal">Goal</Label>
                </div>
              </div>
            </RadioGroup>
          </div>
        )}

        <form id="activity-form" onSubmit={(e) => e.preventDefault()}>
          {/* task + goal fields added in B.2–B.3 */}
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="activity-form" disabled={isPending}>
            {isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
