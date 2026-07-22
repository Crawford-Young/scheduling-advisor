import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSelectLimit = vi.hoisted(() => vi.fn())
const mockSelectWhere = vi.hoisted(() => vi.fn().mockReturnValue({ limit: mockSelectLimit }))
const mockSelectFrom = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockSelectWhere }))
const mockSelect = vi.hoisted(() => vi.fn().mockReturnValue({ from: mockSelectFrom }))

const mockInsertOnConflict = vi.hoisted(() => vi.fn())
const mockInsertValues = vi.hoisted(() =>
  vi.fn().mockReturnValue({ onConflictDoUpdate: mockInsertOnConflict }),
)
const mockInsert = vi.hoisted(() => vi.fn().mockReturnValue({ values: mockInsertValues }))

const mockRatelimitLimit = vi.hoisted(() => vi.fn())

const mockGeocode = vi.hoisted(() => vi.fn())
const mockGetTravelTime = vi.hoisted(() => vi.fn())
const mockGetTravelService = vi.hoisted(() => vi.fn())

vi.mock('@/db', () => ({
  db: { select: mockSelect, insert: mockInsert },
}))

vi.mock('@/db/schema', () => ({
  users: { id: 'users.id', plan: 'users.plan' },
  places: { userId: 'places.userId', name: 'places.name' },
  travelCache: {
    originLat: 'travelCache.originLat',
    originLng: 'travelCache.originLng',
    destLat: 'travelCache.destLat',
    destLng: 'travelCache.destLng',
    mode: 'travelCache.mode',
  },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
}))

vi.mock('@/lib/redis', () => ({
  travelRatelimit: { limit: mockRatelimitLimit },
}))

vi.mock('@/server/services', () => ({
  getTravelService: mockGetTravelService,
}))

import {
  getUserTravelPlan,
  resolveLocation,
  getCachedTravelTime,
  getLiveTravelTime,
  geocodeForSave,
  TRAVEL_CACHE_TTL_DAYS,
  COORD_PRECISION,
} from '@/server/travel'
import type { TravelTimeInput } from '@/server/services/interfaces/travel'

const DAY_MS = 24 * 60 * 60 * 1000
const USER_ID = 'user-123'

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS)
}

const DRIVING_INPUT: TravelTimeInput = {
  origin: { lat: 40.712776, lng: -74.005974 },
  destination: { lat: 40.73061, lng: -73.935242 },
  mode: 'driving',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSelectLimit.mockResolvedValue([])
  mockRatelimitLimit.mockResolvedValue({ success: true })
  mockGetTravelService.mockResolvedValue({
    geocode: mockGeocode,
    getTravelTime: mockGetTravelTime,
  })
})

describe('getUserTravelPlan', () => {
  it.each([
    ['starter', true],
    ['comped', true],
  ] as const)('plan %s -> %s', async (plan, expected) => {
    mockSelectLimit.mockResolvedValueOnce([{ plan }])

    expect(await getUserTravelPlan(USER_ID)).toBe(expected)
  })

  it('null plan -> false', async () => {
    mockSelectLimit.mockResolvedValueOnce([{ plan: null }])

    expect(await getUserTravelPlan(USER_ID)).toBe(false)
  })

  it('no row -> false', async () => {
    mockSelectLimit.mockResolvedValueOnce([])

    expect(await getUserTravelPlan(USER_ID)).toBe(false)
  })
})

describe('resolveLocation', () => {
  it('alias hit (mixed-case, padded input) returns place coords + address label, geocode not called', async () => {
    mockSelectLimit.mockResolvedValueOnce([
      { lat: 40.7128, lng: -74.006, address: '123 Office Rd' },
    ])

    const result = await resolveLocation(USER_ID, '  OFFICE  ')

    expect(result).toEqual({ point: { lat: 40.7128, lng: -74.006 }, label: '123 Office Rd' })
    expect(mockGeocode).not.toHaveBeenCalled()

    const { sql } = await import('drizzle-orm')
    const lastCall = vi.mocked(sql).mock.calls.at(-1)
    expect(lastCall?.[2]).toBe('office')
  })

  it('miss falls back to geocode, returning rawText as label', async () => {
    mockSelectLimit.mockResolvedValueOnce([])
    mockGeocode.mockResolvedValueOnce({ lat: 1, lng: 2 })

    const result = await resolveLocation(USER_ID, 'Some Address')

    expect(mockGeocode).toHaveBeenCalledWith('Some Address')
    expect(result).toEqual({ point: { lat: 1, lng: 2 }, label: 'Some Address' })
  })

  it('geocode null -> null', async () => {
    mockSelectLimit.mockResolvedValueOnce([])
    mockGeocode.mockResolvedValueOnce(null)

    expect(await resolveLocation(USER_ID, 'Nowhere')).toBeNull()
  })
})

