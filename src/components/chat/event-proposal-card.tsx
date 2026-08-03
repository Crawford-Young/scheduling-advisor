'use client'
import * as React from 'react'
import { Check, X } from 'lucide-react'
import { Badge, Button, Card, CardContent, Input } from '@/lib/ui'
import { createEvent } from '@/server/actions/events'
import { createSeries } from '@/server/actions/series'
import { computeUntilFromCount } from '@/lib/chat/proposal-until'
import { weekdayTokensForWeekly } from '@/lib/chat/proposal-week-occurrences'
import { WEEKDAY_ORDER, type DayOfWeek, type RecurrenceFrequency } from '@/lib/chat/weekdays'

// Re-exported so existing importers (tool-result-renderer, day-proposal-preview)
// keep pulling the recurrence type from the card.
export type { RecurrenceFrequency }

/**
 * Shape of a message appended to the chat transcript from an approval card.
 * With the ai@7 client stack there is no `append` helper on `useChat`; the
 * surface wraps `sendMessage`, and every card-driven line is a user turn
 * ([CONFIRMED]/[DENY]/[CONFIRM]).
 */
export interface ChatAppendMessage {
  readonly role: 'user'
  readonly content: string
}

// Smallest run of consecutive weekdays rendered as a "First–Last" range rather
// than a middot-joined list.
const MIN_RANGE_LENGTH = 3

/** Human weekday summary: contiguous runs collapse to `Mon–Fri`, else `Mon · Fri`. */
function formatWeekdays(days: readonly DayOfWeek[]): string {
  const sorted = [...days].sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b))
  const indices = sorted.map((d) => WEEKDAY_ORDER.indexOf(d))
  const contiguous =
    sorted.length >= MIN_RANGE_LENGTH &&
    indices.every((n, i) => i === 0 || n === indices[i - 1]! + 1)
  if (contiguous) return `${sorted[0]}–${sorted[sorted.length - 1]}`
  return sorted.join(' · ')
}

// The count segment's unit noun per frequency — matches the proposeEvent
// recurrence semantics: weekly's recurrenceCount is a WEEK count (weeks ×
// selected weekdays), while daily/monthly's is a plain occurrence count in that
// frequency's own unit.
const COUNT_UNIT: Record<RecurrenceFrequency, string> = {
  weekly: 'weeks',
  daily: 'days',
  monthly: 'months',
}

/** The count segment of the summary: `8 weeks` / `4 days` / `6 months`. */
function formatCount(recurrence: RecurrenceFrequency, count: number): string {
  return `${count} ${COUNT_UNIT[recurrence]}`
}

/** `Repeats weekly · Mon–Fri · 8 weeks` — frequency, weekly-only weekday list, optional count. */
function buildRecurrenceSummary(
  recurrence: RecurrenceFrequency,
  recurrenceDays: readonly DayOfWeek[] | undefined,
  recurrenceCount: number | undefined,
): string {
  const segments = [`Repeats ${recurrence}`]
  if (recurrence === 'weekly' && recurrenceDays && recurrenceDays.length > 0) {
    segments.push(formatWeekdays(recurrenceDays))
  }
  if (recurrenceCount !== undefined) {
    segments.push(formatCount(recurrence, recurrenceCount))
  }
  return segments.join(' · ')
}

// ─── createSeries mapping (recurring confirm) ──────────────────────────────
// Mirrors calendar-client.tsx's `toSeriesSubmitInput` conventions: local
// calendar/wall-clock math only (never toISOString/UTC-string parsing for date
// components), and a per-freq payload that OMITS every field the freq doesn't
// use (createSeriesSchema's superRefine rejects stray extras from another
// freq's rule shape).

const MINUTES_PER_HOUR = 60
const MS_PER_MINUTE = 60 * 1000
// A local `YYYY-MM-DD` `until` date's END OF DAY, inclusive — the series stops
// generating occurrences after this local instant.
const UNTIL_END_HOUR = 23
const UNTIL_END_MINUTE = 59
const UNTIL_END_SECOND = 59
const UNTIL_END_MS = 999
// `until` from computeUntilFromCount is `'YYYY-MM-DD'` (1-based month); `Date`'s
// month constructor arg is 0-based.
const UNTIL_MONTH_OFFSET = 1

