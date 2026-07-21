// Pure weekly-fit derivation (wave 3 activity model) — no server imports.
// `localWeekBounds` reads the LOCAL wall-clock calendar via Date getters only
// (getFullYear/getMonth/getDate/getDay — never UTC): the invariant this file
// serves is "this week" as the user experiences it on their own clock, not a
// UTC-day boundary that can roll over hours before/after local midnight.

const DAYS_PER_WEEK = 7

export interface WeeklyFit {
  readonly completed: number
  readonly target: number
}

/** Local Sunday 00:00 (inclusive) through the following Sunday 00:00 (exclusive). */
export function localWeekBounds(now: Date): { readonly start: Date; readonly end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + DAYS_PER_WEEK)
  return { start, end }
}

/**
 * Completed-this-week count for one activity against its weekly target.
 * Counts only events that (a) belong to `activity.id`, (b) are `completed`,
 * and (c) have a `startAt` inside the local week bounds computed from `now`.
 */
export function computeWeeklyFit(
  activity: { readonly id: string; readonly weeklyTargetSessions: number },
  events: readonly {
    readonly activityId: string | null
    readonly startAt: Date | null
    readonly status: string
  }[],
  now: Date,
): WeeklyFit {
  const { start, end } = localWeekBounds(now)
  const completed = events.filter(
    (event) =>
      event.activityId === activity.id &&
      event.status === 'completed' &&
      event.startAt !== null &&
      event.startAt.getTime() >= start.getTime() &&
      event.startAt.getTime() < end.getTime(),
  ).length
  return { completed, target: activity.weeklyTargetSessions }
}
