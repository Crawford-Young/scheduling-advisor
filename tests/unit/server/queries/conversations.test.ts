import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── DB mock ───────────────────────────────────────────────────────────────────
const mockConvLimit = vi.hoisted(() => vi.fn())
const mockConvOrderBy = vi.hoisted(() => vi.fn(() => ({ limit: mockConvLimit })))
const mockConvWhere = vi.hoisted(() => vi.fn(() => ({ orderBy: mockConvOrderBy })))
const mockConvFrom = vi.hoisted(() => vi.fn(() => ({ where: mockConvWhere })))

const mockMsgLimit = vi.hoisted(() => vi.fn())
const mockMsgOrderBy = vi.hoisted(() => vi.fn(() => ({ limit: mockMsgLimit })))
const mockMsgWhere = vi.hoisted(() => vi.fn(() => ({ orderBy: mockMsgOrderBy })))
const mockMsgFrom = vi.hoisted(() => vi.fn(() => ({ where: mockMsgWhere })))

// Alternate between conversations query and messages query on each select() call
const selectCallIndex = vi.hoisted(() => ({ value: 0 }))
const mockSelect = vi.hoisted(() =>
  vi.fn(() => {
    const isConvQuery = selectCallIndex.value % 2 === 0
    selectCallIndex.value++
    return { from: isConvQuery ? mockConvFrom : mockMsgFrom }
  }),
)

vi.mock('@/db', () => ({
  db: { select: mockSelect },
}))
vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}))

import { listConversations } from '@/server/queries/conversations'

const makeConv = (overrides: Record<string, unknown> = {}) => ({
  id: 'conv-1',
  userId: 'user-1',
  type: 'general' as const,
  title: 'Planning session',
  deletedAt: null,
  expiresAt: new Date(Date.now() + 86400000),
  createdAt: new Date('2026-06-01'),
  updatedAt: new Date('2026-06-01'),
  ...overrides,
})

describe('listConversations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selectCallIndex.value = 0
    mockConvLimit.mockResolvedValue([makeConv()])
    mockMsgLimit.mockResolvedValue([])
  })

  it('returns conversations for the current user', async () => {
    const result = await listConversations()
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('conv-1')
    expect(result[0]!.type).toBe('general')
    expect(result[0]!.title).toBe('Planning session')
  })

  it('includes lastMessagePreview from last message content', async () => {
    mockMsgLimit.mockResolvedValueOnce([{ content: 'Hello from the AI', role: 'assistant' }])
    const result = await listConversations()
    expect(result[0]!.lastMessagePreview).toBe('Hello from the AI')
  })

  it('truncates lastMessagePreview to 80 chars', async () => {
    mockMsgLimit.mockResolvedValueOnce([{ content: 'A'.repeat(120), role: 'user' }])
    const result = await listConversations()
    expect(result[0]!.lastMessagePreview).toHaveLength(80)
  })

  it('returns empty string preview when no messages', async () => {
    mockMsgLimit.mockResolvedValueOnce([])
    const result = await listConversations()
    expect(result[0]!.lastMessagePreview).toBe('')
  })

  it('returns empty array when no conversations', async () => {
    mockConvLimit.mockResolvedValueOnce([])
    const result = await listConversations()
    expect(result).toEqual([])
  })

  it('throws Unauthorized if unauthenticated', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    await expect(listConversations()).rejects.toThrow('Unauthorized')
  })

  it('handles non-string message content gracefully', async () => {
    mockMsgLimit.mockResolvedValueOnce([
      { content: { type: 'text', text: 'hello' }, role: 'assistant' },
    ])
    const result = await listConversations()
    expect(result[0]!.lastMessagePreview).toBe('')
  })

  it('handles null message content gracefully', async () => {
    mockMsgLimit.mockResolvedValueOnce([{ content: null, role: 'assistant' }])
    const result = await listConversations()
    expect(result[0]!.lastMessagePreview).toBe('')
  })
})
