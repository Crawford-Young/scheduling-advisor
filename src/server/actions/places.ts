'use server'
import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { db } from '@/db'
import { places, calendarPrefs } from '@/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { ratelimit } from '@/lib/redis'
import { getUserTravelPlan } from '@/server/travel'
import { getTravelService } from '@/server/services'
import {
  placeInputSchema,
  travelModeSchema,
  deletePlaceInputSchema,
  type PlaceRow,
} from '@/lib/schemas/place'

type SaveResult = { ok: boolean; error?: string; place?: PlaceRow }
type SimpleResult = { ok: boolean }

const SINGLE_ROW_LIMIT = 1

export async function listPlaces(): Promise<PlaceRow[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const hasPlan = await getUserTravelPlan(session.user.id)
  if (!hasPlan) return []

  return db.select().from(places).where(eq(places.userId, session.user.id))
}

export async function savePlace(input: unknown): Promise<SaveResult> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: 'Unauthorized' }
  const userId = session.user.id

  const { success } = await ratelimit.limit(userId)
  if (!success) return { ok: false, error: 'Too many requests' }

  const parsed = placeInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid input' }

  const hasPlan = await getUserTravelPlan(userId)
  if (!hasPlan) return { ok: false, error: 'subscription required' }

  const { id, name, address } = parsed.data

  // Duplicate-name pre-check (case-insensitive, scoped to this user) — the
  // `places` unique index enforces this at the DB level too, but a pre-check
  // gives a friendly error and skips the geocode call on a known collision.
  // Excludes the row being updated (an update keeping its own name is not a
  // collision).
  const existingByName = await db
    .select({ id: places.id })
    .from(places)
    .where(and(eq(places.userId, userId), sql`lower(${places.name}) = ${name.toLowerCase()}`))
    .limit(SINGLE_ROW_LIMIT)
  const collision = existingByName[0] as { id: string } | undefined
  if (collision && collision.id !== id) {
    return { ok: false, error: 'You already have a place with that name' }
  }

  const service = await getTravelService()
  const point = await service.geocode(address)
  if (!point) return { ok: false, error: 'address not found' }

  if (id) {
    const [updated] = await db
      .update(places)
      .set({ name, address, lat: point.lat, lng: point.lng })
      .where(and(eq(places.id, id), eq(places.userId, userId)))
      .returning()
    if (!updated) return { ok: false, error: 'Not found' }
    revalidatePath('/settings')
    return { ok: true, place: updated }
  }

  const [inserted] = await db
    .insert(places)
    .values({ userId, name, address, lat: point.lat, lng: point.lng })
    .returning()
  if (!inserted) return { ok: false, error: 'Insert failed' }

  revalidatePath('/settings')
  return { ok: true, place: inserted }
}

export async function deletePlace(input: unknown): Promise<SimpleResult> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false }
  const userId = session.user.id

  const { success } = await ratelimit.limit(userId)
  if (!success) return { ok: false }

  const parsed = deletePlaceInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false }

  const hasPlan = await getUserTravelPlan(userId)
  if (!hasPlan) return { ok: false }

  const deleted = await db
    .delete(places)
    .where(and(eq(places.id, parsed.data.id), eq(places.userId, userId)))
    .returning({ id: places.id })

  if (deleted.length === 0) return { ok: false }

  revalidatePath('/settings')
  return { ok: true }
}

export async function setTravelMode(input: unknown): Promise<SimpleResult> {
  const session = await auth()
  if (!session?.user?.id) return { ok: false }
  const userId = session.user.id

  const { success } = await ratelimit.limit(userId)
  if (!success) return { ok: false }

  const parsed = travelModeSchema.safeParse(input)
  if (!parsed.success) return { ok: false }

  const hasPlan = await getUserTravelPlan(userId)
  if (!hasPlan) return { ok: false }

  await db
    .insert(calendarPrefs)
    .values({ userId, travelMode: parsed.data.travelMode })
    .onConflictDoUpdate({
      target: calendarPrefs.userId,
      set: { travelMode: parsed.data.travelMode, updatedAt: new Date() },
    })

  revalidatePath('/settings')
  return { ok: true }
}