/** Local Date from a 'YYYY-MM-DD' date + 'HH:MM' time (wall-clock, host TZ). */
function localDateTime(date: string, time: string): Date {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  return new Date(y!, mo! - 1, d!, h!, min!)
}

/** Minutes since local midnight from an 'HH:MM' time string. */
function minutesSinceMidnight(time: string): number {
  const [h, min] = time.split(':').map(Number)
  return h! * MINUTES_PER_HOUR + min!
}

// Local end-of-day `Date` for a `'YYYY-MM-DD'` string (never `new
// Date(dateStr)`, which parses UTC midnight — local-wall-clock invariant).
function localEndOfDay(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(
    year!,
    month! - UNTIL_MONTH_OFFSET,
    day!,
    UNTIL_END_HOUR,
    UNTIL_END_MINUTE,
    UNTIL_END_SECOND,
    UNTIL_END_MS,
  )
}

interface SeriesRuleFields {
  readonly weekdays?: readonly number[]
  readonly dayOfMonth?: number
}

/** Per-freq rule fields only — daily sends neither, matching createSeriesSchema. */
function buildSeriesRuleFields(
  recurrence: RecurrenceFrequency,
  recurrenceDays: readonly DayOfWeek[] | undefined,
  anchorStart: Date,
): SeriesRuleFields {
  if (recurrence === 'weekly') {
    const tokens = weekdayTokensForWeekly(recurrenceDays, anchorStart)
    return { weekdays: tokens.map((token) => WEEKDAY_ORDER.indexOf(token)) }
  }
  if (recurrence === 'monthly') {
    return { dayOfMonth: anchorStart.getDate() }
  }
  return {}
}

interface RecurringProposalInput {
  readonly title: string
  readonly date: string
  readonly start: string
  readonly description?: string
  readonly recurrence: RecurrenceFrequency
  readonly recurrenceDays?: readonly DayOfWeek[]
  readonly recurrenceCount?: number
}

// createSeries' input shape as this card emits it (analog of calendar-client's
// SeriesSubmitInput) — typed so a field-name typo fails tsc, not just the
// runtime zod parse.
interface SeriesSubmitInput extends SeriesRuleFields {
  readonly title: string
  readonly description?: string
  readonly freq: RecurrenceFrequency
  readonly startMinutes: number
  readonly durationMin: number
  readonly timeZone: string
  readonly anchorStartAt: string
  readonly until: Date | null
}

/** Maps a recurring proposal onto `createSeries`' input shape (see module doc above). */
function buildSeriesInput(
  input: RecurringProposalInput,
  anchorStart: Date,
  durationMin: number,
): SeriesSubmitInput {
  return {
    title: input.title,
    ...(input.description !== undefined && { description: input.description }),
    freq: input.recurrence,
    ...buildSeriesRuleFields(input.recurrence, input.recurrenceDays, anchorStart),
    startMinutes: minutesSinceMidnight(input.start),
    durationMin,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    anchorStartAt: anchorStart.toISOString(),
    until:
      input.recurrenceCount !== undefined
        ? localEndOfDay(computeUntilFromCount(input.date, input.recurrence, input.recurrenceCount))
        : null,
  }
}

export interface EventProposalCardProps {
  readonly title: string
  readonly date: string
  readonly start: string
  readonly end: string
  readonly description?: string
  readonly recurrence?: RecurrenceFrequency
  readonly recurrenceDays?: readonly DayOfWeek[]
  readonly recurrenceCount?: number
  readonly onConfirmed: (created: { id: string; title: string; start: string; end: string }) => void
  readonly onDenied: (reason: string) => void
  readonly append?: (message: ChatAppendMessage) => void
  readonly preview?: React.ReactNode // Task 8 slots DayProposalPreview here (popup only)
}

type CardState = 'pending' | 'denying' | 'confirmed' | 'denied' | 'error'

