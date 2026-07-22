import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInsert = vi.hoisted(() => vi.fn())
const mockInsertValues = vi.hoisted(() => vi.fn())
const mockInsertReturning = vi.hoisted(() => vi.fn())
const mockInsertOnConflict = vi.hoisted(() => vi.fn())

const mockSelect = vi.hoisted(() => vi.fn())
const mockSelectFrom = vi.hoisted(() => vi.fn())
const mockSelectWhere = vi.hoisted(() => vi.fn())
const mockSelectLimit = vi.hoisted(() => vi.fn())

const mockUpdate = vi.hoisted(() => vi.fn())
const mockUpdateSet = vi.hoisted(() => vi.fn())
const mockUpdateWhere = vi.hoisted(() => vi.fn())
const mockUpdateReturning = vi.hoisted(() => vi.fn())

const mockDelete = vi.hoisted(() => vi.fn())
const mockDeleteWhere = vi.hoisted(() => vi.fn())
const mockDeleteReturning = vi.hoisted(() => vi.fn())

const mockGeocode = vi.hoisted(() => vi.fn())
const mockGetTravelService = vi.hoisted(() => vi.fn())
const mockGetUserTravelPlan = vi.hoisted(() => vi.fn())
const mockRatelimitLimit = vi.hoisted(() => vi.fn())

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'user-123' } }),
}))

vi.mock('@/lib/redis', () => ({
  ratelimit: { limit: mockRatelimitLimit },
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/server/travel', () => ({
  getUserTravelPlan: mockGetUserTravelPlan,
}))

vi.mock('@/server/services', () => ({
  getTravelService: mockGetTravelService,
}))

vi.mock('@/db', () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
    delete: mockDelete,
  },
}))

vi.mock('@/db/schema', () => ({
  places: { id: 'places.id', userId: 'places.userId', name: 'places.name' },
  calendarPrefs: { userId: 'calendarPrefs.userId' },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
}))

import { listPlaces, savePlace, deletePlace, setTravelMode } from '@/server/actions/places'
import { auth } from '@/auth'

const USER_ID = 'user-123'
const PLACE_ID = '550e8400-e29b-41d4-a716-446655440000'

function placeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PLACE_ID,
    userId: USER_ID,
    name: 'Home',
    address: '1 Main St',
    lat: 40.7128,
    lng: -74.006,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

describe('module export shape', () => {
  it('every export from places is a function (use server contract)', async () => {
    const mod = await import('@/server/actions/places')
    for (const [name, value] of Object.entries(mod)) {
      expect(typeof value, `export "${name}" must be a function`).toBe('function')
    }
  })
})

describe('listPlaces', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(auth).mockResolvedValue({ user: { id: USER_ID } } as never)
    mockGetUserTravelPlan.mockResolvedValue(true)
    mockSelect.mockReturnValue({ from: mockSelectFrom })
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere })
    mockSelectWhere.mockResolvedValue([placeRow()])
  })

  it('returns [] when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const result = await listPlaces()
    expect(result).toEqual([])
  })

  it('returns [] for a free-plan user', async () => {
    mockGetUserTravelPlan.mockResolvedValueOnce(false)
    const result = await listPlaces()
    expect(result).toEqual([])
  })

  it("returns the user's places scoped by userId", async () => {
    const result = await listPlaces()
    expect(result).toEqual([placeRow()])
    expect(mockSelectFrom).toHaveBeenCalled()
    expect(mockSelectWhere).toHaveBeenCalledWith({
      op: 'eq',
      col: 'places.userId',
      val: USER_ID,
    })
  })
})

describe('savePlace', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(auth).mockResolvedValue({ user: { id: USER_ID } } as never)
    mockRatelimitLimit.mockResolvedValue({ success: true })
    mockGetUserTravelPlan.mockResolvedValue(true)
    mockGetTravelService.mockResolvedValue({ geocode: mockGeocode })
    mockGeocode.mockResolvedValue({ lat: 40.7128, lng: -74.006 })

    // select().from().where().limit() — duplicate-name pre-check.
    mockSelect.mockReturnValue({ from: mockSelectFrom })
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere })
    mockSelectWhere.mockReturnValue({ limit: mockSelectLimit })
    mockSelectLimit.mockResolvedValue([])

    // insert().values().returning() — create path.
    mockInsert.mockReturnValue({ values: mockInsertValues })
    mockInsertValues.mockReturnValue({ returning: mockInsertReturning })
    mockInsertReturning.mockResolvedValue([placeRow()])

    // update().set().where().returning() — update-by-id path.
    mockUpdate.mockReturnValue({ set: mockUpdateSet })
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere })
    mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning })
    mockUpdateReturning.mockResolvedValue([placeRow({ name: 'Updated' })])
  })

  it('returns Unauthorized when no session', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const result = await savePlace({ name: 'Home', address: '1 Main St' })
    expect(result).toEqual({ ok: false, error: 'Unauthorized' })
  })

  it('returns rate-limit error when limited', async () => {
    mockRatelimitLimit.mockResolvedValueOnce({ success: false })
    const result = await savePlace({ name: 'Home', address: '1 Main St' })
    expect(result).toMatchObject({ ok: false })
  })

  it('returns a validation error on bad input', async () => {
    const result = await savePlace({ name: '', address: '1 Main St' })
    expect(result.ok).toBe(false)
  })

  it('returns subscription-required for a free-plan user', async () => {
    mockGetUserTravelPlan.mockResolvedValueOnce(false)
    const result = await savePlace({ name: 'Home', address: '1 Main St' })
    expect(result).toEqual({ ok: false, error: 'subscription required' })
  })

  it('returns address-not-found when geocode resolves null', async () => {
    mockGeocode.mockResolvedValueOnce(null)
    const result = await savePlace({ name: 'Home', address: 'nowhere' })
    expect(result).toEqual({ ok: false, error: 'address not found' })
  })

  it('returns a friendly error on duplicate name (case-insensitive) for a new place', async () => {
    mockSelectLimit.mockResolvedValueOnce([{ id: 'other-id' }])
    const result = await savePlace({ name: 'Home', address: '1 Main St' })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/already have a place/i)
    expect(mockInsertValues).not.toHaveBeenCalled()
  })

  it('allows update-by-id to keep its own name (no false duplicate)', async () => {
    mockSelectLimit.mockResolvedValueOnce([{ id: PLACE_ID }])
    const result = await savePlace({ id: PLACE_ID, name: 'Home', address: '1 Main St' })
    expect(result.ok).toBe(true)
    expect(mockUpdateWhere).toHaveBeenCalled()
  })

  it('inserts a new place with resolved coords and returns it', async () => {
    const result = await savePlace({ name: 'Home', address: '1 Main St' })
    expect(result.ok).toBe(true)
    expect(result.place).toEqual(placeRow())
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        name: 'Home',
        address: '1 Main St',
        lat: 40.7128,
        lng: -74.006,
      }),
    )
  })

  it('updates an existing place by id', async () => {
    const result = await savePlace({ id: PLACE_ID, name: 'Updated', address: '1 Main St' })
    expect(result.ok).toBe(true)
    expect(result.place).toEqual(placeRow({ name: 'Updated' }))
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Updated', address: '1 Main St' }),
    )
  })

  it('returns Not found when updating a nonexistent/foreign id', async () => {
    mockUpdateReturning.mockResolvedValueOnce([])
    const result = await savePlace({ id: PLACE_ID, name: 'Home', address: '1 Main St' })
    expect(result).toEqual({ ok: false, error: 'Not found' })
  })

  it('returns Insert failed when the insert returns no row', async () => {
    mockInsertReturning.mockResolvedValueOnce([])
    const result = await savePlace({ name: 'Home', address: '1 Main St' })
    expect(result).toEqual({ ok: false, error: 'Insert failed' })
  })
})

