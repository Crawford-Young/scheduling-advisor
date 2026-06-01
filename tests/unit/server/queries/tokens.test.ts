import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSelect = vi.hoisted(() => {
  const mockWhere = vi.fn().mockResolvedValue([{ balance: 500 }])
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
  const select = vi.fn().mockReturnValue({ from: mockFrom })
  return { select, mockFrom, mockWhere }
})

const mockInsert = vi.hoisted(() => {
  const mockValues = vi.fn().mockResolvedValue(undefined)
  const insert = vi.fn().mockReturnValue({ values: mockValues })
  return { insert, mockValues }
})

vi.mock('@/db', () => ({ db: { select: mockSelect.select, insert: mockInsert.insert } }))
vi.mock('@/db/schema', () => ({ tokenLedger: {} }))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  sql: vi.fn().mockReturnValue('sql_expr'),
}))

import { getTokenBalance, deductTokens } from '@/server/queries/tokens'

describe('getTokenBalance', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns balance from ledger sum', async () => {
    const balance = await getTokenBalance('user-1')
    expect(balance).toBe(500)
    expect(mockSelect.select).toHaveBeenCalled()
  })

  it('returns 0 when no rows exist', async () => {
    mockSelect.mockWhere.mockResolvedValueOnce([{ balance: 0 }])
    const balance = await getTokenBalance('user-2')
    expect(balance).toBe(0)
  })
})

describe('deductTokens', () => {
  beforeEach(() => vi.clearAllMocks())

  it('inserts a negative usage row', async () => {
    await deductTokens('user-1', 1500)
    expect(mockInsert.insert).toHaveBeenCalled()
    expect(mockInsert.mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'usage', amount: -2 }),
    )
  })

  it('rounds up to nearest credit (1001 tokens = 2 credits)', async () => {
    await deductTokens('user-1', 1001)
    expect(mockInsert.mockValues).toHaveBeenCalledWith(expect.objectContaining({ amount: -2 }))
  })

  it('deducts exactly 1 credit for 1000 tokens', async () => {
    await deductTokens('user-1', 1000)
    expect(mockInsert.mockValues).toHaveBeenCalledWith(expect.objectContaining({ amount: -1 }))
  })
})
