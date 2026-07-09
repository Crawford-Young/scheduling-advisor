'use server'
import { auth } from '@/auth'
import { db } from '@/db'
import { tasks } from '@/db/schema'
import { updateSeriesSchema } from '@/lib/schemas/task'
import { and, eq } from 'drizzle-orm'
import { ratelimit } from '@/lib/redis'
import { logger } from '@/lib/logger'
import {
  DAY_TOKENS,
  generateSeriesRows,
  resolveSeriesWindow,
  type SeriesBaseFields,
} from '@/lib/series-generation'

// The fields updateSeries propagates across every row of a recurrence group.
// `status`, streak and `locked` are per-occurrence and never appear here — this
// writer never touches them. S4/S5/S6/S7 consume this list verbatim.
export const SERIES_SHARED_FIELDS = [
  'title',
  'color',
  'location',
  'description',
  'allDay',
  'recurrence',
  'recurrenceDays',
  'recurrenceCount',
] as const
export type SeriesSharedField = (typeof SERIES_SHARED_FIELDS)[number]

type TaskRow = (typeof tasks)['$inferSelect']
type TaskActionResult = { data: TaskRow } | { error: unknown }

const WEEKLY = 'weekly'

// Order-insensitive weekday-set equality (null == null; null != []).
function sameDaySet(a: readonly string[] | null, b: readonly string[] | null): boolean {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  if (a.length !== b.length) return false
  const setB = new Set(b)
  return a.every((token) => setB.has(token))
}

// Applies a UTC time-of-day (and duration) to a row's own calendar date, leaving
// the date untouched. Cross-midnight safe: the end is start + duration in ms.
function rewriteTimeOfDay(
  rowStart: Date,
  templateTime: Date,
  durationMs: number | null,
): { start: Date; end: Date | null } {
  const start = new Date(rowStart)
  start.setUTCHours(
    templateTime.getUTCHours(),
    templateTime.getUTCMinutes(),
    templateTime.getUTCSeconds(),
    templateTime.getUTCMilliseconds(),
  )
  const end = durationMs === null ? null : new Date(start.getTime() + durationMs)
  return { start, end }
}

