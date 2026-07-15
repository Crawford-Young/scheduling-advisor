import type { DayOfWeek } from '@/lib/schemas/task'
import { zonedWallClock } from '@/lib/series-generation'
import { computeGroupStreak } from '@/lib/streaks'

const MS_PER_DAY = 86_400_000

/** Canonical Sun-first weekday order for pattern labels. */
const DAY_ORDER: readonly DayOfWeek[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export type ActivityStatus = 'pending' | 'in_progress' | 'completed'

/** Minimal structural view of a task row needed to collapse recurrence groups. */
export interface GroupableTask {
  readonly id: string
  readonly status: ActivityStatus
  readonly startAt: Date | null
  readonly recurrence: string | null
  readonly recurrenceGroupId: string | null
  readonly recurrenceDays: readonly DayOfWeek[] | null
  readonly timeZone: string | null
}

/** One collapsed recurrence group — the series row the activities table renders. */
export interface SeriesGroup<T extends GroupableTask> {
  readonly representative: T
  /** Occurrence whose day (series TZ, UTC fallback) is today; anchors ✓. */
  readonly todayOccurrenceId: string | null
  readonly todayOccurrenceStatus: ActivityStatus | null
  /** Representative start ISO when due today/future; null when the series ended. */
  readonly nextDueIso: string | null
  /** Group current streak (computeGroupStreak, today-pending grace). */
  readonly groupStreak: number
  /** e.g. "Weekly · Mon/Wed"; bare capitalized frequency when no day set. */
  readonly patternLabel: string
}

export type CollapsedActivity<T extends GroupableTask> =
  | { readonly kind: 'one-off'; readonly task: T }
  | { readonly kind: 'series'; readonly group: SeriesGroup<T> }

// Day index (days since UTC epoch) of `d`'s wall-clock date in the series TZ,
// UTC fallback when null — the isPastDay pattern from src/lib/streaks.ts.
function dayIndex(timeZone: string | null, d: Date): number {
  if (timeZone !== null) {
    const wc = zonedWallClock(timeZone, d)
    return Date.UTC(wc.year, wc.month, wc.day) / MS_PER_DAY
  }
  return Math.floor(d.getTime() / MS_PER_DAY)
}

/** "Weekly · Mon/Wed" from a frequency + optional weekday set. */
export function buildPatternLabel(
  recurrence: string | null,
  recurrenceDays: readonly DayOfWeek[] | null,
): string {
  if (recurrence === null) return ''
  const freq = recurrence.charAt(0).toUpperCase() + recurrence.slice(1)
  if (!recurrenceDays || recurrenceDays.length === 0) return freq
  const days = DAY_ORDER.filter((d) => recurrenceDays.includes(d)).join('/')
  return `${freq} · ${days}`
}

interface RepresentativePick<T extends GroupableTask> {
  readonly representative: T
  readonly todayOccurrence: T | null
  readonly nextDueIso: string | null
}

function pickRepresentative<T extends GroupableTask>(
  rows: readonly [T, ...T[]],
  now: Date,
): RepresentativePick<T> {
  const dated = rows
    .filter((r): r is T & { readonly startAt: Date } => r.startAt !== null)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
  const first = dated[0]
  if (first === undefined) {
    return { representative: rows[0], todayOccurrence: null, nextDueIso: null }
  }
  const todayRows = dated.filter(
    (r) => dayIndex(r.timeZone, r.startAt) === dayIndex(r.timeZone, now),
  )
  const todayPick = todayRows.find((r) => r.status !== 'completed') ?? todayRows[0]
  if (todayPick !== undefined) {
    return {
      representative: todayPick,
      todayOccurrence: todayPick,
      nextDueIso: todayPick.startAt.toISOString(),
    }
  }
  const future = dated.find((r) => dayIndex(r.timeZone, r.startAt) > dayIndex(r.timeZone, now))
  if (future !== undefined) {
    return {
      representative: future,
      todayOccurrence: null,
      nextDueIso: future.startAt.toISOString(),
    }
  }
  const last = dated[dated.length - 1] ?? first
  return { representative: last, todayOccurrence: null, nextDueIso: null }
}

/**
 * Collapse fanned recurrence-group rows into one series entry per group.
 * Output preserves input order; a series entry sits at its group's
 * first-encountered position. One-off rows (null group id) pass through.
 */
export function collapseSeries<T extends GroupableTask>(
  tasks: readonly T[],
  now: Date,
): readonly CollapsedActivity<T>[] {
  const byGroup = new Map<string, [T, ...T[]]>()
  for (const t of tasks) {
    if (t.recurrenceGroupId === null) continue
    const list = byGroup.get(t.recurrenceGroupId)
    if (list === undefined) {
      byGroup.set(t.recurrenceGroupId, [t])
    } else {
      list.push(t)
    }
  }

  const result: CollapsedActivity<T>[] = []
  const emitted = new Set<string>()
  for (const t of tasks) {
    if (t.recurrenceGroupId === null) {
      result.push({ kind: 'one-off', task: t })
      continue
    }
    if (emitted.has(t.recurrenceGroupId)) continue
    emitted.add(t.recurrenceGroupId)
    // Non-null: byGroup was built from this same list in the pass above — an
    // `undefined` guard here would be an unreachable statement and block the
    // 100%-statements gate.
    const rows = byGroup.get(t.recurrenceGroupId)!
    const { representative, todayOccurrence, nextDueIso } = pickRepresentative(rows, now)
    result.push({
      kind: 'series',
      group: {
        representative,
        todayOccurrenceId: todayOccurrence?.id ?? null,
        todayOccurrenceStatus: todayOccurrence?.status ?? null,
        nextDueIso,
        groupStreak: computeGroupStreak(rows, now).current,
        patternLabel: buildPatternLabel(representative.recurrence, representative.recurrenceDays),
      },
    })
  }
  return result
}
