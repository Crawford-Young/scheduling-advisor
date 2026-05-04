import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/* eslint-disable @typescript-eslint/no-unused-vars -- intermediate chain mocks are used as return values inside vi.hoisted but not referenced directly in tests */
const {
  mockInsertValues,
  mockInsert,
  mockLimit,
  mockOrderBy,
  mockSelectWhere,
  mockFrom,
  mockSelect,
  mockFindFirst,
} = vi.hoisted(() => {
  const mockInsertValues = vi.fn().mockResolvedValue([])
  const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues })
  const mockLimit = vi.fn().mockResolvedValue([])
  const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit })
  const mockSelectWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy })
  const mockFrom = vi.fn().mockReturnValue({ where: mockSelectWhere })
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom })
  const mockFindFirst = vi.fn()
  return {
    mockInsertValues,
    mockInsert,
    mockLimit,
    mockOrderBy,
    mockSelectWhere,
    mockFrom,
    mockSelect,
    mockFindFirst,
  }
})
/* eslint-enable @typescript-eslint/no-unused-vars */

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/db', () => ({
  db: {
    query: { users: { findFirst: mockFindFirst } },
    insert: mockInsert,
    select: mockSelect,
  },
}))
vi.mock('@/db/schema', () => ({ users: {}, messages: {} }))
vi.mock('@/lib/encryption', () => ({ decrypt: vi.fn(() => 'sk-ant-decrypted') }))
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
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => () => 'model-instance'),
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
vi.mock('@/lib/chat/system-prompt', () => ({ systemPrompt: 'test-system-prompt' }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }))
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), desc: vi.fn() }))
vi.mock('@/components/tambo/task-card', () => ({ taskCardPropsSchema: { _def: {} } }))
vi.mock('@/components/tambo/habit-card', () => ({ habitCardPropsSchema: { _def: {} } }))
vi.mock('@/components/tambo/goal-card', () => ({ goalCardPropsSchema: { _def: {} } }))
vi.mock('@/components/tambo/schedule-suggestion', () => ({
  scheduleSuggestionPropsSchema: { _def: {} },
}))
vi.mock('@/components/tambo/reflection-card', () => ({ reflectionCardPropsSchema: { _def: {} } }))
vi.mock('@/components/tambo/week-calendar-view', () => ({
  weekCalendarViewPropsSchema: { _def: {} },
}))
vi.mock('@/components/tambo/life-balance-view', () => ({
  lifeBalanceViewPropsSchema: { _def: {} },
}))

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
    vi.mocked(auth).mockResolvedValue(null)
    const res = await POST(makeRequest({ messages: [], conversationId: 'conv-1' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when request body is invalid', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: true } as never)
    const res = await POST(makeRequest({ messages: [], conversationId: 'not-a-uuid' }))
    expect(res.status).toBe(400)
  })

  it('returns 429 when rate limited', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
    vi.mocked(ratelimit.limit).mockResolvedValueOnce({ success: false } as never)
    const res = await POST(
      makeRequest({ messages: [{ role: 'user', content: 'hi' }], conversationId: VALID_UUID }),
    )
    expect(res.status).toBe(429)
  })

  it('returns 400 with no_api_key when user has no key', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
    mockFindFirst.mockResolvedValueOnce({
      anthropicApiKey: null,
      preferredModel: 'claude-sonnet-4-6',
    })
    const res = await POST(
      makeRequest({ messages: [{ role: 'user', content: 'hi' }], conversationId: VALID_UUID }),
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'no_api_key' })
  })

  it('returns 400 with no_api_key when user record not found', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
    mockFindFirst.mockResolvedValueOnce(null)
    const res = await POST(
      makeRequest({ messages: [{ role: 'user', content: 'hi' }], conversationId: VALID_UUID }),
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'no_api_key' })
  })

  it('calls streamText with correct system prompt and maxSteps', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
    mockFindFirst.mockResolvedValueOnce({
      anthropicApiKey: 'enc-key',
      preferredModel: 'claude-sonnet-4-6',
    })
    await POST(
      makeRequest({ messages: [{ role: 'user', content: 'hi' }], conversationId: VALID_UUID }),
    )
    expect(vi.mocked(streamText)).toHaveBeenCalledWith(
      expect.objectContaining({ system: 'test-system-prompt', maxSteps: 5 }),
    )
  })

  it('persists incoming user message before streaming', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
    mockFindFirst.mockResolvedValueOnce({
      anthropicApiKey: 'enc-key',
      preferredModel: 'claude-sonnet-4-6',
    })
    await POST(
      makeRequest({ messages: [{ role: 'user', content: 'hello' }], conversationId: VALID_UUID }),
    )
    expect(mockInsert).toHaveBeenCalled()
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'user', content: 'hello', conversationId: VALID_UUID }),
    )
  })
})
