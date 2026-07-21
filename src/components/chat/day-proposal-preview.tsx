'use client'
import * as React from 'react'
import { getEventsForDay } from '@/server/actions/day-events'
import type { RecurrenceFrequency } from '@/components/chat/event-proposal-card'

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
  // Set when the proposal is a recurring series — surfaces a "repeats …" badge on
  // the anchor-day column. The column still shows only the anchor occurrence; the
  // full set of occurrences lands on the calendar after the createEvents fan-out.
  readonly recurrence?: RecurrenceFrequency
}

const MINUTES_PER_HOUR = 60
const HOUR_HEIGHT_PX = 28
const MIN_BLOCK_HEIGHT_PX = 14

type BlockVariant = 'solid' | 'ghost' | 'confirmed'

interface Block {
  readonly key: string
  readonly title: string
  readonly startMinutes: number
  readonly endMinutes: number
  readonly variant: BlockVariant
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
}

/**
 * Compact single-day column showing the day's existing events (solid) alongside
 * a proposed event (dashed ghost → solid once confirmed, hidden once removed).
 * Slotted under the chat popup's `EventProposalCard` so the user sees the
 * proposal in the context of their day. Fetches on mount; a fetch failure
 * renders nothing so approval is never blocked.
 */
export function DayProposalPreview({
  date,
  proposal,
  state,
  recurrence,
}: DayProposalPreviewProps): React.JSX.Element | null {
  const [events, setEvents] = React.useState<readonly DayEvent[] | null>(null)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    let active = true
    getEventsForDay(date)
      .then((fetched) => {
        if (active) setEvents(fetched)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [date])

  if (failed || events === null) return null

  const blocks: Block[] = events.map((e) => ({
    key: e.id,
    title: e.title,
    startMinutes: isoToMinutes(e.start),
    endMinutes: isoToMinutes(e.end),
    variant: 'solid',
  }))

  if (state !== 'removed') {
    blocks.push({
      key: 'proposal',
      title: proposal.title,
      startMinutes: timeToMinutes(proposal.start),
      endMinutes: timeToMinutes(proposal.end),
      variant: state === 'confirmed' ? 'confirmed' : 'ghost',
    })
  }

  if (blocks.length === 0) return null

  const rangeStart = Math.min(...blocks.map((b) => b.startMinutes))
  const rangeEnd = Math.max(...blocks.map((b) => b.endMinutes))
  const rangeMinutes = Math.max(rangeEnd - rangeStart, MINUTES_PER_HOUR)
  const columnHeight = (rangeMinutes / MINUTES_PER_HOUR) * HOUR_HEIGHT_PX

  return (
    <div
      data-testid="day-proposal-preview"
      aria-label="Proposed event in context of your day"
      className="border-border bg-background relative w-full rounded-md border"
      style={{ height: columnHeight }}
    >
      {recurrence && state !== 'removed' && (
        <span
          data-testid="recurrence-badge"
          className="bg-surface-raised text-muted-foreground border-border absolute top-1 right-1 z-10 rounded border px-1 text-[10px] leading-tight"
        >
          repeats {recurrence}
        </span>
      )}
      {blocks.map((block) => {
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
            className={`absolute right-1 left-1 overflow-hidden rounded border px-1.5 text-[10px] leading-tight ${VARIANT_CLASS[block.variant]}`}
            style={{ top, height }}
          >
            <span className="block truncate">{block.title}</span>
          </div>
        )
      })}
    </div>
  )
}
