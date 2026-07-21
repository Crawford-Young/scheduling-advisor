'use client'
import * as React from 'react'
import { Check, Pencil, Trash2 } from 'lucide-react'
import { Badge, Button, DataTable, Progress, type ColumnDef } from '@/lib/ui'
import {
  useActivityActions,
  useEventActions,
  type ActivityActionsRow,
  type EventActionsRow,
} from '@/components/activity/use-activity-actions'
import { formatPatternLabel } from '@/lib/pattern-label'

const PERCENT_MAX = 100
const NO_NEXT_EVENT = '—'

/** Serialized activity-template row (built server-side in the page). */
export interface ActivityRow extends ActivityActionsRow {
  /** Completed sessions in the local week (weekly-fit numerator). */
  readonly completedThisWeek: number
  /** Earliest future event start (ISO) for this activity, or null when none. */
  readonly nextEventIso: string | null
}

/** Serialized standalone-event row for the one-off section. */
export type OneOffEventRow = EventActionsRow

function formatDateTime(iso: string, use24h: boolean): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: !use24h,
  })
}

function fitPercent(completed: number, target: number): number {
  return Math.min(PERCENT_MAX, Math.round((completed / target) * PERCENT_MAX))
}

interface ColorDotProps {
  readonly color: string | null
}

function ColorDot({ color }: ColorDotProps): React.JSX.Element | null {
  if (color === null) return null
  return (
    <span
      aria-hidden
      data-color={color}
      className="border-border inline-block size-3 shrink-0 rounded-full border"
      style={{ backgroundColor: color }}
    />
  )
}

// ── Activities table ──────────────────────────────────────────────────────────

interface ActivityRowActionsProps {
  readonly row: ActivityRow
  readonly use24h?: boolean
  readonly autoOpenEdit: boolean
}

function ActivityRowActions({
  row,
  use24h,
  autoOpenEdit,
}: ActivityRowActionsProps): React.JSX.Element {
  const { openEdit, openDelete, dialogs } = useActivityActions({
    activity: row,
    use24h,
    initialEditOpen: autoOpenEdit,
  })
  return (
    <div className="flex items-center gap-1 whitespace-nowrap">
      <Button variant="ghost" size="icon" aria-label="Edit activity" onClick={openEdit}>
        <Pencil className="h-3.5 w-3.5" aria-hidden />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Delete activity" onClick={openDelete}>
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </Button>
      {dialogs}
    </div>
  )
}

function buildActivityColumns(
  use24h: boolean,
  initialEditId: string | null,
): ColumnDef<ActivityRow>[] {
  return [
    {
      accessorKey: 'title',
      header: 'Title',
      cell: ({ row }) => (
        <span className="flex min-w-[12rem] items-center gap-2">
          <ColorDot color={row.original.color} />
          <span className="max-w-[16rem] min-w-0 truncate">{row.original.title}</span>
        </span>
      ),
    },
    {
      id: 'pattern',
      accessorFn: (row) => formatPatternLabel(row.schedule),
      header: 'Pattern',
      cell: ({ row }) => (
        <span className="whitespace-nowrap">{formatPatternLabel(row.original.schedule)}</span>
      ),
    },
    {
      id: 'week',
      accessorFn: (row) => row.completedThisWeek,
      header: 'This week',
      cell: ({ row }) => (
        <div className="flex min-w-[8rem] flex-col gap-1">
          <span className="whitespace-nowrap">
            {row.original.completedThisWeek} of {row.original.weeklyTargetSessions}
          </span>
          <Progress
            value={fitPercent(row.original.completedThisWeek, row.original.weeklyTargetSessions)}
          />
        </div>
      ),
    },
    {
      id: 'next',
      accessorFn: (row) => row.nextEventIso ?? undefined,
      header: 'Next event',
      sortUndefined: 'last',
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {row.original.nextEventIso === null
            ? NO_NEXT_EVENT
            : formatDateTime(row.original.nextEventIso, use24h)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      cell: ({ row }) => (
        <ActivityRowActions
          row={row.original}
          use24h={use24h}
          autoOpenEdit={row.original.id === initialEditId}
        />
      ),
    },
  ]
}

interface ActivityTableProps {
  readonly items: readonly ActivityRow[]
  /** Display times as 24-hour instead of 12-hour with AM/PM. */
  readonly use24h?: boolean
  /** Activity id from the `?edit=` deep link — auto-opens that row's edit dialog. */
  readonly initialEditId?: string | null
}

export function ActivityTable({
  items,
  use24h,
  initialEditId,
}: ActivityTableProps): React.JSX.Element {
  const columns = React.useMemo(
    () => buildActivityColumns(use24h ?? false, initialEditId ?? null),
    [use24h, initialEditId],
  )
  return <DataTable columns={columns} data={[...items]} />
}

// ── One-off events table ──────────────────────────────────────────────────────

const STATUS_BADGE_CLASS: Record<OneOffEventRow['status'], string | undefined> = {
  pending: undefined,
  completed: 'border-transparent bg-emerald-500/15 text-emerald-400',
}

interface EventRowActionsProps {
  readonly row: OneOffEventRow
  readonly use24h?: boolean
}

function EventRowActions({ row, use24h }: EventRowActionsProps): React.JSX.Element {
  const { completeLabel, isPending, handleComplete, openEdit, openDelete, dialogs } =
    useEventActions({ event: row, use24h })
  return (
    <div className="flex items-center gap-1 whitespace-nowrap">
      <Button
        variant="ghost"
        size="icon"
        aria-label={completeLabel}
        onClick={handleComplete}
        disabled={isPending}
      >
        <Check className="h-3.5 w-3.5" aria-hidden />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Edit event" onClick={openEdit}>
        <Pencil className="h-3.5 w-3.5" aria-hidden />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Delete event" onClick={openDelete}>
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </Button>
      {dialogs}
    </div>
  )
}

function buildEventColumns(use24h: boolean): ColumnDef<OneOffEventRow>[] {
  return [
    {
      accessorKey: 'title',
      header: 'Title',
      cell: ({ row }) => (
        <span className="flex min-w-[12rem] items-center gap-2">
          <ColorDot color={row.original.color} />
          <span className="max-w-[16rem] min-w-0 truncate">{row.original.title}</span>
        </span>
      ),
    },
    {
      id: 'when',
      accessorFn: (row) => row.startAt ?? undefined,
      header: 'When',
      sortUndefined: 'last',
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {row.original.startAt === null
            ? 'No time set'
            : formatDateTime(row.original.startAt, use24h)}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant="outline" className={STATUS_BADGE_CLASS[row.original.status]}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      cell: ({ row }) => <EventRowActions row={row.original} use24h={use24h} />,
    },
  ]
}

interface OneOffEventsTableProps {
  readonly items: readonly OneOffEventRow[]
  /** Display times as 24-hour instead of 12-hour with AM/PM. */
  readonly use24h?: boolean
}

export function OneOffEventsTable({ items, use24h }: OneOffEventsTableProps): React.JSX.Element {
  const columns = React.useMemo(() => buildEventColumns(use24h ?? false), [use24h])
  return <DataTable columns={columns} data={[...items]} />
}