describe('deletePlace', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(auth).mockResolvedValue({ user: { id: USER_ID } } as never)
    mockRatelimitLimit.mockResolvedValue({ success: true })
    mockGetUserTravelPlan.mockResolvedValue(true)
    mockDelete.mockReturnValue({ where: mockDeleteWhere })
    mockDeleteWhere.mockReturnValue({ returning: mockDeleteReturning })
    mockDeleteReturning.mockResolvedValue([{ id: PLACE_ID }])
  })

  it('returns ok:false when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const result = await deletePlace({ id: PLACE_ID })
    expect(result).toEqual({ ok: false })
  })

  it('returns ok:false for a free-plan user', async () => {
    mockGetUserTravelPlan.mockResolvedValueOnce(false)
    const result = await deletePlace({ id: PLACE_ID })
    expect(result).toEqual({ ok: false })
  })

  it('returns ok:false when rate-limited', async () => {
    mockRatelimitLimit.mockResolvedValueOnce({ success: false })
    const result = await deletePlace({ id: PLACE_ID })
    expect(result).toEqual({ ok: false })
  })

  it('returns ok:false on bad input', async () => {
    const result = await deletePlace({})
    expect(result).toEqual({ ok: false })
  })

  it('deletes scoped to id + userId and returns ok:true', async () => {
    const result = await deletePlace({ id: PLACE_ID })
    expect(result).toEqual({ ok: true })
    expect(mockDeleteWhere).toHaveBeenCalledWith({
      op: 'and',
      args: [
        { op: 'eq', col: 'places.id', val: PLACE_ID },
        { op: 'eq', col: 'places.userId', val: USER_ID },
      ],
    })
  })

  it('returns ok:false when nothing was deleted (not found/foreign)', async () => {
    mockDeleteReturning.mockResolvedValueOnce([])
    const result = await deletePlace({ id: PLACE_ID })
    expect(result).toEqual({ ok: false })
  })
})

describe('setTravelMode', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(auth).mockResolvedValue({ user: { id: USER_ID } } as never)
    mockRatelimitLimit.mockResolvedValue({ success: true })
    mockGetUserTravelPlan.mockResolvedValue(true)
    mockInsert.mockReturnValue({ values: mockInsertValues })
    mockInsertValues.mockReturnValue({ onConflictDoUpdate: mockInsertOnConflict })
    mockInsertOnConflict.mockResolvedValue([{ userId: USER_ID, travelMode: 'walking' }])
  })

  it('returns ok:false when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const result = await setTravelMode({ travelMode: 'walking' })
    expect(result).toEqual({ ok: false })
  })

  it('returns ok:false for a free-plan user', async () => {
    mockGetUserTravelPlan.mockResolvedValueOnce(false)
    const result = await setTravelMode({ travelMode: 'walking' })
    expect(result).toEqual({ ok: false })
  })

  it('returns ok:false when rate-limited', async () => {
    mockRatelimitLimit.mockResolvedValueOnce({ success: false })
    const result = await setTravelMode({ travelMode: 'walking' })
    expect(result).toEqual({ ok: false })
  })

  it('returns ok:false on bad input', async () => {
    const result = await setTravelMode({ travelMode: 'flying' })
    expect(result).toEqual({ ok: false })
  })

  it('upserts calendarPrefs.travelMode and returns ok:true', async () => {
    const result = await setTravelMode({ travelMode: 'walking' })
    expect(result).toEqual({ ok: true })
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, travelMode: 'walking' }),
    )
    expect(mockInsertOnConflict).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'calendarPrefs.userId',
        set: expect.objectContaining({ travelMode: 'walking' }),
      }),
    )
  })
})
