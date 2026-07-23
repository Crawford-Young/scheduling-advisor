// Plain server module — NOT 'use server'. `getTravelWarnings` takes `userId`
// as a parameter precisely BECAUSE it is not client-callable — same doctrine
// as src/server/travel.ts's header comment. Only already-authenticated
// server code (the calendar RSC page) may call it.

import { and, eq, gte, isNotNull, lte } from 'drizzle-orm'
import { db } from '@/db'
import { calendarPrefs, events } from '@/db/schema'
import {
  getCachedTravelTime,
  getUserTravelPlan,
  TRAVEL_BUFFER_MIN,
  WARNING_WINDOW_DAYS,
} from '@/server/travel'
import type { GeoPoint, TravelEstimate, TravelMode } from '@/server/services/interfaces/travel'

export interface TravelWarning {
  readonly eventId: string
  readonly prevEventId: string
  readonly severity: 'conflict' | 'tight'
  readonly travelMin: number
  readonly gapMin: number
  readonly mode: TravelMode
}

interface CandidateEvent {
  readonly id: string
  readonly startAt: Date
  readonly endAt: Date
  readonly locationLat: number
  readonly locationLng: number
}

interface EventPair {
  readonly prev: CandidateEvent
  readonly next: CandidateEvent
  readonly gapMin: number
}

const DEFAULT_TRAVEL_MODE: TravelMode = 'driving'
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24
const MS_PER_SECOND = 1000
const MS_PER_MINUTE = MS_PER_SECOND * SECONDS_PER_MINUTE
const MS_PER_DAY = MS_PER_MINUTE * MINUTES_PER_HOUR * HOURS_PER_DAY

// LOCAL calendar day per the local-wall-clock invariant (AGENTS.md) — never a
// UTC ISO substring.
function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function lookupKey(origin: GeoPoint, destination: GeoPoint, mode: TravelMode): string {
  return `${origin.lat},${origin.lng}|${destination.lat},${destination.lng}|${mode}`
}

function buildPairs(candidates: readonly CandidateEvent[]): EventPair[] {
  const byDay = new Map<string, CandidateEvent[]>()
  for (const candidate of candidates) {
    const key = localDayKey(candidate.startAt)
    const dayEvents = byDay.get(key)
    if (dayEvents) {
      dayEvents.push(candidate)
    } else {
      byDay.set(key, [candidate])
    }
  }

  const pairs: EventPair[] = []
  for (const dayEvents of byDay.values()) {
    const sorted = [...dayEvents].sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!
      const next = sorted[i]!
      if (prev.locationLat === next.locationLat && prev.locationLng === next.locationLng) continue

      const gapMin = (next.startAt.getTime() - prev.endAt.getTime()) / MS_PER_MINUTE
      if (gapMin < 0) continue

      pairs.push({ prev, next, gapMin })
    }
  }
  return pairs
}

function severityFor(gapMin: number, travelMin: number): 'conflict' | 'tight' | null {
  if (gapMin < travelMin) return 'conflict'
  if (gapMin < travelMin + TRAVEL_BUFFER_MIN) return 'tight'
  return null
}

export async function getTravelWarnings(userId: string): Promise<TravelWarning[]> {
  const hasPlan = await getUserTravelPlan(userId)
  if (!hasPlan) return []

  const [prefsRow] = await db.select().from(calendarPrefs).where(eq(calendarPrefs.userId, userId))
  const mode: TravelMode = prefsRow?.travelMode ?? DEFAULT_TRAVEL_MODE

  const now = new Date()
  const windowEnd = new Date(now.getTime() + WARNING_WINDOW_DAYS * MS_PER_DAY)

  const rows = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.userId, userId),
        eq(events.allDay, false),
        isNotNull(events.startAt),
        isNotNull(events.endAt),
        isNotNull(events.locationLat),
        isNotNull(events.locationLng),
        gte(events.startAt, now),
        lte(events.startAt, windowEnd),
      ),
    )

  const candidates: CandidateEvent[] = []
  for (const row of rows) {
    if (row.startAt == null || row.endAt == null) continue
    if (row.locationLat == null || row.locationLng == null) continue

    candidates.push({
      id: row.id,
      startAt: row.startAt,
      endAt: row.endAt,
      locationLat: row.locationLat,
      locationLng: row.locationLng,
    })
  }

  const pairs = buildPairs(candidates)
  if (pairs.length === 0) return []

  const lookups = new Map<string, { readonly origin: GeoPoint; readonly destination: GeoPoint }>()
  for (const pair of pairs) {
    const origin: GeoPoint = { lat: pair.prev.locationLat, lng: pair.prev.locationLng }
    const destination: GeoPoint = { lat: pair.next.locationLat, lng: pair.next.locationLng }
    const key = lookupKey(origin, destination, mode)
    if (!lookups.has(key)) lookups.set(key, { origin, destination })
  }

  const lookupEntries = [...lookups.entries()]
  const estimates = await Promise.all(
    lookupEntries.map(([, { origin, destination }]) =>
      getCachedTravelTime(userId, { origin, destination, mode }),
    ),
  )
  const estimateByKey = new Map<string, TravelEstimate | null>()
  lookupEntries.forEach(([key], index) => {
    estimateByKey.set(key, estimates[index] ?? null)
  })

  const warnings: TravelWarning[] = []
  for (const pair of pairs) {
    const origin: GeoPoint = { lat: pair.prev.locationLat, lng: pair.prev.locationLng }
    const destination: GeoPoint = { lat: pair.next.locationLat, lng: pair.next.locationLng }
    const estimate = estimateByKey.get(lookupKey(origin, destination, mode))
    if (!estimate) continue

    const severity = severityFor(pair.gapMin, estimate.durationMin)
    if (!severity) continue

    warnings.push({
      eventId: pair.next.id,
      prevEventId: pair.prev.id,
      severity,
      travelMin: estimate.durationMin,
      gapMin: pair.gapMin,
      mode,
    })
  }

  return warnings
}
