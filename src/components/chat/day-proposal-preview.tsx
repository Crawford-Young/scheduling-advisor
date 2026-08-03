'use client'
import * as React from 'react'
import { getEventsForDay, getEventsForWeek } from '@/server/actions/day-events'
import { WEEKDAY_ORDER, type DayOfWeek, type RecurrenceFrequency } from '@/lib/chat/weekdays'
import {
  expandOccurrencesInWeek,
  weekdayTokensForWeekly,
  type WeekOccurrence,
} from '@/lib/chat/proposal-week-occurrences'
import { computeUntilFromCount } from '@/lib/chat/proposal-until'
import { localWeekBounds } from '@/lib/weekly-fit'

/**
 * A scheduled task on a given day, as returned by `getEventsForDay`. Lives here
 * (not in the `'use server'` action file, which may export only async functions)
 * and is type-imported by the action for its return type.
 */
export interface DayEvent {
  readonly id: string
  readonly title: string
  readonly start: string
  readonly end: string
}

type PreviewState = 'ghost' | 'confirmed' | 'removed'

export interface DayProposalPreviewProps {
  readonly date: string
  readonly proposal: {
    readonly title: string
    readonly start: string
    readonly end: string
  }
  readonly state: PreviewState
  // Set when the proposal is a recurring series. Drives the "repeats …" badge
  // AND the two-mode layout below (see `expandOccurrencesInWeek`): a
  // recurrence with fewer than two occurrences in the anchor week (a
  // non-recurring proposal, or a `monthly` rule) stays in single-day mode; two
  // or more switches to the seven-column week strip.
  readonly recurrence?: RecurrenceFrequency
  // Weekly recurrence's selected weekdays — feeds occurrence expansion via the
  // shared `weekdayTokensForWeekly` fallback, the same one `EventProposalCard`
  // uses for `createSeries` (binding parity invariant, spec §A.2).
  readonly recurrenceDays?: readonly DayOfWeek[]
  // Per-frequency occurrence/week/month count — bounds occurrence expansion
  // and the extent footer via `computeUntilFromCount`.
  readonly recurrenceCount?: number
}

const MINUTES_PER_HOUR = 60
const HOUR_HEIGHT_PX = 28
const MIN_BLOCK_HEIGHT_PX = 14
const WEEK_LENGTH_DAYS = 7
const MIN_WEEK_STRIP_OCCURRENCES = 2

const MONTH_INDEX_OFFSET = 1
const PAD_WIDTH = 2
const PAD_CHAR = '0'

type BlockVariant = 'solid' | 'ghost' | 'confirmed' | 'conflict'

interface Block {
  readonly key: string
  readonly title: string
  readonly startMinutes: number
  readonly endMinutes: number
  readonly variant: BlockVariant
}

/** A `Block` tagged with the local day it belongs to, for week-strip bucketing. */
interface DatedBlock extends Block {
  readonly date: string
}

interface DayColumn {
  readonly date: string
  readonly isAnchor: boolean
  readonly blocks: readonly DatedBlock[]
}

/** Local `Date` (midnight) from a `'YYYY-MM-DD'` string via local constructor parts — never `new Date(str)`, which parses UTC midnight. */
function parseLocalDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year!, month! - MONTH_INDEX_OFFSET, day!)
}

/** Local `'YYYY-MM-DD'` from a `Date`'s LOCAL getters — never `toISOString`. */
function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + MONTH_INDEX_OFFSET).padStart(PAD_WIDTH, PAD_CHAR)
  const day = String(date.getDate()).padStart(PAD_WIDTH, PAD_CHAR)
  return `${year}-${month}-${day}`
}

/** Add `n` calendar days, local calendar math (DST-safe: no hour/minute components involved). */
function addLocalDays(base: Date, n: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + n)
}

/** Local-wall-clock minutes-since-midnight from a persisted UTC instant. */
function isoToMinutes(iso: string): number {
  const d = new Date(iso)
  return d.getHours() * MINUTES_PER_HOUR + d.getMinutes()
}

/** Minutes-since-midnight from a typed `HH:MM` local time. */
function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h! * MINUTES_PER_HOUR + m!
}

const VARIANT_CLASS: Record<BlockVariant, string> = {
  solid: 'border-border bg-surface-raised text-foreground',
  ghost: 'border-dashed border-primary bg-primary/5 text-foreground',
  confirmed: 'border-primary bg-primary/10 text-foreground',
  conflict: 'border-dashed border-warning bg-warning/10 text-foreground',
}

