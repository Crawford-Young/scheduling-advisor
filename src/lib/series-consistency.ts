// Pure shared-field drift detection for recurrence groups (wave 2.6 S8). All
// grouped-row shared-field writes already funnel through `updateSeries`
// (src/server/actions/series-mutations.ts) and are server-guarded there — this
// module is the observability net, not enforcement: it never mutates and
// never throws, so a broken comparison can never crash a calendar/activities
// page render.
import * as Sentry from '@sentry/nextjs'
import { logger } from '@/lib/logger'

export interface SeriesDrift {
  readonly groupId: string
  readonly fields: readonly string[]
}

// Minimal, readonly shape the comparison needs — structurally compatible with
// the raw `tasks` rows `getUserTasks()` returns, so callers can pass task rows
// straight through with no mapping. Per-occurrence fields (`status`, `locked`,
// streak-related) are deliberately absent: they're allowed to differ across a
// group's rows and must never be compared.
export interface DriftRow {
  readonly recurrenceGroupId: string | null
  readonly title: string
  readonly color: string | null
  readonly location: string | null
  readonly description: string | null
  readonly allDay: boolean
  readonly recurrence: string | null
  readonly recurrenceDays: readonly string[] | null
  readonly recurrenceCount: number | null
  readonly startAt: Date | null
  readonly endAt: Date | null
}

// Direct-equality shared fields — each entry doubles as the human-readable
// field name reported in a `SeriesDrift.fields` entry.
const EQUALITY_FIELDS = [
  'title',
  'color',
  'location',
  'description',
  'allDay',
  'recurrence',
  'recurrenceCount',
] as const

// A group of exactly one row has nothing to compare against — trivially clean.
const MIN_GROUP_SIZE_FOR_DRIFT = 2

const MS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const MS_PER_MINUTE = SECONDS_PER_MINUTE * MS_PER_SECOND
const MS_PER_HOUR = MINUTES_PER_HOUR * MS_PER_MINUTE

function anyDiffer<T>(values: readonly T[]): boolean {
  return values.some((value) => value !== values[0])
}

// A null recurrenceDays and an empty array both mean "no fixed weekday set" —
// treated as equivalent so a cleared picker never reads as drift.
function normalizeDaySet(days: readonly string[] | null): ReadonlySet<string> {
  return new Set(days ?? [])
}

function daySetsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const value of a) {
    if (!b.has(value)) return false
  }
  return true
}

function recurrenceDaysDiffer(rows: readonly DriftRow[]): boolean {
  const first = normalizeDaySet(rows[0]!.recurrenceDays)
  return rows.some((row) => !daySetsEqual(normalizeDaySet(row.recurrenceDays), first))
}

// UTC time-of-day only — occurrences of the same series land on different
// calendar dates by design, so the date component is never compared.
function utcTimeOfDayMs(row: DriftRow): number | null {
  if (row.startAt === null) return null
  const { startAt } = row
  return (
    startAt.getUTCHours() * MS_PER_HOUR +
    startAt.getUTCMinutes() * MS_PER_MINUTE +
    startAt.getUTCSeconds() * MS_PER_SECOND +
    startAt.getUTCMilliseconds()
  )
}

// Null whenever either endpoint is missing. A numeric duration never equals
// null, so "every row must agree on endAt nullness" falls out of the same
// plain equality check the other fields use.
function durationMs(row: DriftRow): number | null {
  if (row.startAt === null || row.endAt === null) return null
  return row.endAt.getTime() - row.startAt.getTime()
}

function groupById(rows: readonly DriftRow[]): ReadonlyMap<string, DriftRow[]> {
  const groups = new Map<string, DriftRow[]>()
  for (const row of rows) {
    if (row.recurrenceGroupId === null) continue
    const existing = groups.get(row.recurrenceGroupId)
    if (existing) {
      existing.push(row)
    } else {
      groups.set(row.recurrenceGroupId, [row])
    }
  }
  return groups
}

/**
 * Pure comparison: groups rows by `recurrenceGroupId` and reports every
 * shared field on which a group's rows disagree. Never mutates, never throws.
 */
export function findSeriesDrift(rows: readonly DriftRow[]): SeriesDrift[] {
  const groups = groupById(rows)
  const drifts: SeriesDrift[] = []

  for (const [groupId, groupRows] of groups) {
    if (groupRows.length < MIN_GROUP_SIZE_FOR_DRIFT) continue

    const fields: string[] = []
    for (const field of EQUALITY_FIELDS) {
      if (anyDiffer(groupRows.map((row) => row[field]))) fields.push(field)
    }
    if (recurrenceDaysDiffer(groupRows)) fields.push('recurrenceDays')
    if (anyDiffer(groupRows.map((row) => utcTimeOfDayMs(row)))) fields.push('timeOfDay')
    if (anyDiffer(groupRows.map((row) => durationMs(row)))) fields.push('duration')

    if (fields.length > 0) drifts.push({ groupId, fields })
  }

  return drifts
}

/**
 * Read-path-safe wrapper: reports every drifted group (dev-signal
 * `logger.error` + `Sentry.captureMessage`) and never throws. Wired into the
 * calendar page after `getUserTasks()` — observability only, no behavior
 * change.
 */
export function reportSeriesDrift(rows: readonly DriftRow[]): void {
  const drifts = findSeriesDrift(rows)
  for (const drift of drifts) {
    logger.error(drift, 'series drift detected across recurrence group')
    Sentry.captureMessage('series drift', {
      extra: { groupId: drift.groupId, fields: drift.fields },
    })
  }
}
