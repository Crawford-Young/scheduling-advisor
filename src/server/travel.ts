// Plain server module — NO 'use server' directive. These functions take
// `userId` as a parameter precisely BECAUSE they are not client-callable;
// only already-authenticated server code (route handlers, RSC pages, server
// actions that did their own `auth()`) may call them.

import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { places, travelCache, users } from '@/db/schema'
import { travelRatelimit } from '@/lib/redis'
import { getTravelService } from '@/server/services'
import type { GeoPoint, TravelEstimate, TravelTimeInput } from '@/server/services/interfaces/travel'

export const TRAVEL_BUFFER_MIN = 10
export const TRAVEL_CACHE_TTL_DAYS = 30
export const COORD_PRECISION = 4
export const TRAFFIC_AWARE_WINDOW_HOURS = 2
export const DAILY_ROUTES_LIMIT = 200
export const WARNING_WINDOW_DAYS = 14

const SINGLE_ROW_LIMIT = 1
const COORD_ROUND_FACTOR = 10 ** COORD_PRECISION
const MS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24
const MS_PER_DAY = MS_PER_SECOND * SECONDS_PER_MINUTE * MINUTES_PER_HOUR * HOURS_PER_DAY

export interface ResolvedLocation {
  readonly point: GeoPoint
  readonly label: string
}

function roundCoord(value: number): number {
  return Math.round(value * COORD_ROUND_FACTOR) / COORD_ROUND_FACTOR
}

export async function getUserTravelPlan(userId: string): Promise<boolean> {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(SINGLE_ROW_LIMIT)
  const row = rows[0] as { plan: string | null } | undefined
  return row?.plan != null
}

export async function resolveLocation(
  userId: string,
  rawText: string,
): Promise<ResolvedLocation | null> {
  const normalized = rawText.trim().toLowerCase()

  const rows = await db
    .select()
    .from(places)
    .where(and(eq(places.userId, userId), sql`lower(${places.name}) = ${normalized}`))
    .limit(SINGLE_ROW_LIMIT)
  const row = rows[0] as { lat: number; lng: number; address: string } | undefined
  if (row) {
    return { point: { lat: row.lat, lng: row.lng }, label: row.address }
  }

  const service = await getTravelService()
  const point = await service.geocode(rawText)
  if (!point) return null

  return { point, label: rawText }
}

export async function getCachedTravelTime(
  userId: string,
  input: TravelTimeInput,
): Promise<TravelEstimate | null> {
  const originLat = roundCoord(input.origin.lat)
  const originLng = roundCoord(input.origin.lng)
  const destLat = roundCoord(input.destination.lat)
  const destLng = roundCoord(input.destination.lng)

  const rows = await db
    .select()
    .from(travelCache)
    .where(
      and(
        eq(travelCache.originLat, originLat),
        eq(travelCache.originLng, originLng),
        eq(travelCache.destLat, destLat),
        eq(travelCache.destLng, destLng),
        eq(travelCache.mode, input.mode),
      ),
    )
    .limit(SINGLE_ROW_LIMIT)
  const row = rows[0] as
    | { durationMin: number; distanceMeters: number; fetchedAt: Date }
    | undefined

  const freshCutoff = Date.now() - TRAVEL_CACHE_TTL_DAYS * MS_PER_DAY
  if (row && row.fetchedAt.getTime() > freshCutoff) {
    return { durationMin: row.durationMin, distanceMeters: row.distanceMeters, trafficAware: false }
  }

  const { success } = await travelRatelimit.limit(userId)
  if (!success) return null

  const service = await getTravelService()
  const estimate = await service.getTravelTime({
    origin: { lat: originLat, lng: originLng },
    destination: { lat: destLat, lng: destLng },
    mode: input.mode,
  })
  if (!estimate) return null

  await db
    .insert(travelCache)
    .values({
      originLat,
      originLng,
      destLat,
      destLng,
      mode: input.mode,
      durationMin: estimate.durationMin,
      distanceMeters: estimate.distanceMeters,
    })
    .onConflictDoUpdate({
      target: [
        travelCache.originLat,
        travelCache.originLng,
        travelCache.destLat,
        travelCache.destLng,
        travelCache.mode,
      ],
      set: {
        durationMin: estimate.durationMin,
        distanceMeters: estimate.distanceMeters,
        fetchedAt: new Date(),
      },
    })

  return estimate
}

export async function getLiveTravelTime(
  userId: string,
  input: TravelTimeInput,
): Promise<TravelEstimate | null> {
  const { success } = await travelRatelimit.limit(userId)
  if (!success) return null

  const service = await getTravelService()
  return service.getTravelTime(input)
}

export async function geocodeForSave(
  userId: string,
  locationText: string | null | undefined,
): Promise<{ locationLat: number | null; locationLng: number | null }> {
  const trimmed = locationText?.trim()
  if (!trimmed) return { locationLat: null, locationLng: null }

  const hasPlan = await getUserTravelPlan(userId)
  if (!hasPlan) return { locationLat: null, locationLng: null }

  const resolved = await resolveLocation(userId, trimmed)
  if (!resolved) return { locationLat: null, locationLng: null }

  return { locationLat: resolved.point.lat, locationLng: resolved.point.lng }
}