/** True when `[startMinutes, endMinutes)` overlaps any block's `[startMinutes, endMinutes)`. Pure — no rendering, no state. */
function overlaps(
  startMinutes: number,
  endMinutes: number,
  blocks: readonly { readonly startMinutes: number; readonly endMinutes: number }[],
): boolean {
  return blocks.some((block) => startMinutes < block.endMinutes && endMinutes > block.startMinutes)
}

function toExistingBlock(event: DayEvent): DatedBlock {
  return {
    key: event.id,
    title: event.title,
    startMinutes: isoToMinutes(event.start),
    endMinutes: isoToMinutes(event.end),
    variant: 'solid',
    date: formatLocalDate(new Date(event.start)),
  }
}

function groupBlocksByDay(
  blocks: readonly DatedBlock[],
): ReadonlyMap<string, readonly DatedBlock[]> {
  const map = new Map<string, DatedBlock[]>()
  for (const block of blocks) {
    const existing = map.get(block.date)
    if (existing) existing.push(block)
    else map.set(block.date, [block])
  }
  return map
}

/**
 * One block per occurrence — `ghost` by default, `confirmed` once the
 * proposal is confirmed (wins over conflict styling: a created event is a
 * real event). In week-strip mode only, a `conflict` variant marks an
 * occurrence that overlaps an existing event on its own day (spec §A.5 — the
 * strip's ~48px columns need the explicit signal; single-day mode's fuller
 * layout already shows the overlap visually, so it stays `ghost`, structurally
 * unchanged from the pre-week-strip render). Approval is never gated on a
 * conflict; the signal is informational only.
 */
function buildOccurrenceBlocks(
  occurrences: readonly WeekOccurrence[],
  proposal: { readonly title: string; readonly start: string; readonly end: string },
  state: PreviewState,
  existingBlocksByDay: ReadonlyMap<string, readonly DatedBlock[]>,
  isWeekMode: boolean,
): readonly DatedBlock[] {
  if (state === 'removed') return []
  const startMinutes = timeToMinutes(proposal.start)
  const endMinutes = timeToMinutes(proposal.end)
  return occurrences.map((occurrence) => {
    const dayBlocks = existingBlocksByDay.get(occurrence.date) ?? []
    const conflict = isWeekMode && overlaps(startMinutes, endMinutes, dayBlocks)
    const variant: BlockVariant =
      state === 'confirmed' ? 'confirmed' : conflict ? 'conflict' : 'ghost'
    return {
      key: `occurrence-${occurrence.date}`,
      title: proposal.title,
      startMinutes,
      endMinutes,
      variant,
      date: occurrence.date,
    }
  })
}

/** Sunday–Saturday columns of the local week containing `anchorDate`, each carrying its existing-event blocks and (if any) its occurrence ghost. */
function buildWeekColumns(
  anchorDate: string,
  existingBlocksByDay: ReadonlyMap<string, readonly DatedBlock[]>,
  occurrenceBlocks: readonly DatedBlock[],
): readonly DayColumn[] {
  const occurrenceBlocksByDay = groupBlocksByDay(occurrenceBlocks)
  const weekStart = localWeekBounds(parseLocalDate(anchorDate)).start
  return Array.from({ length: WEEK_LENGTH_DAYS }, (_, index) => {
    const columnDate = formatLocalDate(addLocalDays(weekStart, index))
    return {
      date: columnDate,
      isAnchor: columnDate === anchorDate,
      blocks: [
        ...(existingBlocksByDay.get(columnDate) ?? []),
        ...(occurrenceBlocksByDay.get(columnDate) ?? []),
      ],
    }
  })
}

/** `S 31` / `M 1` — weekday initial + day-of-month, matching `WEEKDAY_ORDER`'s `Date#getDay()` order. */
function formatColumnHeader(dateStr: string): string {
  const date = parseLocalDate(dateStr)
  const token = WEEKDAY_ORDER[date.getDay()]!
  return `${token.charAt(0)} ${date.getDate()}`
}

