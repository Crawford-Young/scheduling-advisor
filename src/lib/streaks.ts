const MS_PER_DAY = 86_400_000

export interface StreakResult {
  readonly current: number
  readonly best: number
}

interface Occurrence {
  readonly startAt: Date | null
  readonly status: string
}

function utcDayIndex(d: Date): number {
  return Math.floor(d.getTime() / MS_PER_DAY)
}

/**
 * Consecutive-scheduled-occurrence streak over one recurrence group.
 * current: walk backward from the newest due occurrence; completed counts,
 * a pending occurrence dated today is skipped (day isn't over), anything
 * else breaks the chain. best: longest completed run over due history, no grace.
 */
export function computeGroupStreak(occurrences: readonly Occurrence[], now: Date): StreakResult {
  const due = occurrences
    .filter(
      (o): o is { startAt: Date; status: string } =>
        o.startAt !== null && o.startAt.getTime() <= now.getTime(),
    )
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())

  let best = 0
  let run = 0
  for (const o of due) {
    if (o.status === 'completed') {
      run += 1
      best = Math.max(best, run)
    } else {
      run = 0
    }
  }

  let current = 0
  const today = utcDayIndex(now)
  for (const o of [...due].reverse()) {
    if (o.status === 'completed') {
      current += 1
      continue
    }
    if (utcDayIndex(o.startAt) === today) continue
    break
  }

  return { current, best }
}

export interface IdOccurrence {
  readonly id: string
  readonly startAt: Date | null
  readonly status: string
}

interface DatedIdOccurrence {
  readonly id: string
  readonly startAt: Date
  readonly status: string
}

/**
 * Progressive per-occurrence streak over one recurrence group. Occurrences
 * with a null startAt are excluded from the chronological walk and reported
 * as 0. Walking ascending by startAt: a completed occurrence extends the
 * run; a non-completed occurrence dated before today breaks it back to 0; a
 * non-completed occurrence dated today or later extends the run as a
 * projection ("complete me for N+1").
 */
export function computePerOccurrenceStreaks(
  occurrences: readonly IdOccurrence[],
  now: Date,
): Record<string, number> {
  const result: Record<string, number> = {}
  const dated: DatedIdOccurrence[] = []
  for (const o of occurrences) {
    if (o.startAt === null) {
      result[o.id] = 0
    } else {
      dated.push({ id: o.id, startAt: o.startAt, status: o.status })
    }
  }
  dated.sort((a, b) => a.startAt.getTime() - b.startAt.getTime())

  const today = utcDayIndex(now)
  let run = 0
  for (const o of dated) {
    if (o.status === 'completed') {
      run += 1
      result[o.id] = run
    } else if (utcDayIndex(o.startAt) < today) {
      result[o.id] = 0
      run = 0
    } else {
      run += 1
      result[o.id] = run
    }
  }
  return result
}
