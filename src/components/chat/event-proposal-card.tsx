'use client'
import * as React from 'react'
import { Check, X } from 'lucide-react'
import type { Message } from 'ai'
import { Badge, Button, Card, CardContent, Input } from '@/lib/ui'
import { createTask } from '@/server/actions/tasks'
import type { DayOfWeek } from '@/lib/schemas/task'

/** The recurrence frequencies createTask fans out (matches the proposeEvent tool enum). */
export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly'

// Ordered weekday tokens — index order drives the contiguous-range collapse in
// the recurrence summary (e.g. Mon…Fri → "Mon–Fri").
const WEEKDAY_ORDER: readonly DayOfWeek[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
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

// The count segment's unit noun per frequency — matches createTask's actual
// fan-out semantics (src/server/actions/tasks.ts): weekly's recurrenceCount is
// a WEEK count (weeks × selected weekdays), while daily/monthly's is a plain
// occurrence count in that frequency's own unit.
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
  readonly append?: (message: Pick<Message, 'role' | 'content'>) => void
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
    const [y, mo, d] = date.split('-').map(Number)
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    const startAt = new Date(y!, mo! - 1, d!, sh!, sm!).toISOString()
    const endAt = new Date(y!, mo! - 1, d!, eh!, em!).toISOString()
    const result = await createTask({
      title,
      type: 'task',
      startAt,
      endAt,
      description: description ?? null,
      // Recurrence keys are omitted entirely for a single event so createTask
      // takes its non-fan-out path unchanged; when present, its existing series
      // fan-out creates the whole series.
      ...(recurrence !== undefined && { recurrence }),
      ...(recurrenceDays !== undefined && { recurrenceDays }),
      ...(recurrenceCount !== undefined && { recurrenceCount }),
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
    onConfirmed({ id: result.data.id, title, start: startAt, end: endAt })
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
