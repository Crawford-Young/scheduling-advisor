'use client'
import * as React from 'react'
import { Check, Pencil, Trash2 } from 'lucide-react'
import { Badge, Button, DataTable, Progress, type ColumnDef } from '@/lib/ui'
import {
  useActivityActions,
  useEventActions,
  useSeriesActions,
  type ActivityActionsRow,
  type EventActionsRow,
  type SeriesActionsRow,
} from '@/components/activity/use-activity-actions'
import { formatSeriesLabel, type SeriesLabelInput } from '@/lib/pattern-label'

const PERCENT_MAX = 100
const NO_NEXT_EVENT = '—'
const NO_SERIES_LABEL = 'No series'

/** Serialized activity-template row (built server-side in the page). */
export interface ActivityRow extends ActivityActionsRow {
  /** Completed sessions in the local week (weekly-fit numerator). */
  readonly completedThisWeek: number
  /** Earliest future event start (ISO) for this activity, or null when none. */
  readonly nextEventIso: string | null
  /** This activity's linked series (`eventSeries.activityId = activity.id`). */
  readonly series: readonly SeriesActionsRow[]
}

/** Serialized standalone-event row for the one-off section. */
export type OneOffEventRow = EventActionsRow

/** Serialized standalone-series row for the "Repeating events" section. */
export interface StandaloneSeriesRow extends SeriesActionsRow {
  /** Earliest future occurrence (ISO) among this series' events, or null when none. */
  readonly nextOccurrenceIso: string | null
}

/** Converts a serialized series row into `formatSeriesLabel`'s pure input shape. */
function toSeriesLabelInput(series: SeriesActionsRow): SeriesLabelInput {
  return {
    freq: series.freq,
    weekdays: series.weekdays,
    dayOfMonth: series.dayOfMonth,
    nthOrdinal: series.nthOrdinal,
    nthWeekday: series.nthWeekday,
    month: series.month,
    startMinutes: series.startMinutes,
    durationMin: series.durationMin,
    until: series.until ? new Date(series.until) : null,
  }
}

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

interface ActivitySeriesListItemProps {
  readonly series: SeriesActionsRow
  readonly use24h?: boolean
}

/** One series line within an activity row's Pattern cell: label + inline edit/delete. */
function ActivitySeriesListItem({
  series,
  use24h,
}: ActivitySeriesListItemProps): React.JSX.Element {
  const { openEdit, openDelete, dialogs } = useSeriesActions({ series, use24h })
  return (
    <li className="flex items-center gap-1 text-sm whitespace-nowrap">
      <span>{formatSeriesLabel(toSeriesLabelInput(series), use24h ?? false)}</span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Edit series: ${series.title}`}
        onClick={openEdit}
      >
        <Pencil className="h-3 w-3" aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Delete series: ${series.title}`}
        onClick={openDelete}
      >
        <Trash2 className="h-3 w-3" aria-hidden />
      </Button>
      {dialogs}
    </li>
  )
}

interface ActivitySeriesListProps {
  readonly series: readonly SeriesActionsRow[]
  readonly use24h?: boolean
}

/** Pattern-column cell: one label line per series, with inline edit/delete affordances. */
function ActivitySeriesList({ series, use24h }: ActivitySeriesListProps): React.JSX.Element {
  if (series.length === 0) {
    return <span className="text-muted-foreground text-sm">{NO_SERIES_LABEL}</span>
  }
  return (
    <ul className="flex flex-col gap-1">
      {series.map((s) => (
        <ActivitySeriesListItem key={s.id} series={s} use24h={use24h} />
      ))}
    </ul>
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
      accessorFn: (row) => row.series.length,
      header: 'Pattern',
      cell: ({ row }) => <ActivitySeriesList series={row.original.series} use24h={use24h} />,
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

// ── Standalone series table ("Repeating events" section) ───────────────────────

interface SeriesRowActionsProps {
  readonly series: SeriesActionsRow
  readonly use24h?: boolean
}

function SeriesRowActions({ series, use24h }: SeriesRowActionsProps): React.JSX.Element {
  const { openEdit, openDelete, dialogs } = useSeriesActions({ series, use24h })
  return (
    <div className="flex items-center gap-1 whitespace-nowrap">
      <Button variant="ghost" size="icon" aria-label="Edit series" onClick={openEdit}>
        <Pencil className="h-3.5 w-3.5" aria-hidden />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Delete series" onClick={openDelete}>
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </Button>
      {dialogs}
    </div>
  )
}

function buildSeriesColumns(use24h: boolean): ColumnDef<StandaloneSeriesRow>[] {
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
      accessorFn: (row) => formatSeriesLabel(toSeriesLabelInput(row), use24h),
      header: 'Pattern',
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {formatSeriesLabel(toSeriesLabelInput(row.original), use24h)}
        </span>
      ),
    },
    {
      id: 'next',
      accessorFn: (row) => row.nextOccurrenceIso ?? undefined,
      header: 'Next occurrence',
      sortUndefined: 'last',
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {row.original.nextOccurrenceIso === null
            ? NO_NEXT_EVENT
            : formatDateTime(row.original.nextOccurrenceIso, use24h)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      cell: ({ row }) => <SeriesRowActions series={row.original} use24h={use24h} />,
    },
  ]
}

interface SeriesTableProps {
  readonly items: readonly StandaloneSeriesRow[]
  /** Display times as 24-hour instead of 12-hour with AM/PM. */
  readonly use24h?: boolean
}

export function SeriesTable({ items, use24h }: SeriesTableProps): React.JSX.Element {
  const columns = React.useMemo(() => buildSeriesColumns(use24h ?? false), [use24h])
  return <DataTable columns={columns} data={[...items]} />
}
