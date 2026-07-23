import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockWhere = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())
const mockSelect = vi.hoisted(() => vi.fn())

vi.mock('@/db', () => ({
  db: { select: mockSelect },
}))

vi.mock('@/db/schema', () => ({
  calendarPrefs: { userId: 'calendarPrefs.userId', travelMode: 'calendarPrefs.travelMode' },
  events: {
    userId: 'events.userId',
    allDay: 'events.allDay',
    startAt: 'events.startAt',
    endAt: 'events.endAt',
    locationLat: 'events.locationLat',
    locationLng: 'events.locationLng',
  },
}))

const mockGetUserTravelPlan = vi.hoisted(() => vi.fn())
const mockGetCachedTravelTime = vi.hoisted(() => vi.fn())

vi.mock('@/server/travel', () => ({
  getUserTravelPlan: (userId: string) => mockGetUserTravelPlan(userId),
  getCachedTravelTime: (userId: string, input: unknown) => mockGetCachedTravelTime(userId, input),
  TRAVEL_BUFFER_MIN: 10,
  WARNING_WINDOW_DAYS: 14,
}))

import { getTravelWarnings } from './travel-warnings'

const USER_ID = 'user-1'

// Local-time constructor (per AGENTS.md local-wall-clock invariant) — avoids
// UTC/local ambiguity across the host running the suite.
function local(y: number, m: number, d: number, h: number, min: number): Date {
  return new Date(y, m, d, h, min)
}

function makeEventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt-1',
    startAt: local(2026, 6, 22, 9, 0),
    endAt: local(2026, 6, 22, 10, 0),
    locationLat: 40.7128,
    locationLng: -74.006,
    ...overrides,
  }
}

const ESTIMATE_25 = { durationMin: 25, distanceMeters: 10000, trafficAware: false }

beforeEach(() => {
  mockWhere.mockReset()
  mockFrom.mockReset().mockReturnValue({ where: mockWhere })
  mockSelect.mockReset().mockReturnValue({ from: mockFrom })
  mockGetUserTravelPlan.mockReset().mockResolvedValue(true)
  mockGetCachedTravelTime.mockReset().mockResolvedValue(ESTIMATE_25)
})

