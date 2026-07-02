'use client'
import * as React from 'react'
import { Check, Pencil, Trash2 } from 'lucide-react'
import { Badge, Button, DataTable, type BadgeProps, type ColumnDef } from '@/lib/ui'
import { useActivityActions, type ActivityKind } from '@/components/activity/use-activity-actions'
import type { ActivitySocial } from '@/components/activity/activity-form-dialog'

const SEPARATOR = ' · '

type BadgeVariant = NonNullable<BadgeProps['variant']>

interface BadgeStyle {
  readonly variant: BadgeVariant
  readonly className?: string
}

/** Status → Badge treatment. `completed` gets a green treatment (Badge has no `success` variant). */
const STATUS_BADGE: Record<'pending' | 'in_progress' | 'completed', BadgeStyle> = {
  pending: { variant: 'outline' },
  in_progress: { variant: 'secondary' },
  completed: {
    variant: 'outline',
    className: 'border-transparent bg-emerald-500/15 text-emerald-400',
  },
}

/** Activity type → Badge treatment. */
const TYPE_BADGE: Record<ActivityKind, BadgeStyle> = {
  task: { variant: 'secondary' },
  goal: { variant: 'outline' },
}

/** Serialized, client-safe representation of one activity row. */
export interface ActivityRow {
  readonly id: string
  readonly title: string
  readonly type: ActivityKind
  readonly status: 'pending' | 'in_progress' | 'completed'
  /** Sort key: task `startAt` ISO or goal `targetDate` (date-only); null when unset. */
  readonly dateIso: string | null
  /** Display label for the When column. */
  readonly dateLabel: string
  readonly recurrence: string | null
  readonly location: string | null
  readonly description: string | null
  readonly color: string | null
  readonly allDay: boolean
  readonly streak: number
  readonly startAt: string | null
  readonly endAt: string | null
  readonly targetDate: string | null
  readonly activityType: ActivitySocial['activityType']
  readonly visibility: ActivitySocial['visibility']
  readonly joinability: ActivitySocial['joinability'] | null
  readonly maxParticipants: number | null
}

interface ActivityRowActionsProps {
  readonly row: ActivityRow
}

/** Per-row complete/edit/delete controls, wired through the shared hook. */
function ActivityRowActions({ row }: ActivityRowActionsProps): React.JSX.Element {
  const { isComplete, completeLabel, isPending, handleComplete, openEdit, openDelete, dialogs } =
    useActivityActions({
      taskId: row.id,
      type: row.type,
      title: row.title,
      status: row.status,
      startAt: row.startAt,
      endAt: row.endAt,
      recurrence: row.recurrence,
      targetDate: row.targetDate,
      color: row.color,
      location: row.location,
      description: row.description,
      allDay: row.allDay,
      social: {
        activityType: row.activityType,
        visibility: row.visibility,
        joinability: row.joinability ?? undefined,
        maxParticipants: row.maxParticipants ?? undefined,
      },
    })

  return (
    <div className="flex items-center gap-1 whitespace-nowrap">
      {!isComplete && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={completeLabel}
          onClick={handleComplete}
          disabled={isPending}
        >
          <Check className="h-3.5 w-3.5" aria-hidden />
        </Button>
      )}
      <Button variant="ghost" size="icon" aria-label={`Edit ${row.type}`} onClick={openEdit}>
        <Pencil className="h-3.5 w-3.5" aria-hidden />
      </Button>
      <Button variant="ghost" size="icon" aria-label={`Delete ${row.type}`} onClick={openDelete}>
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </Button>
      {dialogs}
    </div>
  )
}

const columns: ColumnDef<ActivityRow>[] = [
  {
    accessorKey: 'title',
    header: 'Title',
    cell: ({ row }) => {
      const badgeStyle = TYPE_BADGE[row.original.type]
      return (
        <span className="flex min-w-[12rem] items-center gap-2">
          {row.original.color !== null && (
            <span
              aria-hidden
              data-color={row.original.color}
              className="border-border inline-block size-3 shrink-0 rounded-full border"
              style={{ backgroundColor: row.original.color }}
            />
          )}
          <span className="max-w-[16rem] min-w-0 truncate">{row.original.title}</span>
          <Badge variant={badgeStyle.variant} className={badgeStyle.className}>
            {row.original.type}
          </Badge>
        </span>
      )
    },
  },
  {
    id: 'when',
    accessorFn: (row) => row.dateIso ?? undefined,
    header: 'When',
    sortUndefined: 'last',
    cell: ({ row }) => (
      <span className="whitespace-nowrap">
        {row.original.dateLabel}
        {row.original.recurrence !== null && (
          <span className="text-muted-foreground">{`${SEPARATOR}${row.original.recurrence}`}</span>
        )}
      </span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const badgeStyle = STATUS_BADGE[row.original.status]
      return (
        <span className="flex items-center gap-1 whitespace-nowrap">
          <Badge variant={badgeStyle.variant} className={badgeStyle.className}>
            {row.original.status}
          </Badge>
          {row.original.recurrence !== null && <span>{`🔥 ${row.original.streak}`}</span>}
        </span>
      )
    },
  },
  {
    id: 'social',
    accessorFn: (row) => `${row.activityType}${SEPARATOR}${row.visibility}`,
    header: 'Social',
    cell: ({ row }) => (
      <span className="flex items-center gap-1 whitespace-nowrap">
        <Badge variant="outline">{row.original.activityType}</Badge>
        <Badge variant="secondary">{row.original.visibility}</Badge>
      </span>
    ),
  },
  {
    id: 'actions',
    header: 'Actions',
    enableSorting: false,
    cell: ({ row }) => <ActivityRowActions row={row.original} />,
  },
]

interface ActivityTableProps {
  readonly items: readonly ActivityRow[]
}

export function ActivityTable({ items }: ActivityTableProps): React.JSX.Element {
  return <DataTable columns={columns} data={[...items]} />
}
