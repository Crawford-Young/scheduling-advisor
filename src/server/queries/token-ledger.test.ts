import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockLedgerRows = [
  {
    id: 'led-1',
    userId: 'user-1',
    type: 'monthly_grant' as const,
    amount: 100,
    createdAt: new Date('2026-06-10T12:00:00Z'),
  },
  {
    id: 'led-2',
    userId: 'user-1',
    type: 'usage' as const,
    amount: -5,
    createdAt: new Date('2026-06-09T08:00:00Z'),
  },
]

const mockLimit = vi.fn()
const mockOrderBy = vi.fn()
const mockWhere = vi.fn()
const mockFrom = vi.fn()
const mockSelect = vi.fn()

vi.mock('@/db', () => ({
  db: {
    select: mockSelect,
  },
}))

vi.mock('@/db/schema', () => ({
  tokenLedger: {},
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => val),
  desc: vi.fn((col) => col),
}))

beforeEach(() => {
  mockLimit.mockResolvedValue(mockLedgerRows)
  mockOrderBy.mockReturnValue({ limit: mockLimit })
  mockWhere.mockReturnValue({ orderBy: mockOrderBy })
  mockFrom.mockReturnValue({ where: mockWhere })
  mockSelect.mockReturnValue({ from: mockFrom })
})

describe('getTokenLedger', () => {
  it('selects from tokenLedger where userId and orders by createdAt desc', async () => {
    const { getTokenLedger } = await import('./token-ledger')
    await getTokenLedger('user-1')

    expect(mockSelect).toHaveBeenCalled()
    expect(mockFrom).toHaveBeenCalled()
    expect(mockWhere).toHaveBeenCalledWith('user-1')
    expect(mockOrderBy).toHaveBeenCalled()
  })

  it('applies the limit parameter', async () => {
    const { getTokenLedger } = await import('./token-ledger')
    await getTokenLedger('user-1', 25)

    expect(mockLimit).toHaveBeenCalledWith(25)
  })

  it('uses default limit of 50 when not specified', async () => {
    const { getTokenLedger } = await import('./token-ledger')
    await getTokenLedger('user-1')

    expect(mockLimit).toHaveBeenCalledWith(50)
  })

  it('returns rows mapped to LedgerEntry shape', async () => {
    const { getTokenLedger } = await import('./token-ledger')
    const result = await getTokenLedger('user-1')

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      id: 'led-1',
      type: 'monthly_grant',
      amount: 100,
      createdAt: expect.any(Date),
    })
    expect(result[1]).toMatchObject({
      id: 'led-2',
      type: 'usage',
      amount: -5,
    })
  })

  it('returns empty array when no ledger rows found', async () => {
    mockLimit.mockResolvedValueOnce([])
    const { getTokenLedger } = await import('./token-ledger')
    const result = await getTokenLedger('user-42')

    expect(result).toEqual([])
  })
})
