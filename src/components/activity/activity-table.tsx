'use client'
import * as React from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Button, DataTable, type ColumnDef } from '@/lib/ui'
import { useActivityActions, type ActivityKind } from '@/components/activity/use-activity-actions'
import type { ActivitySocial } from '@/components/activity/activity-form-dialog'

const EMPTY_CELL = '—'
const SOCIAL_SEPARATOR = ' · '

/** Serialized, client-safe representation of one activity row. */
export interface ActivityRow {
  readonly id: string
  readonly title: string
  readonly type: ActivityKind
  readonly status: 'pending' | 'in_progress' | 'completed'
  /** Sort key: task `startAt` ISO or goal `targetDate` (date-only); null when unset. */
  readonly dateIso: string | null
  /** Display label for the Date column. */
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
        <Button variant="outline" size="sm" onClick={handleComplete} disabled={isPending}>
          {completeLabel}
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
    cell: ({ row }) => <span className="inline-block min-w-[12rem]">{row.original.title}</span>,
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }) => <span className="whitespace-nowrap">{row.original.type}</span>,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <span className="whitespace-nowrap">
        <span>{row.original.status}</span>
        {row.original.recurrence !== null && (
          <span className="ml-1">{`🔥 ${row.original.streak}`}</span>
        )}
      </span>
    ),
  },
  {
    id: 'date',
    accessorFn: (row) => row.dateIso ?? undefined,
    header: 'Date',
    sortUndefined: 'last',
    cell: ({ row }) => <span className="whitespace-nowrap">{row.original.dateLabel}</span>,
  },
  {
    accessorKey: 'recurrence',
    header: 'Recurrence',
    cell: ({ row }) => row.original.recurrence ?? EMPTY_CELL,
  },
  {
    accessorKey: 'location',
    header: 'Location',
    cell: ({ row }) => row.original.location ?? EMPTY_CELL,
  },
  {
    accessorKey: 'color',
    header: 'Color',
    cell: ({ row }) => (
      <span
        aria-hidden
        data-color={row.original.color ?? ''}
        className="border-border inline-block size-3 rounded-full border"
        style={{ backgroundColor: row.original.color ?? undefined }}
      />
    ),
  },
  {
    id: 'social',
    accessorFn: (row) => `${row.activityType}${SOCIAL_SEPARATOR}${row.visibility}`,
    header: 'Social',
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