export async function updateSeries(input: unknown): Promise<TaskActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Unauthorized' }

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) return { error: 'Too many requests' }

  const parsed = updateSeriesSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }

  const data = parsed.data
  const userId = session.user.id
  const now = new Date()

  const [anchor] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, data.taskId), eq(tasks.userId, userId)))
    .limit(1)

  if (!anchor) return { error: 'Not found' }

  // Materialize: an ungrouped row joins a fresh group. A pattern edit on a row
  // without a start has no occurrence to anchor to.
  let groupId = anchor.recurrenceGroupId
  if (!groupId) {
    const patternRequested = data.recurrence !== undefined && data.recurrence !== null
    if (patternRequested && !anchor.startAt) return { error: 'Not a series' }
    groupId = crypto.randomUUID()
    await db
      .update(tasks)
      .set({ recurrenceGroupId: groupId, updatedAt: new Date() })
      .where(and(eq(tasks.id, data.taskId), eq(tasks.userId, userId)))
  }

  const groupRows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.recurrenceGroupId, groupId), eq(tasks.userId, userId)))

  // Series start week = the group's earliest occurrence, computed BEFORE any
  // delete. Falls back to the anchor when no group row carries a start.
  const startTimes = groupRows
    .map((r) => r.startAt)
    .filter((d): d is Date => d !== null)
    .map((d) => d.getTime())
  const seriesStart = startTimes.length > 0 ? new Date(Math.min(...startTimes)) : anchor.startAt

  // Merge: defined input fields override the anchor; undefined fields stay as-is.
  const mergedTitle = data.title ?? anchor.title
  const mergedColor = data.color !== undefined ? data.color : anchor.color
  const mergedLocation = data.location !== undefined ? data.location : anchor.location
  const mergedDescription = data.description !== undefined ? data.description : anchor.description
  const mergedAllDay = data.allDay ?? anchor.allDay
  const mergedRecurrence = data.recurrence !== undefined ? data.recurrence : anchor.recurrence
  const mergedDays = data.recurrenceDays !== undefined ? data.recurrenceDays : anchor.recurrenceDays
  const mergedCount =
    data.recurrenceCount !== undefined ? data.recurrenceCount : anchor.recurrenceCount

  // Day tokens only apply to a weekly pattern (interval paths persist null).
  const hasDaySet = mergedRecurrence === WEEKLY && mergedDays !== null && mergedDays.length > 0
  const persistedDays = hasDaySet ? mergedDays : null
  const persistedCount = mergedRecurrence !== null ? mergedCount : null

  const sharedSet = {
    title: mergedTitle,
    color: mergedColor,
    location: mergedLocation,
    description: mergedDescription,
    allDay: mergedAllDay,
    recurrence: mergedRecurrence,
    recurrenceDays: persistedDays,
    recurrenceCount: persistedCount,
    updatedAt: new Date(),
  }

  // Time-of-day rewrite is driven purely by an explicit startAt in the payload.
  let templateTime: Date | null = null
  let timeDurationMs: number | null = null
  if (data.startAt !== undefined) {
    templateTime = new Date(data.startAt)
    if (data.endAt !== undefined) {
      timeDurationMs =
        data.endAt === null ? null : new Date(data.endAt).getTime() - templateTime.getTime()
    } else {
      timeDurationMs =
        anchor.endAt && anchor.startAt ? anchor.endAt.getTime() - anchor.startAt.getTime() : null
    }
  }

  // Updates a set of rows with the shared fields plus (when a time edit is
  // present) each row's own-date time rewrite. Returns the representative row.
  const applyShared = async (rows: readonly TaskRow[]): Promise<TaskRow | undefined> => {
    if (templateTime === null) {
      const updated = await db
        .update(tasks)
        .set(sharedSet)
        .where(and(eq(tasks.recurrenceGroupId, groupId), eq(tasks.userId, userId)))
        .returning()
      return updated.find((r) => r.id === data.taskId) ?? updated[0]
    }
    let representative: TaskRow | undefined
    for (const r of rows) {
      const timeFields = r.startAt
        ? rewriteTimeOfDay(r.startAt, templateTime, timeDurationMs)
        : null
      const [updated] = await db
        .update(tasks)
        .set(
          timeFields
            ? { ...sharedSet, startAt: timeFields.start, endAt: timeFields.end }
            : sharedSet,
        )
        .where(and(eq(tasks.id, r.id), eq(tasks.userId, userId)))
        .returning()
      if (updated && (updated.id === data.taskId || representative === undefined)) {
        representative = updated
      }
    }
    return representative
  }

  const patternChanged =
    data.recurrence !== undefined &&
    (mergedRecurrence !== anchor.recurrence ||
      !sameDaySet(mergedDays, anchor.recurrenceDays) ||
      mergedCount !== anchor.recurrenceCount)

  // Pattern change TO a frequency → full pending rewrite. A clear (recurrence
  // null) or a no-op pattern falls through to the shared-field update below.
  if (data.recurrence != null && patternChanged) {
    const freq = data.recurrence
    if (!anchor.startAt || !seriesStart) return { error: 'Not a series' }

    await db
      .delete(tasks)
      .where(
        and(
          eq(tasks.recurrenceGroupId, groupId),
          eq(tasks.userId, userId),
          eq(tasks.status, 'pending'),
        ),
      )

    // Completed + in_progress rows survive. Their effective slots (own date +
    // the merged time-of-day) seed the dedupe so regeneration never duplicates
    // a survivor's occurrence.
    const survivors = groupRows.filter((r) => r.status !== 'pending')
    const existingSlots = new Set(
      survivors
        .map((r) => r.startAt)
        .filter((d): d is Date => d !== null)
        .map((d) =>
          templateTime
            ? rewriteTimeOfDay(d, templateTime, timeDurationMs).start.toISOString()
            : d.toISOString(),
        ),
    )

    // Survivors take the new shared fields (and time-of-day when edited) up front,
    // while the group still holds only survivors — the fresh inserts stay untouched.
    const repSurvivor = survivors.length > 0 ? await applyShared(survivors) : undefined

    // Template = merged time-of-day on the anchor's own date.
    const templateStart = new Date(anchor.startAt)
    if (templateTime) {
      templateStart.setUTCHours(
        templateTime.getUTCHours(),
        templateTime.getUTCMinutes(),
        templateTime.getUTCSeconds(),
        templateTime.getUTCMilliseconds(),
      )
    }
    const templateEnd =
      timeDurationMs === null ? null : new Date(templateStart.getTime() + timeDurationMs)

    const weeklyDaysCounted = hasDaySet && mergedCount !== null
    const window = resolveSeriesWindow(seriesStart, weeklyDaysCounted ? mergedCount : null, now)
    const selectedDows = hasDaySet
      ? persistedDays!.map((token) => DAY_TOKENS.indexOf(token)).sort((a, b) => a - b)
      : null
    const intervalCount = hasDaySet ? null : mergedCount

    const base: SeriesBaseFields = {
      userId,
      title: mergedTitle,
      type: anchor.type,
      recurrence: freq,
      recurrenceGroupId: groupId,
      recurrenceDays: persistedDays,
      recurrenceCount: persistedCount,
      targetDate: anchor.targetDate,
      location: mergedLocation,
      description: mergedDescription,
      color: mergedColor,
      allDay: mergedAllDay,
    }

    const generated = generateSeriesRows({
      base,
      template: { start: templateStart, end: templateEnd },
      window,
      recurrence: freq,
      selectedDows,
      intervalCount,
      existingSlots,
    })

    let repInserted: TaskRow | undefined
    if (generated.length > 0) {
      const inserted = await db.insert(tasks).values(generated).returning()
      if (inserted.length === 0) return { error: 'Insert failed' }
      repInserted = inserted[0]
    }

    const representative = repInserted ?? repSurvivor
    if (!representative) {
      logger.info({ userId, groupId }, 'Series pattern change produced no rows')
      return { data: { ...anchor, recurrenceGroupId: groupId } }
    }
    logger.info(
      { userId, groupId, inserted: generated.length, survivors: survivors.length },
      'Series regenerated',
    )
    return { data: representative }
  }

  const representative = await applyShared(groupRows)
  if (!representative) return { error: 'Not found' }
  logger.info({ userId, groupId, rows: groupRows.length }, 'Series shared fields updated')
  return { data: representative }
}