describe('getTravelWarnings', () => {
  it('free user (no travel plan) -> [], zero db event reads, zero travel-time lookups', async () => {
    mockGetUserTravelPlan.mockResolvedValueOnce(false)

    const result = await getTravelWarnings(USER_ID)

    expect(result).toEqual([])
    expect(mockSelect).not.toHaveBeenCalled()
    expect(mockGetCachedTravelTime).not.toHaveBeenCalled()
  })

  it('defaults travel mode to driving when no calendarPrefs row exists', async () => {
    mockWhere.mockResolvedValueOnce([])
    mockWhere.mockResolvedValueOnce([
      makeEventRow({ id: 'a', locationLat: 1, locationLng: 1 }),
      makeEventRow({
        id: 'b',
        startAt: local(2026, 6, 22, 11, 0),
        endAt: local(2026, 6, 22, 12, 0),
        locationLat: 2,
        locationLng: 2,
      }),
    ])

    await getTravelWarnings(USER_ID)

    expect(mockGetCachedTravelTime).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ mode: 'driving' }),
    )
  })

  it('reads travel mode from the calendarPrefs row when present', async () => {
    mockWhere.mockResolvedValueOnce([{ travelMode: 'walking' }])
    mockWhere.mockResolvedValueOnce([
      makeEventRow({ id: 'a', locationLat: 1, locationLng: 1 }),
      makeEventRow({
        id: 'b',
        startAt: local(2026, 6, 22, 11, 0),
        endAt: local(2026, 6, 22, 12, 0),
        locationLat: 2,
        locationLng: 2,
      }),
    ])

    await getTravelWarnings(USER_ID)

    expect(mockGetCachedTravelTime).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ mode: 'walking' }),
    )
  })

  it('does not pair events across different LOCAL calendar days even when close in raw time', async () => {
    mockWhere.mockResolvedValueOnce([])
    mockWhere.mockResolvedValueOnce([
      makeEventRow({
        id: 'day1',
        startAt: local(2026, 6, 22, 23, 0),
        endAt: local(2026, 6, 22, 23, 30),
        locationLat: 1,
        locationLng: 1,
      }),
      makeEventRow({
        id: 'day2',
        startAt: local(2026, 6, 23, 0, 0),
        endAt: local(2026, 6, 23, 0, 30),
        locationLat: 2,
        locationLng: 2,
      }),
    ])

    const result = await getTravelWarnings(USER_ID)

    expect(result).toEqual([])
    expect(mockGetCachedTravelTime).not.toHaveBeenCalled()
  })

  it('skips a pair when coords are identical (no travel needed)', async () => {
    mockWhere.mockResolvedValueOnce([])
    mockWhere.mockResolvedValueOnce([
      makeEventRow({ id: 'a', locationLat: 5, locationLng: 5 }),
      makeEventRow({
        id: 'b',
        startAt: local(2026, 6, 22, 11, 0),
        endAt: local(2026, 6, 22, 12, 0),
        locationLat: 5,
        locationLng: 5,
      }),
    ])

    const result = await getTravelWarnings(USER_ID)

    expect(result).toEqual([])
    expect(mockGetCachedTravelTime).not.toHaveBeenCalled()
  })

  it('skips a pair with a negative/overlapping gap', async () => {
    mockWhere.mockResolvedValueOnce([])
    mockWhere.mockResolvedValueOnce([
      makeEventRow({
        id: 'a',
        startAt: local(2026, 6, 22, 9, 0),
        endAt: local(2026, 6, 22, 11, 0),
        locationLat: 1,
        locationLng: 1,
      }),
      makeEventRow({
        id: 'b',
        startAt: local(2026, 6, 22, 10, 0),
        endAt: local(2026, 6, 22, 12, 0),
        locationLat: 2,
        locationLng: 2,
      }),
    ])

    const result = await getTravelWarnings(USER_ID)

    expect(result).toEqual([])
    expect(mockGetCachedTravelTime).not.toHaveBeenCalled()
  })

  it('drops a candidate row missing coords even though the query filters for it (defensive)', async () => {
    mockWhere.mockResolvedValueOnce([])
    mockWhere.mockResolvedValueOnce([
      makeEventRow({ id: 'a', locationLat: null, locationLng: null }),
      makeEventRow({
        id: 'b',
        startAt: local(2026, 6, 22, 11, 0),
        endAt: local(2026, 6, 22, 12, 0),
        locationLat: 2,
        locationLng: 2,
      }),
    ])

    const result = await getTravelWarnings(USER_ID)

    expect(result).toEqual([])
    expect(mockGetCachedTravelTime).not.toHaveBeenCalled()
  })

  it('gap 15 vs travel 25 -> conflict', async () => {
    mockWhere.mockResolvedValueOnce([])
    mockWhere.mockResolvedValueOnce([
      makeEventRow({
        id: 'a',
        startAt: local(2026, 6, 22, 9, 0),
        endAt: local(2026, 6, 22, 10, 0),
        locationLat: 1,
        locationLng: 1,
      }),
      makeEventRow({
        id: 'b',
        startAt: local(2026, 6, 22, 10, 15),
        endAt: local(2026, 6, 22, 11, 15),
        locationLat: 2,
        locationLng: 2,
      }),
    ])
    mockGetCachedTravelTime.mockResolvedValueOnce({ ...ESTIMATE_25, durationMin: 25 })

    const result = await getTravelWarnings(USER_ID)

    expect(result).toEqual([
      {
        eventId: 'b',
        prevEventId: 'a',
        severity: 'conflict',
        travelMin: 25,
        gapMin: 15,
        mode: 'driving',
      },
    ])
  })

  it('gap 30 vs travel 25 -> tight', async () => {
    mockWhere.mockResolvedValueOnce([])
    mockWhere.mockResolvedValueOnce([
      makeEventRow({
        id: 'a',
        startAt: local(2026, 6, 22, 9, 0),
        endAt: local(2026, 6, 22, 10, 0),
        locationLat: 1,
        locationLng: 1,
      }),
      makeEventRow({
        id: 'b',
        startAt: local(2026, 6, 22, 10, 30),
        endAt: local(2026, 6, 22, 11, 30),
        locationLat: 2,
        locationLng: 2,
      }),
    ])
    mockGetCachedTravelTime.mockResolvedValueOnce({ ...ESTIMATE_25, durationMin: 25 })

    const result = await getTravelWarnings(USER_ID)

    expect(result).toEqual([
      {
        eventId: 'b',
        prevEventId: 'a',
        severity: 'tight',
        travelMin: 25,
        gapMin: 30,
        mode: 'driving',
      },
    ])
  })

  it('gap 60 vs travel 25 -> no warning', async () => {
    mockWhere.mockResolvedValueOnce([])
    mockWhere.mockResolvedValueOnce([
      makeEventRow({
        id: 'a',
        startAt: local(2026, 6, 22, 9, 0),
        endAt: local(2026, 6, 22, 10, 0),
        locationLat: 1,
        locationLng: 1,
      }),
      makeEventRow({
        id: 'b',
        startAt: local(2026, 6, 22, 11, 0),
        endAt: local(2026, 6, 22, 12, 0),
        locationLat: 2,
        locationLng: 2,
      }),
    ])
    mockGetCachedTravelTime.mockResolvedValueOnce({ ...ESTIMATE_25, durationMin: 25 })

    const result = await getTravelWarnings(USER_ID)

    expect(result).toEqual([])
  })

  it('null estimate -> no warning for that pair', async () => {
    mockWhere.mockResolvedValueOnce([])
    mockWhere.mockResolvedValueOnce([
      makeEventRow({
        id: 'a',
        startAt: local(2026, 6, 22, 9, 0),
        endAt: local(2026, 6, 22, 10, 0),
        locationLat: 1,
        locationLng: 1,
      }),
      makeEventRow({
        id: 'b',
        startAt: local(2026, 6, 22, 10, 15),
        endAt: local(2026, 6, 22, 11, 15),
        locationLat: 2,
        locationLng: 2,
      }),
    ])
    mockGetCachedTravelTime.mockResolvedValueOnce(null)

    const result = await getTravelWarnings(USER_ID)

    expect(result).toEqual([])
  })

  it('deduplicates identical (origin, destination, mode) lookups across pairs', async () => {
    mockWhere.mockResolvedValueOnce([])
    mockWhere.mockResolvedValueOnce([
      // Day 1 pair: 1,1 -> 2,2
      makeEventRow({
        id: 'day1-a',
        startAt: local(2026, 6, 22, 9, 0),
        endAt: local(2026, 6, 22, 10, 0),
        locationLat: 1,
        locationLng: 1,
      }),
      makeEventRow({
        id: 'day1-b',
        startAt: local(2026, 6, 22, 10, 15),
        endAt: local(2026, 6, 22, 11, 15),
        locationLat: 2,
        locationLng: 2,
      }),
      // Day 2 pair: same coords 1,1 -> 2,2
      makeEventRow({
        id: 'day2-a',
        startAt: local(2026, 6, 23, 9, 0),
        endAt: local(2026, 6, 23, 10, 0),
        locationLat: 1,
        locationLng: 1,
      }),
      makeEventRow({
        id: 'day2-b',
        startAt: local(2026, 6, 23, 10, 15),
        endAt: local(2026, 6, 23, 11, 15),
        locationLat: 2,
        locationLng: 2,
      }),
    ])
    mockGetCachedTravelTime.mockResolvedValueOnce({ ...ESTIMATE_25, durationMin: 25 })

    const result = await getTravelWarnings(USER_ID)

    expect(mockGetCachedTravelTime).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(2)
    expect(result.map((w) => w.eventId).sort()).toEqual(['day1-b', 'day2-b'])
  })

  it('resolves multiple distinct (origin, destination, mode) lookups independently', async () => {
    mockWhere.mockResolvedValueOnce([])
    mockWhere.mockResolvedValueOnce([
      makeEventRow({
        id: 'day1-a',
        startAt: local(2026, 6, 22, 9, 0),
        endAt: local(2026, 6, 22, 10, 0),
        locationLat: 1,
        locationLng: 1,
      }),
      makeEventRow({
        id: 'day1-b',
        startAt: local(2026, 6, 22, 10, 15),
        endAt: local(2026, 6, 22, 11, 15),
        locationLat: 2,
        locationLng: 2,
      }),
      makeEventRow({
        id: 'day2-a',
        startAt: local(2026, 6, 23, 9, 0),
        endAt: local(2026, 6, 23, 10, 0),
        locationLat: 3,
        locationLng: 3,
      }),
      makeEventRow({
        id: 'day2-b',
        startAt: local(2026, 6, 23, 10, 15),
        endAt: local(2026, 6, 23, 11, 15),
        locationLat: 4,
        locationLng: 4,
      }),
    ])

    // Second lookup resolves before the first.
    mockGetCachedTravelTime
      .mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ ...ESTIMATE_25, durationMin: 25 }), 10),
          ),
      )
      .mockImplementationOnce(() => Promise.resolve({ ...ESTIMATE_25, durationMin: 25 }))

    const result = await getTravelWarnings(USER_ID)

    expect(mockGetCachedTravelTime).toHaveBeenCalledTimes(2)
    expect(result).toHaveLength(2)
  })

  it('passes raw stored coords and no departureTime to getCachedTravelTime', async () => {
    mockWhere.mockResolvedValueOnce([])
    mockWhere.mockResolvedValueOnce([
      makeEventRow({
        id: 'a',
        startAt: local(2026, 6, 22, 9, 0),
        endAt: local(2026, 6, 22, 10, 0),
        locationLat: 40.712776,
        locationLng: -74.005974,
      }),
      makeEventRow({
        id: 'b',
        startAt: local(2026, 6, 22, 10, 15),
        endAt: local(2026, 6, 22, 11, 15),
        locationLat: 40.73061,
        locationLng: -73.935242,
      }),
    ])

    await getTravelWarnings(USER_ID)

    expect(mockGetCachedTravelTime).toHaveBeenCalledWith(USER_ID, {
      origin: { lat: 40.712776, lng: -74.005974 },
      destination: { lat: 40.73061, lng: -73.935242 },
      mode: 'driving',
    })
  })
})