/** `2 of 5 occurrences overlap existing events` — week-strip mode only (spec §A.5); omitted (`null`) when nothing conflicts. */
function buildConflictFooter(conflictCount: number, occurrenceCount: number): string | null {
  if (conflictCount === 0) return null
  return `${conflictCount} of ${occurrenceCount} occurrences overlap existing events`
}

/**
 * Total occurrences the whole series produces (not just the visible week).
 * `weekly`'s `recurrenceCount` is a WEEK count (weeks × selected weekdays,
 * matching `createSeries`' semantics — see the recurring-proposals contract
 * in AGENTS.md); `daily`/`monthly` counts are already per-occurrence.
 */
function totalOccurrenceCount(
  recurrence: RecurrenceFrequency,
  recurrenceDays: readonly DayOfWeek[] | undefined,
  recurrenceCount: number,
  anchor: Date,
): number {
  if (recurrence === 'weekly') {
    return recurrenceCount * weekdayTokensForWeekly(recurrenceDays, anchor).length
  }
  return recurrenceCount
}

const FOOTER_DATE_FORMAT: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }

/** `Jul 28` — short month + day-of-month, no year (matches spec §A.3 examples). */
function formatFooterDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-US', FOOTER_DATE_FORMAT).format(parseLocalDate(dateStr))
}

/**
 * `+ N more through <date>` when the series continues past the visible week
 * (`monthly` gets the frequency named explicitly, since a bare `+ N more` on
 * a single-day-mode monthly card would otherwise read as ambiguous — the
 * week-strip modes' `repeats <freq>` badge already disambiguates the rest);
 * `repeats indefinitely` when unbounded; `null` when the whole series is
 * already shown in the visible week.
 */
function buildExtentFooter(
  recurrence: RecurrenceFrequency,
  recurrenceDays: readonly DayOfWeek[] | undefined,
  recurrenceCount: number | undefined,
  anchorDate: string,
  inWeekCount: number,
): string | null {
  if (recurrenceCount === undefined) return 'repeats indefinitely'
  const anchor = parseLocalDate(anchorDate)
  const total = totalOccurrenceCount(recurrence, recurrenceDays, recurrenceCount, anchor)
  const remaining = total - inWeekCount
  if (remaining <= 0) return null
  const until = computeUntilFromCount(anchorDate, recurrence, recurrenceCount)
  const freqSuffix = recurrence === 'monthly' ? ' monthly' : ''
  return `+ ${remaining} more${freqSuffix} through ${formatFooterDate(until)}`
}

/** Occurrence ghosts render NO title text in week-strip mode (colour only — the `title`/`aria-label` attrs carry it for hover/screen readers); existing events keep their truncated title in both modes. */
function renderBlock(block: Block, rangeStart: number, showTitle: boolean): React.JSX.Element {
  const top = ((block.startMinutes - rangeStart) / MINUTES_PER_HOUR) * HOUR_HEIGHT_PX
  const height = Math.max(
    ((block.endMinutes - block.startMinutes) / MINUTES_PER_HOUR) * HOUR_HEIGHT_PX,
    MIN_BLOCK_HEIGHT_PX,
  )
  return (
    <div
      key={block.key}
      data-testid="day-block"
      data-variant={block.variant}
      title={showTitle ? undefined : block.title}
      aria-label={showTitle ? undefined : block.title}
      className={`absolute right-1 left-1 overflow-hidden rounded border px-1.5 text-[10px] leading-tight ${VARIANT_CLASS[block.variant]}`}
      style={{ top, height }}
    >
      {showTitle && <span className="block truncate">{block.title}</span>}
    </div>
  )
}

/**
 * Two-mode preview slotted under the chat popup's `EventProposalCard`:
 * single-day mode (one column) for a non-recurring proposal or a recurrence
 * with fewer than two occurrences in the anchor week (e.g. `monthly`, or a
 * `weekly` rule whose only in-week hit is the anchor); week-strip mode
 * (seven Sunday–Saturday columns sharing one time axis) once
 * `expandOccurrencesInWeek` finds two or more. Existing events render solid;
 * the proposal renders as a dashed ghost (solid once confirmed, hidden once
 * removed). In week-strip mode only, an occurrence overlapping an existing
 * event on its own day gets an informational `conflict` variant plus a
 * strip footer count (spec §A.5) — approval is never gated on it, and a
 * confirmed proposal always wins over conflict styling; single-day mode
 * stays structurally unchanged from the pre-week-strip render (spec §A.1)
 * and never shows the conflict signal. Fetches on mount via
 * `getEventsForDay` (single-day) or `getEventsForWeek` (week-strip),
 * mode-matched; a fetch failure renders nothing so approval is never blocked.
 */
