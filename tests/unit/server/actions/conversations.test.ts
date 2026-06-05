import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── DB mock ───────────────────────────────────────────────────────────────────
const mockReturning = vi.hoisted(() => vi.fn())
const mockInsertValues = vi.hoisted(() => vi.fn(() => ({ returning: mockReturning })))
const mockInsert = vi.hoisted(() => vi.fn(() => ({ values: mockInsertValues })))

const mockUpdateWhere = vi.hoisted(() => vi.fn())
const mockUpdateSet = vi.hoisted(() => vi.fn(() => ({ where: mockUpdateWhere })))
const mockUpdate = vi.hoisted(() => vi.fn(() => ({ set: mockUpdateSet })))

const mockSelectWhere = vi.hoisted(() => vi.fn())
const mockSelectFrom = vi.hoisted(() => vi.fn(() => ({ where: mockSelectWhere })))
const mockSelect = vi.hoisted(() => vi.fn(() => ({ from: mockSelectFrom })))

vi.mock('@/db', () => ({
  db: { insert: mockInsert, update: mockUpdate, select: mockSelect },
}))
vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}))

import {
  createConversation,
  deleteConversation,
  setConversationTitle,
  bumpConversationExpiry,
} from '@/server/actions/conversations'

// ── createConversation ────────────────────────────────────────────────────────
describe('createConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReturning.mockResolvedValue([{ id: 'conv-1' }])
  })

  it('creates a general conversation with correct fields', async () => {
    const result = await createConversation('general')
    expect(mockInsert).toHaveBeenCalledOnce()
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', type: 'general', title: null }),
    )
    expect(result).toEqual({ id: 'conv-1' })
  })

  it('creates a check_in conversation with date-stamped title', async () => {
    await createConversation('check_in')
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'check_in',
        title: expect.stringMatching(/daily check-in/i),
      }),
    )
  })

  it('sets expiresAt 30 days from now', async () => {
    const before = Date.now()
    await createConversation('general')
    const after = Date.now()
    const { expiresAt } = (mockInsertValues.mock.calls[0] as unknown as [{ expiresAt: Date }])[0]
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + thirtyDaysMs - 1000)
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + thirtyDaysMs + 1000)
  })

  it('throws if unauthenticated', async () => {
    const { auth } = await import('@/auth')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(auth).mockResolvedValueOnce(null as any)
    await expect(createConversation('general')).rejects.toThrow('Unauthorized')
  })

  it('throws Insert failed when insert returns empty', async () => {
    mockReturning.mockResolvedValueOnce([])
    await expect(createConversation('general')).rejects.toThrow('Insert failed')
  })
})

// ── deleteConversation ────────────────────────────────────────────────────────
describe('deleteConversation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectWhere.mockResolvedValue([{ id: 'conv-1', userId: 'user-1' }])
    mockUpdateWhere.mockResolvedValue(undefined)
  })

  it('soft deletes by setting deletedAt', async () => {
    await deleteConversation('conv-1')
    expect(mockUpdate).toHaveBeenCalledOnce()
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ deletedAt: expect.any(Date) }),
    )
  })

  it('throws Unauthorized if unauthenticated', async () => {
    const { auth } = await import('@/auth')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(auth).mockResolvedValueOnce(null as any)
    await expect(deleteConversation('conv-1')).rejects.toThrow('Unauthorized')
  })

  it('throws Forbidden if user does not own conversation', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ id: 'conv-1', userId: 'other-user' }])
    await expect(deleteConversation('conv-1')).rejects.toThrow('Forbidden')
  })

  it('throws NotFound if conversation does not exist', async () => {
    mockSelectWhere.mockResolvedValueOnce([])
    await expect(deleteConversation('conv-1')).rejects.toThrow('NotFound')
  })
})

// ── setConversationTitle ──────────────────────────────────────────────────────
describe('setConversationTitle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateWhere.mockResolvedValue(undefined)
  })

  it('writes title when currently null', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ id: 'conv-1', userId: 'user-1', title: null }])
    await setConversationTitle('conv-1', 'My planning session')
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'My planning session' }),
    )
  })

  it('is a no-op if title already set', async () => {
    mockSelectWhere.mockResolvedValueOnce([
      { id: 'conv-1', userId: 'user-1', title: 'Existing title' },
    ])
    await setConversationTitle('conv-1', 'New title')
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('throws Unauthorized if unauthenticated', async () => {
    const { auth } = await import('@/auth')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(auth).mockResolvedValueOnce(null as any)
    await expect(setConversationTitle('conv-1', 'Title')).rejects.toThrow('Unauthorized')
  })

  it('throws Forbidden if user does not own conversation', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ id: 'conv-1', userId: 'other-user', title: null }])
    await expect(setConversationTitle('conv-1', 'Title')).rejects.toThrow('Forbidden')
  })

  it('is a no-op if conversation does not exist', async () => {
    mockSelectWhere.mockResolvedValueOnce([])
    await setConversationTitle('missing-id', 'Title')
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

// ── bumpConversationExpiry ────────────────────────────────────────────────────
describe('bumpConversationExpiry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectWhere.mockResolvedValue([{ id: 'conv-1', userId: 'user-1' }])
    mockUpdateWhere.mockResolvedValue(undefined)
  })

  it('sets expiresAt 30 days from now', async () => {
    const before = Date.now()
    await bumpConversationExpiry('conv-1')
    const after = Date.now()
    const { expiresAt } = (mockUpdateSet.mock.calls[0] as unknown as [{ expiresAt: Date }])[0]
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + thirtyDaysMs - 1000)
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + thirtyDaysMs + 1000)
  })

  it('updates the correct conversation', async () => {
    await bumpConversationExpiry('conv-1')
    expect(mockUpdate).toHaveBeenCalledOnce()
  })

  it('throws Unauthorized if unauthenticated', async () => {
    const { auth } = await import('@/auth')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(auth).mockResolvedValueOnce(null as any)
    await expect(bumpConversationExpiry('conv-1')).rejects.toThrow('Unauthorized')
  })

  it('is a no-op if conversation does not exist or caller does not own it', async () => {
    mockSelectWhere.mockResolvedValueOnce([{ id: 'conv-1', userId: 'other-user' }])
    await bumpConversationExpiry('conv-1')
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
