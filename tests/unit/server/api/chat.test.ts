import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockInsertValues, mockInsert, mockSelect, mockFindFirst } = vi.hoisted(() => {
  const mockInsertValues = vi.fn().mockResolvedValue([])
  const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues })
  const mockLimit = vi.fn().mockResolvedValue([])
  const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit })
  const mockSelectWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy })
  const mockFrom = vi.fn().mockReturnValue({ where: mockSelectWhere })
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom })
  const mockFindFirst = vi.fn()
  return { mockInsertValues, mockInsert, mockSelect, mockFindFirst }
})

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/db', () => ({
  db: {
    query: { users: { findFirst: mockFindFirst } },
    insert: mockInsert,
    select: mockSelect,
  },
}))
vi.mock('@/db/schema', () => ({ users: {}, messages: {} }))
vi.mock('@/lib/ai', () => ({ defaultModel: 'fake-model' }))
vi.mock('@/lib/redis', () => ({
  ratelimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
}))
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    streamText: vi.fn().mockReturnValue({ toDataStreamResponse: vi.fn(() => new Response('ok')) }),
  }
})
vi.mock('@/server/queries/tokens', () => ({
  getTokenBalance: vi.fn().mockResolvedValue(100),
  deductTokens: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/chat/context-builder', () => ({
  buildContextBlock: vi.fn().mockResolvedValue('test-context-block'),
}))
vi.mock('@/lib/chat/system-prompt', () => ({
  buildSystemPrompt: vi.fn(() => 'test-system-prompt'),
}))
vi.mock('@/server/services', () => ({
  getCalendarService: vi.fn().mockResolvedValue({
    getEvents: vi.fn().mockResolvedValue([]),
    createEvent: vi.fn().mockResolvedValue({
      id: 'e1',
      title: 'T',
      start: new Date(),
      end: new Date(),
      calendarId: 'c',
    }),
  }),
}))
vi.mock('@/server/queries/tasks', () => ({ getUserTasks: vi.fn().mockResolvedValue([]) }))
vi.mock('@/server/queries/check-ins', () => ({ getUserCheckIns: vi.fn().mockResolvedValue([]) }))
vi.mock('@/server/actions/items', () => ({
  markItemComplete: vi.fn().mockResolvedValue({}),
  markItemSkipped: vi.fn().mockResolvedValue({}),
  rescheduleItem: vi.fn().mockResolvedValue({}),
  createHabit: vi.fn().mockResolvedValue({}),
  createGoal: vi.fn().mockResolvedValue({}),
  createTask: vi.fn().mockResolvedValue({}),
  updateItem: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }))
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), desc: vi.fn() }))

import { auth } from '@/auth'
import { ratelimit } from '@/lib/redis'
import { streamText } from 'ai'
import { POST } from '@/app/api/chat/route'

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000'

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/chat', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const res = await POST(makeRequest({ messages: [], conversationId: 'conv-1' }))
    expect(res.status).toBe(401)
  })

  it('proceeds past gates when plan is null but token balance is sufficient', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', plan: null } } as never)
    const { getTokenBalance } = await import('@/server/queries/tokens')
    vi.mocked(getTokenBalance).mockResolvedValueOnce(10)
    mockFindFirst.mockResolvedValueOnce({ timezone: 'UTC' })
    const res = await POST(
      makeRequest({ messages: [{ role: 'user', content: 'hi' }], conversationId: VALID_UUID }),
    )
    expect(res.status).not.toBe(402)
  })

  it('returns 402 when token balance is insufficient', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', plan: 'pro' } } as never)
    const { getTokenBalance } = await import('@/server/queries/tokens')
    vi.mocked(getTokenBalance).mockResolvedValueOnce(0)
    const res = await POST(
      makeRequest({ messages: [{ role: 'user', content: 'hi' }], conversationId: VALID_UUID }),
    )
    expect(res.status).toBe(402)
    expect(await res.json()).toMatchObject({ error: 'insufficient_tokens' })
  })

  it('returns 400 when request body is invalid', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', plan: 'pro' } } as never)
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: true } as never)
    const res = await POST(makeRequest({ messages: [], conversationId: 'not-a-uuid' }))
    expect(res.status).toBe(400)
  })

  it('returns 429 when rate limited', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', plan: 'pro' } } as never)
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)
    const res = await POST(
      makeRequest({ messages: [{ role: 'user', content: 'hi' }], conversationId: VALID_UUID }),
    )
    expect(res.status).toBe(429)
  })

  it('returns 401 when user record not found in db', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', plan: 'pro' } } as never)
    mockFindFirst.mockResolvedValueOnce(null)
    const res = await POST(
      makeRequest({ messages: [{ role: 'user', content: 'hi' }], conversationId: VALID_UUID }),
    )
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'Unauthorized' })
  })

  it('calls streamText with correct system prompt and maxSteps', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', plan: 'pro' } } as never)
    mockFindFirst.mockResolvedValueOnce({ timezone: 'UTC' })
    await POST(
      makeRequest({ messages: [{ role: 'user', content: 'hi' }], conversationId: VALID_UUID }),
    )
    expect(vi.mocked(streamText)).toHaveBeenCalledWith(
      expect.objectContaining({ system: 'test-system-prompt', maxSteps: 5 }),
    )
  })

  it('persists incoming user message before streaming', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', plan: 'pro' } } as never)
    mockFindFirst.mockResolvedValueOnce({ timezone: 'UTC' })
    await POST(
      makeRequest({ messages: [{ role: 'user', content: 'hello' }], conversationId: VALID_UUID }),
    )
    expect(mockInsert).toHaveBeenCalled()
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'user', content: 'hello', conversationId: VALID_UUID }),
    )
  })
})