export function DayProposalPreview({
  date,
  proposal,
  state,
  recurrence,
  recurrenceDays,
  recurrenceCount,
}: DayProposalPreviewProps): React.JSX.Element | null {
  const occurrences = expandOccurrencesInWeek(date, recurrence, recurrenceDays, recurrenceCount)
  const isWeekMode = occurrences.length >= MIN_WEEK_STRIP_OCCURRENCES

  const [events, setEvents] = React.useState<readonly DayEvent[] | null>(null)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    let active = true
    const weekStartDate = formatLocalDate(localWeekBounds(parseLocalDate(date)).start)
    const fetchEvents = isWeekMode ? getEventsForWeek(weekStartDate) : getEventsForDay(date)
    fetchEvents
      .then((fetched) => {
        if (active) setEvents(fetched)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [date, isWeekMode])

  if (failed || events === null) return null

  const existingBlocks = events.map(toExistingBlock)
  const existingBlocksByDay = groupBlocksByDay(existingBlocks)
  const occurrenceBlocks = buildOccurrenceBlocks(
    occurrences,
    proposal,
    state,
    existingBlocksByDay,
    isWeekMode,
  )
  const allBlocks: readonly DatedBlock[] = [...existingBlocks, ...occurrenceBlocks]

  if (allBlocks.length === 0) return null

  const rangeStart = Math.min(...allBlocks.map((b) => b.startMinutes))
  const rangeEnd = Math.max(...allBlocks.map((b) => b.endMinutes))
  const rangeMinutes = Math.max(rangeEnd - rangeStart, MINUTES_PER_HOUR)
  const columnHeight = (rangeMinutes / MINUTES_PER_HOUR) * HOUR_HEIGHT_PX

  const conflictCount = occurrenceBlocks.filter((b) => b.variant === 'conflict').length
  const conflictFooterText = isWeekMode
    ? buildConflictFooter(conflictCount, occurrences.length)
    : null
  const extentFooterText =
    recurrence && state !== 'removed'
      ? buildExtentFooter(recurrence, recurrenceDays, recurrenceCount, date, occurrences.length)
      : null

  const columns = isWeekMode ? buildWeekColumns(date, existingBlocksByDay, occurrenceBlocks) : []

  return (
    <div
      data-testid="day-proposal-preview"
      aria-label="Proposed event in context of your day"
      className="border-border bg-background relative w-full rounded-md border"
      style={!isWeekMode ? { height: columnHeight } : undefined}
    >
      {recurrence && state !== 'removed' && (
        <span
          data-testid="recurrence-badge"
          className="bg-surface-raised text-muted-foreground border-border absolute top-1 right-1 z-10 rounded border px-1 text-[10px] leading-tight"
        >
          repeats {recurrence}
        </span>
      )}
      {isWeekMode ? (
        <>
          <div className="grid grid-cols-7 gap-px" data-testid="week-strip-header-row">
            {columns.map((column) => (
              <div
                key={column.date}
                data-testid="week-strip-header"
                data-anchor={column.isAnchor ? 'true' : undefined}
                className={
                  column.isAnchor
                    ? 'text-foreground text-center text-[10px] leading-tight font-semibold'
                    : 'text-muted-foreground text-center text-[10px] leading-tight'
                }
              >
                {formatColumnHeader(column.date)}
              </div>
            ))}
          </div>
          <div className="relative mt-1 grid grid-cols-7 gap-px" style={{ height: columnHeight }}>
            {columns.map((column) => (
              <div key={column.date} data-testid="week-strip-column" className="relative">
                {column.blocks.map((block) =>
                  renderBlock(block, rangeStart, block.variant === 'solid'),
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        allBlocks.map((block) => renderBlock(block, rangeStart, true))
      )}
      {conflictFooterText && (
        <p data-testid="conflict-footer" className="text-warning-foreground mt-1 px-1 text-[10px]">
          {conflictFooterText}
        </p>
      )}
      {extentFooterText && (
        <p data-testid="extent-footer" className="text-muted-foreground mt-1 px-1 text-[10px]">
          {extentFooterText}
        </p>
      )}
    </div>
  )
}