export function EventProposalCard({
  title,
  date,
  start,
  end,
  description,
  recurrence,
  recurrenceDays,
  recurrenceCount,
  onConfirmed,
  onDenied,
  append,
  preview,
}: EventProposalCardProps): React.JSX.Element {
  const [state, setState] = React.useState<CardState>('pending')
  const [reason, setReason] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  async function handleConfirm(): Promise<void> {
    setSubmitting(true)
    const anchorStart = localDateTime(date, start)
    const anchorEnd = localDateTime(date, end)
    // No recurrence → the plain single-event path (createEvent), byte-unchanged.
    // A recurrence proposal now creates a REAL event series (createSeries) —
    // the sliding-window generation sweep materialises its occurrences server-
    // side; there is no more client-side occurrence fan-out.
    const result = recurrence
      ? await createSeries(
          buildSeriesInput(
            {
              title,
              date,
              start,
              recurrence,
              ...(description !== undefined && { description }),
              ...(recurrenceDays !== undefined && { recurrenceDays }),
              ...(recurrenceCount !== undefined && { recurrenceCount }),
            },
            anchorStart,
            (anchorEnd.getTime() - anchorStart.getTime()) / MS_PER_MINUTE,
          ),
        )
      : await createEvent({
          title,
          startAt: anchorStart.toISOString(),
          endAt: anchorEnd.toISOString(),
          ...(description !== undefined && { description }),
        })
    setSubmitting(false)
    if ('error' in result) {
      setState('error')
      return
    }
    setState('confirmed')
    const recurringNote = recurrence ? ' (recurring)' : ''
    append?.({
      role: 'user',
      content: `[CONFIRMED] ${title} — ${date} ${start}–${end}${recurringNote}`,
    })
    onConfirmed({
      id: result.data.id,
      title,
      start: anchorStart.toISOString(),
      end: anchorEnd.toISOString(),
    })
  }

  function handleDenyClick(): void {
    setState('denying')
  }

  function handleCancel(): void {
    setState('pending')
    setReason('')
  }

  function handleSend(): void {
    setState('denied')
    append?.({ role: 'user', content: reason ? `[DENY] reason: ${reason}` : '[DENY]' })
    onDenied(reason)
  }

  const timeLabel = `${date} · ${start}–${end}`
  const recurrenceSummary = recurrence
    ? buildRecurrenceSummary(recurrence, recurrenceDays, recurrenceCount)
    : null
  const showActions = state === 'pending' || state === 'denying'

  return (
    <Card className="shadow-sm">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-card-foreground truncate text-sm font-medium">{title}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">{timeLabel}</p>
            {recurrenceSummary && (
              <p className="text-muted-foreground mt-0.5 text-xs">{recurrenceSummary}</p>
            )}
            {description && <p className="text-muted-foreground mt-1 text-xs">{description}</p>}
          </div>

          {showActions ? (
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Confirm"
                onClick={handleConfirm}
                disabled={submitting}
                className="h-8 w-8 rounded-full bg-green-500/10 text-green-500 hover:bg-green-500/20"
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Deny"
                onClick={handleDenyClick}
                disabled={submitting}
                className="h-8 w-8 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : state === 'confirmed' ? (
            <Badge
              variant="outline"
              className="shrink-0 rounded-full border-green-500/30 bg-green-500/10 text-green-500"
            >
              Added
            </Badge>
          ) : state === 'denied' ? (
            <Badge
              variant="outline"
              className="shrink-0 rounded-full border-red-500/30 bg-red-500/10 text-red-500"
            >
              Declined
            </Badge>
          ) : (
            <Button
              variant="outline"
              size="sm"
              aria-label="Retry"
              onClick={handleConfirm}
              disabled={submitting}
              className="shrink-0"
            >
              Retry
            </Button>
          )}
        </div>

        {preview && <div className="mt-3">{preview}</div>}

        {state === 'error' && (
          <p className="text-destructive mt-2 text-xs">
            Couldn&apos;t create the event. Try again.
          </p>
        )}

        {state === 'denying' && (
          <div className="mt-3 space-y-2">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why not? (optional)"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" aria-label="Cancel" onClick={handleCancel}>
                Cancel
              </Button>
              <Button size="sm" aria-label="Send" onClick={handleSend}>
                Send
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
