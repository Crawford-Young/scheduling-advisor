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
