// Plain module — deliberately NO 'use server' directive. Every export from a
// 'use server' file is a client-callable POST endpoint; `generateEvents`
// takes a caller-supplied `userId` and `generateEventsForActivity` trusts a
// caller-supplied activity row (its UPDATE has no ownership predicate,
// inserts stamp `userId` straight from the argument) — either export reached
// as an endpoint is arbitrary cross-user event injection. Import-only surface:
// only `src/server/actions/event-generation.ts`'s zero-arg, auth-derived
// `safeGenerateEvents()` and `src/server/actions/activities.ts` may call in.
import { db } from '@/db'
import { activities, events } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { logger } from '@/lib/logger'
import {
  generateEventSeeds,
  nextGeneratedThrough,
  resolveGenerationWindow,
  type GenerationActivity,
} from '@/lib/event-generation'

type ActivityRow = (typeof activities)['$inferSelect']

/**
 * Generates and persists a single activity's due events for the sliding
 * 8-week window anchored at `now`, then advances its high-water mark
 * (`generatedThrough`) to the window end — even when zero seeds are due, so
 * a schedule-less activity's mark still tracks forward and a repeat sweep at
 * the same instant is idempotent (nothing in the same window is ever
 * strictly-after the mark twice). Shared by `createActivity`/`updateActivity`
 * (immediate, single activity — `src/server/actions/activities.ts`) and the
 * bulk sweep below. Mirrors the `generateSeriesRows`-then-insert shape of
 * `extendSeries` (`src/server/actions/series-mutations.ts`).
 */
export async function generateEventsForActivity(activity: ActivityRow, now: Date): Promise<number> {
  const window = resolveGenerationWindow(now)
  const generationActivity: GenerationActivity = {
    title: activity.title,
    description: activity.description,
    defaultLocation: activity.defaultLocation,
    color: activity.color,
    schedule: activity.schedule,
    timeZone: activity.timeZone,
    generatedThrough: activity.generatedThrough,
  }

  // Dedupe guard (A10 fix c): the instants of this activity's existing pending
  // events. A pattern edit resets `generatedThrough` to now and regenerates the
  // whole window, so without this every unchanged day would get a duplicate —
  // `generateEventSeeds` skips any slot already covered here.
  const existing = await db
    .select({ startAt: events.startAt })
    .from(events)
    .where(and(eq(events.activityId, activity.id), eq(events.status, 'pending')))
  const existingStartAtMs = new Set<number>()
  for (const row of existing) {
    if (row.startAt !== null) existingStartAtMs.add(row.startAt.getTime())
  }

  const seeds = generateEventSeeds({ activity: generationActivity, window, existingStartAtMs })

  if (seeds.length > 0) {
    await db.insert(events).values(
      seeds.map((seed) => ({
        userId: activity.userId,
        activityId: activity.id,
        title: seed.title,
        description: seed.description,
        location: seed.location,
        color: seed.color,
        startAt: seed.startAt,
        endAt: seed.endAt,
      })),
    )
  }

  await db
    .update(activities)
    .set({ generatedThrough: nextGeneratedThrough(window), updatedAt: new Date() })
    .where(eq(activities.id, activity.id))

  return seeds.length
}

/**
 * Bulk sliding-window sweep: regenerates every one of `userId`'s activities.
 * `userId` is passed explicitly (no auth here) — this module is import-only,
 * never a server action; `safeGenerateEvents`
 * (`src/server/actions/event-generation.ts`) resolves the session and is the
 * only caller reachable from the client.
 */
export async function generateEvents(userId: string): Promise<number> {
  const now = new Date()
  const rows = await db.select().from(activities).where(eq(activities.userId, userId))

  let total = 0
  for (const activity of rows) {
    total += await generateEventsForActivity(activity, now)
  }

  logger.info({ userId, activities: rows.length, generated: total }, 'Events generation swept')
  return total
}
