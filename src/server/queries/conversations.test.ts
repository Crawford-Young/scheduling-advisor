import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockMessages = [
  { id: 'msg-1', conversationId: 'conv-1', role: 'user', content: 'Hello', createdAt: new Date() },
  {
    id: 'msg-2',
    conversationId: 'conv-1',
    role: 'assistant',
    content: [{ type: 'text', text: 'Hi there' }],
    createdAt: new Date(),
  },
  {
    id: 'msg-3',
    conversationId: 'conv-1',
    role: 'assistant',
    content: [{ type: 'tool-call', toolCallId: 'tc1', toolName: 'showWeekCalendar', args: {} }],
    createdAt: new Date(),
  },
]

const mockSelect = vi.fn()
const mockFrom = vi.fn()
const mockWhere = vi.fn()
const mockOrderBy = vi.fn()

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}))

vi.mock('@/db', () => ({
  db: {
    select: mockSelect,
  },
}))

vi.mock('@/db/schema', () => ({
  messages: {},
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => val),
  desc: vi.fn((col) => col),
  asc: vi.fn((col) => col),
}))

beforeEach(() => {
  mockOrderBy.mockResolvedValue(mockMessages)
  mockWhere.mockReturnValue({ orderBy: mockOrderBy })
  mockFrom.mockReturnValue({ where: mockWhere })
  mockSelect.mockReturnValue({ from: mockFrom })
})

describe('getConversationMessages', () => {
  it('returns messages mapped to id/role/content', async () => {
    const { getConversationMessages } = await import('./conversations')
    const result = await getConversationMessages('conv-1')

    expect(result).toHaveLength(3)
    expect(result[0]).toMatchObject({ id: 'msg-1', role: 'user', content: 'Hello' })
  })

  it('extracts text from array content', async () => {
    const { getConversationMessages } = await import('./conversations')
    const result = await getConversationMessages('conv-1')

    expect(result[1]).toMatchObject({ id: 'msg-2', role: 'assistant', content: 'Hi there' })
  })

  it('returns empty string for non-text-only tool messages', async () => {
    const { getConversationMessages } = await import('./conversations')
    const result = await getConversationMessages('conv-1')

    expect(result[2]).toMatchObject({ id: 'msg-3', role: 'assistant', content: '' })
  })

  it('returns empty string for null or object content', async () => {
    mockOrderBy.mockResolvedValueOnce([
      {
        id: 'msg-null',
        conversationId: 'conv-1',
        role: 'assistant',
        content: null,
        createdAt: new Date(),
      },
      {
        id: 'msg-obj',
        conversationId: 'conv-1',
        role: 'assistant',
        content: { unexpected: true },
        createdAt: new Date(),
      },
    ])
    const { getConversationMessages } = await import('./conversations')
    const result = await getConversationMessages('conv-1')

    expect(result[0]!.content).toBe('')
    expect(result[1]!.content).toBe('')
  })
})