describe('getCachedTravelTime', () => {
  it('fresh cache hit returns cached value; service and limiter not called', async () => {
    mockSelectLimit.mockResolvedValueOnce([
      { durationMin: 15, distanceMeters: 5000, fetchedAt: daysAgo(1) },
    ])

    const result = await getCachedTravelTime(USER_ID, DRIVING_INPUT)

    expect(result).toEqual({ durationMin: 15, distanceMeters: 5000, trafficAware: false })
    expect(mockGetTravelTime).not.toHaveBeenCalled()
    expect(mockRatelimitLimit).not.toHaveBeenCalled()
  })

  it('miss calls service with rounded coords, upserts, returns estimate', async () => {
    mockSelectLimit.mockResolvedValueOnce([])
    mockGetTravelTime.mockResolvedValueOnce({
      durationMin: 20,
      distanceMeters: 8000,
      trafficAware: false,
    })

    const result = await getCachedTravelTime(USER_ID, DRIVING_INPUT)

    expect(mockRatelimitLimit).toHaveBeenCalledWith(USER_ID)
    expect(mockGetTravelTime).toHaveBeenCalledWith({
      origin: { lat: 40.7128, lng: -74.006 },
      destination: { lat: 40.7306, lng: -73.9352 },
      mode: 'driving',
    })
    expect(mockInsert).toHaveBeenCalled()
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        originLat: 40.7128,
        originLng: -74.006,
        destLat: 40.7306,
        destLng: -73.9352,
        mode: 'driving',
        durationMin: 20,
        distanceMeters: 8000,
      }),
    )
    expect(mockInsertOnConflict).toHaveBeenCalled()
    expect(result).toEqual({ durationMin: 20, distanceMeters: 8000, trafficAware: false })
  })

  it('stale row (fetchedAt 31 days ago) calls service and refreshes fetchedAt', async () => {
    mockSelectLimit.mockResolvedValueOnce([
      { durationMin: 10, distanceMeters: 4000, fetchedAt: daysAgo(TRAVEL_CACHE_TTL_DAYS + 1) },
    ])
    mockGetTravelTime.mockResolvedValueOnce({
      durationMin: 25,
      distanceMeters: 9000,
      trafficAware: false,
    })

    const result = await getCachedTravelTime(USER_ID, DRIVING_INPUT)

    expect(mockGetTravelTime).toHaveBeenCalled()
    const setArg = mockInsertOnConflict.mock.calls[0]?.[0]
    expect(setArg.set.fetchedAt).toBeInstanceOf(Date)
    expect(setArg.set.durationMin).toBe(25)
    expect(setArg.set.distanceMeters).toBe(9000)
    expect(result).toEqual({ durationMin: 25, distanceMeters: 9000, trafficAware: false })
  })

  it('limiter success:false -> null, service not called', async () => {
    mockSelectLimit.mockResolvedValueOnce([])
    mockRatelimitLimit.mockResolvedValueOnce({ success: false })

    const result = await getCachedTravelTime(USER_ID, DRIVING_INPUT)

    expect(result).toBeNull()
    expect(mockGetTravelTime).not.toHaveBeenCalled()
  })

  it('service null -> null, no upsert', async () => {
    mockSelectLimit.mockResolvedValueOnce([])
    mockGetTravelTime.mockResolvedValueOnce(null)

    const result = await getCachedTravelTime(USER_ID, DRIVING_INPUT)

    expect(result).toBeNull()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('ignores departureTime on BASIC-tier lookups (never forwarded to the service)', async () => {
    mockSelectLimit.mockResolvedValueOnce([])
    mockGetTravelTime.mockResolvedValueOnce({
      durationMin: 12,
      distanceMeters: 3000,
      trafficAware: false,
    })

    await getCachedTravelTime(USER_ID, { ...DRIVING_INPUT, departureTime: new Date() })

    const callArg = mockGetTravelTime.mock.calls[0]?.[0]
    expect(callArg).not.toHaveProperty('departureTime')
  })

  it('inputs differing at the 5th decimal round to the same key (service/upsert see identical coords)', async () => {
    mockSelectLimit.mockResolvedValue([])
    mockGetTravelTime.mockResolvedValue({
      durationMin: 30,
      distanceMeters: 10000,
      trafficAware: false,
    })

    const inputA: TravelTimeInput = {
      origin: { lat: 40.71280001, lng: -74.0 },
      destination: { lat: 40.73061, lng: -73.935242 },
      mode: 'driving',
    }
    const inputB: TravelTimeInput = {
      origin: { lat: 40.712804, lng: -74.0 },
      destination: { lat: 40.73061, lng: -73.935242 },
      mode: 'driving',
    }

    await getCachedTravelTime(USER_ID, inputA)
    await getCachedTravelTime(USER_ID, inputB)

    expect(mockGetTravelTime.mock.calls[0]?.[0]).toEqual(mockGetTravelTime.mock.calls[1]?.[0])
    expect(mockInsertValues.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ originLat: 40.7128 }),
    )
    expect(mockInsertValues.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ originLat: 40.7128 }),
    )
  })
})

