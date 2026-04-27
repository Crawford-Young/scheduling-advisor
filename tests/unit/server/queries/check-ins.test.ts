import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockLimitMany = vi.hoisted(() => vi.fn().mockResolvedValue([{ id: 'ci-1' }]))
const mockOrderByMany = vi.hoisted(() => vi.fn().mockReturnValue({ limit: mockLimitMany }))
const mockWhereMany = vi.hoisted(() => vi.fn().mockReturnValue({ orderBy: mockOrderByMany }))
const mockFromMany = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockWhereMany }))

const mockLimitOne = vi.hoisted(() =>
  vi.fn().mockResolvedValue([{ id: 'ci-2', completedAt: null }]),
)
const mockOrderByOne = vi.hoisted(() => vi.fn().mockReturnValue({ limit: mockLimitOne }))
const mockWhereOne = vi.hoisted(() => vi.fn().mockReturnValue({ orderBy: mockOrderByOne }))
const mockFromOne = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockWhereOne }))

let callCount = 0
const mockSelect = vi.hoisted(() =>
  vi.fn().mockImplementation(() => {
    callCount++
    return callCount % 2 === 1 ? { from: mockFromMany } : { from: mockFromOne }
  }),
)

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'user-123' } }),
}))
vi.mock('@/db', () => ({ db: { select: mockSelect } }))
vi.mock('@/db/schema', () => ({ checkIns: {} }))

import { getUserCheckIns, getPendingCheckIn } from '@/server/queries/check-ins'

describe('getUserCheckIns', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    callCount = 0
  })

  it('returns check-ins for authenticated user', async () => {
    const result = await getUserCheckIns()
    expect(result).toEqual([{ id: 'ci-1' }])
  })

  it('returns empty array when unauthenticated', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const result = await getUserCheckIns()
    expect(result).toEqual([])
  })
})

describe('getPendingCheckIn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    callCount = 1
  })

  it('returns pending check-in for authenticated user', async () => {
    const result = await getPendingCheckIn()
    expect(result).toEqual({ id: 'ci-2', completedAt: null })
  })

  it('returns null when unauthenticated', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const result = await getPendingCheckIn()
    expect(result).toBeNull()
  })

  it('returns null when no pending check-in', async () => {
    mockLimitOne.mockResolvedValueOnce([])
    const result = await getPendingCheckIn()
    expect(result).toBeNull()
  })
})