describe('getLiveTravelTime', () => {
  it('forwards departureTime intact and never touches the cache', async () => {
    const departureTime = new Date('2026-08-01T12:00:00.000Z')
    mockGetTravelTime.mockResolvedValueOnce({
      durationMin: 18,
      distanceMeters: 6000,
      trafficAware: true,
    })

    const result = await getLiveTravelTime(USER_ID, { ...DRIVING_INPUT, departureTime })

    expect(mockGetTravelTime).toHaveBeenCalledWith(expect.objectContaining({ departureTime }))
    expect(mockSelect).not.toHaveBeenCalled()
    expect(mockInsert).not.toHaveBeenCalled()
    expect(result).toEqual({ durationMin: 18, distanceMeters: 6000, trafficAware: true })
  })

  it('limiter enforced -> null, service not called', async () => {
    mockRatelimitLimit.mockResolvedValueOnce({ success: false })

    const result = await getLiveTravelTime(USER_ID, DRIVING_INPUT)

    expect(result).toBeNull()
    expect(mockGetTravelTime).not.toHaveBeenCalled()
  })
})

describe('geocodeForSave', () => {
  it('paid user + text -> coords', async () => {
    mockSelectLimit.mockResolvedValueOnce([{ plan: 'pro' }]).mockResolvedValueOnce([])
    mockGeocode.mockResolvedValueOnce({ lat: 5, lng: 6 })

    const result = await geocodeForSave(USER_ID, 'Some Place')

    expect(result).toEqual({ locationLat: 5, locationLng: 6 })
  })

  it('free user -> nulls, resolveLocation never called', async () => {
    mockSelectLimit.mockResolvedValueOnce([{ plan: null }])

    const result = await geocodeForSave(USER_ID, 'Some Place')

    expect(result).toEqual({ locationLat: null, locationLng: null })
    expect(mockGeocode).not.toHaveBeenCalled()
    expect(mockSelect).toHaveBeenCalledTimes(1)
  })

  it.each(['', '   ', undefined, null] as const)(
    '%p text -> nulls without checking plan',
    async (text) => {
      const result = await geocodeForSave(USER_ID, text)

      expect(result).toEqual({ locationLat: null, locationLng: null })
      expect(mockSelect).not.toHaveBeenCalled()
    },
  )

  it('resolveLocation null -> nulls', async () => {
    mockSelectLimit.mockResolvedValueOnce([{ plan: 'pro' }]).mockResolvedValueOnce([])
    mockGeocode.mockResolvedValueOnce(null)

    const result = await geocodeForSave(USER_ID, 'Nowhere')

    expect(result).toEqual({ locationLat: null, locationLng: null })
  })
})

describe('constants', () => {
  it('COORD_PRECISION is 4', () => {
    expect(COORD_PRECISION).toBe(4)
  })
})
