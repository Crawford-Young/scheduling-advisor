import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockInsertValues, mockInsert, mockSelect, mockFindFirst, mockConvWhere, mockLimit } =
  vi.hoisted(() => {
    const mockInsertValues = vi.fn().mockResolvedValue([])
    const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues })
    const mockLimit = vi.fn().mockResolvedValue([])
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockSelectWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy })
    const mockFrom = vi.fn().mockReturnValue({ where: mockSelectWhere })
    // The ownership-guard/tier fetch is a projected select awaited directly (no orderBy chain);
    // the history fetch is an un-projected select. Branch on the projection argument.
    const mockConvWhere = vi.fn().mockResolvedValue([{ model: 'sonnet' }])
    const mockConvFrom = vi.fn().mockReturnValue({ where: mockConvWhere })
    const mockSelect = vi.fn((projection?: unknown) =>
      projection ? { from: mockConvFrom } : { from: mockFrom },
    )
    const mockFindFirst = vi.fn()
    return { mockInsertValues, mockInsert, mockSelect, mockFindFirst, mockConvWhere, mockLimit }
  })

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/db', () => ({
  db: {
    query: { users: { findFirst: mockFindFirst } },
    insert: mockInsert,
    select: mockSelect,
  },
}))
vi.mock('@/db/schema', () => ({ users: {}, messages: {}, conversations: { model: {} } }))
vi.mock('@/lib/ai', () => ({ quickModel: 'fake-quick' }))
vi.mock('@/lib/chat/model-tiers', () => ({
  MODEL_TIERS: {
    sonnet: { tier: 'sonnet', model: 'fake-model', multiplier: 1, label: 'Sonnet' },
    opus: { tier: 'opus', model: 'fake-opus', multiplier: 2, label: 'Opus' },
  },
}))
vi.mock('@/server/actions/conversations', () => ({
  bumpConversationExpiry: vi.fn().mockResolvedValue(undefined),
}))
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
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), desc: vi.fn(), and: vi.fn(), isNull: vi.fn() }))

import { auth } from '@/auth'
import { ratelimit } from '@/lib/redis'
import { streamText } from 'ai'
import { logger } from '@/lib/logger'
import { POST } from '@/app/api/chat/route'

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000'
const CONVO_ID = VALID_UUID

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

function mockAuthed(): void {
  vi.mocked(auth).mockResolvedValue({ user: { id: 'u1', plan: 'pro' } } as never)
  vi.mocked(ratelimit.limit).mockResolvedValue({ success: true } as never)
  mockFindFirst.mockResolvedValue({ timezone: 'UTC' })
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

  it('quick-schedule: streams without touching conversations/messages tables', async () => {
    mockAuthed()
    const res = await POST(
      makeRequest({
        messages: [{ role: 'user', content: 'date 6pm a month from now' }],
        mode: 'quick-schedule',
      }),
    )
    expect(res.status).toBe(200)
    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockSelect).not.toHaveBeenCalled()
    const args = vi.mocked(streamText).mock.calls[0]![0]
    expect(args.model as unknown as string).toBe('fake-quick')
    expect(Object.keys(args.tools!)).toHaveLength(3)
    expect(args.maxSteps).toBe(2)
  })

  it('persisted: unchanged advisor behavior with split system messages', async () => {
    mockAuthed()
    const res = await POST(
      makeRequest({ messages: [{ role: 'user', content: 'hi' }], conversationId: CONVO_ID }),
    )
    expect(res.status).toBe(200)
    const args = vi.mocked(streamText).mock.calls[0]![0]
    const sys = (args.messages as Array<{ role: string; providerOptions?: unknown }>).filter(
      (m) => m.role === 'system',
    )
    expect(sys).toHaveLength(2)
    expect(sys[0]!.providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    })
    expect(sys[1]!.providerOptions).toBeUndefined()
    expect(Object.keys(args.tools!)).toHaveLength(19)
  })

  it('persisted: concatenated system content stays byte-equivalent to the prior single message', async () => {
    mockAuthed()
    await POST(
      makeRequest({ messages: [{ role: 'user', content: 'hi' }], conversationId: CONVO_ID }),
    )
    const args = vi.mocked(streamText).mock.calls[0]![0]
    const sys = (args.messages as Array<{ role: string; content: string }>).filter(
      (m) => m.role === 'system',
    )
    expect(sys[0]!.content + sys[1]!.content).toBe('test-system-prompttest-context-block')
    expect(args.maxSteps).toBe(5)
  })

  it('400 on body with neither conversationId nor quick mode', async () => {
    mockAuthed()
    expect((await POST(makeRequest({ messages: [{ role: 'user', content: 'hi' }] }))).status).toBe(
      400,
    )
  })

  it('deducts cache-class-weighted tokens via onFinish', async () => {
    mockAuthed()
    const { deductTokens } = await import('@/server/queries/tokens')
    await POST(
      makeRequest({ messages: [{ role: 'user', content: 'hi' }], conversationId: CONVO_ID }),
    )
    const args = vi.mocked(streamText).mock.calls[0]![0]
    await args.onFinish!({
      response: { messages: [] },
      usage: { promptTokens: 1000, completionTokens: 200 },
      providerMetadata: { anthropic: { cacheReadInputTokens: 800 } },
    } as never)
    // promptTokens is net of cache tokens: 1000 + 200 + 800 * 0.1 = 1280
    expect(deductTokens).toHaveBeenCalledWith('u1', 1280)
  })

  it('returns 403 and inserts no message when the conversation is not owned by the user', async () => {
    mockAuthed()
    // Foreign conversation: the userId-scoped ownership query returns no row.
    mockConvWhere.mockResolvedValueOnce([])
    const res = await POST(
      makeRequest({ messages: [{ role: 'user', content: 'hi' }], conversationId: CONVO_ID }),
    )
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'Not found' })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('returns 403 when the conversation is missing or soft-deleted', async () => {
    mockAuthed()
    // Missing / deletedAt-set conversation: the isNull(deletedAt) query returns no row.
    mockConvWhere.mockResolvedValueOnce([])
    const res = await POST(
      makeRequest({ messages: [{ role: 'user', content: 'hi' }], conversationId: CONVO_ID }),
    )
    expect(res.status).toBe(403)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('persisted: a legacy haiku row falls back to Sonnet ×1 (model + billing + tier)', async () => {
    mockAuthed()
    // 'haiku' was removed as a tier; a pre-existing row must degrade to Sonnet ×1
    // rather than leaving tierConfig undefined.
    mockConvWhere.mockResolvedValueOnce([{ model: 'haiku' }])
    const { deductTokens } = await import('@/server/queries/tokens')
    await POST(
      makeRequest({ messages: [{ role: 'user', content: 'hi' }], conversationId: CONVO_ID }),
    )
    const args = vi.mocked(streamText).mock.calls[0]![0]
    expect(args.model as unknown as string).toBe('fake-model')
    await args.onFinish!({
      response: { messages: [] },
      usage: { promptTokens: 1000, completionTokens: 200 },
      providerMetadata: { anthropic: { cacheReadInputTokens: 800 } },
    } as never)
    // raw = 1000 + 200 + 800*0.1 = 1280; ceil(1280 * 1) = 1280
    expect(deductTokens).toHaveBeenCalledWith('u1', 1280)
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ weighted: 1280, tier: 'sonnet' }),
      'chat token usage',
    )
  })

  it('persisted: opus tier resolves the opus model and bills raw×2 (single ceil)', async () => {
    mockAuthed()
    mockConvWhere.mockResolvedValueOnce([{ model: 'opus' }])
    const { deductTokens } = await import('@/server/queries/tokens')
    await POST(
      makeRequest({ messages: [{ role: 'user', content: 'hi' }], conversationId: CONVO_ID }),
    )
    const args = vi.mocked(streamText).mock.calls[0]![0]
    expect(args.model as unknown as string).toBe('fake-opus')
    await args.onFinish!({
      response: { messages: [] },
      usage: { promptTokens: 1000, completionTokens: 200 },
      providerMetadata: { anthropic: { cacheReadInputTokens: 800 } },
    } as never)
    // raw = 1280; ceil(1280 * 2) = 2560
    expect(deductTokens).toHaveBeenCalledWith('u1', 2560)
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ weighted: 2560, tier: 'opus' }),
      'chat token usage',
    )
  })

  it('quick-schedule lane keeps mode.model, multiplier 1, null tier, and never fetches a row', async () => {
    mockAuthed()
    const { deductTokens } = await import('@/server/queries/tokens')
    await POST(
      makeRequest({
        messages: [{ role: 'user', content: 'date 6pm a month from now' }],
        mode: 'quick-schedule',
      }),
    )
    expect(mockConvWhere).not.toHaveBeenCalled()
    const args = vi.mocked(streamText).mock.calls[0]![0]
    expect(args.model as unknown as string).toBe('fake-quick')
    await args.onFinish!({
      response: { messages: [] },
      usage: { promptTokens: 1000, completionTokens: 200 },
      providerMetadata: {},
    } as never)
    // raw = 1200; ceil(1200 * 1) = 1200
    expect(deductTokens).toHaveBeenCalledWith('u1', 1200)
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ weighted: 1200, tier: null }),
      'chat token usage',
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

  it('onFinish persists assistant TEXT only, stripping proposeEvent tool blocks', async () => {
    mockAuthed()
    await POST(
      makeRequest({ messages: [{ role: 'user', content: 'hi' }], conversationId: CONVO_ID }),
    )
    const args = vi.mocked(streamText).mock.calls[0]![0]
    mockInsertValues.mockClear()
    await args.onFinish!({
      response: {
        messages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 't1',
                toolName: 'proposeEvent',
                args: { title: 'x' },
              },
            ],
          },
          { role: 'tool', content: [{ type: 'tool-result', toolCallId: 't1', result: {} }] },
          { role: 'assistant', content: [{ type: 'text', text: 'Here is the proposed event' }] },
        ],
      },
      usage: undefined,
    } as never)
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'assistant',
        content: 'Here is the proposed event',
        conversationId: CONVO_ID,
      }),
    )
  })

  it('onFinish persists NO assistant row when the response is all tool blocks (no text)', async () => {
    mockAuthed()
    await POST(
      makeRequest({ messages: [{ role: 'user', content: 'hi' }], conversationId: CONVO_ID }),
    )
    const args = vi.mocked(streamText).mock.calls[0]![0]
    mockInsertValues.mockClear()
    await args.onFinish!({
      response: {
        messages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 't1',
                toolName: 'proposeEvent',
                args: { title: 'x' },
              },
            ],
          },
          { role: 'tool', content: [{ type: 'tool-result', toolCallId: 't1', result: {} }] },
        ],
      },
      usage: undefined,
    } as never)
    expect(mockInsertValues).not.toHaveBeenCalledWith(
      expect.objectContaining({ role: 'assistant' }),
    )
  })

  it('replay normalizes a legacy structured assistant row to clean text', async () => {
    mockAuthed()
    // Supplied newest-first (matches orderBy(desc)): a preceding user turn keeps
    // the legacy assistant row from being the leading turn — realistic, since
    // production history always has the just-inserted current user message
    // ahead of any earlier row in the chronological order.
    mockLimit.mockResolvedValueOnce([
      {
        role: 'assistant',
        content: [
          { type: 'tool-call', toolCallId: 't1', toolName: 'proposeEvent', args: {} },
          { type: 'text', text: 'hi' },
        ],
      },
      { role: 'user', content: 'earlier' },
    ])
    await POST(
      makeRequest({ messages: [{ role: 'user', content: 'follow up' }], conversationId: CONVO_ID }),
    )
    const args = vi.mocked(streamText).mock.calls[0]![0]
    const turns = (args.messages as Array<{ role: string; content: unknown }>).filter(
      (m) => m.role !== 'system',
    )
    expect(turns).toContainEqual({ role: 'assistant', content: 'hi' })
  })

  it('replay drops an empty-extracted legacy tool-only row and coalesces the bracketing same-role turns', async () => {
    mockAuthed()
    // History is fetched desc(createdAt) then reversed to chronological order,
    // so supply it newest-first: replay must see user 'hi' → tool-only → user 'again'.
    // The middle assistant row is 100% tool blocks (legacy) → extracts to '' → dropped,
    // which would leave the two user turns adjacent unless they coalesce.
    mockLimit.mockResolvedValueOnce([
      { role: 'user', content: 'again' },
      {
        role: 'assistant',
        content: [{ type: 'tool-call', toolCallId: 't1', toolName: 'getCalendarEvents', args: {} }],
      },
      { role: 'user', content: 'hi' },
    ])
    await POST(
      makeRequest({ messages: [{ role: 'user', content: 'follow up' }], conversationId: CONVO_ID }),
    )
    const args = vi.mocked(streamText).mock.calls[0]![0]
    const turns = (args.messages as Array<{ role: string; content: string }>).filter(
      (m) => m.role !== 'system',
    )
    // No empty-content turn survives, and the bracketing user turns coalesce into one.
    expect(turns.every((t) => t.content !== '')).toBe(true)
    expect(turns).toEqual([{ role: 'user', content: 'hi\nagain' }])
  })

  it('replay leaves normal alternating turns unchanged (no accidental coalescing)', async () => {
    mockAuthed()
    mockLimit.mockResolvedValueOnce([
      { role: 'user', content: 'u2' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'u1' },
    ])
    await POST(
      makeRequest({ messages: [{ role: 'user', content: 'follow up' }], conversationId: CONVO_ID }),
    )
    const args = vi.mocked(streamText).mock.calls[0]![0]
    const turns = (args.messages as Array<{ role: string; content: string }>).filter(
      (m) => m.role !== 'system',
    )
    expect(turns).toEqual([
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'u2' },
    ])
  })

  it('replay drops a leading assistant turn so the first turn is always user (Anthropic 400s otherwise)', async () => {
    mockAuthed()
    // Supplied newest-first (matches orderBy(desc)): after .reverse() the
    // chronological order is assistant 'a1' then user 'u2' — simulating a
    // truncated history window that begins mid-conversation on an assistant turn.
    mockLimit.mockResolvedValueOnce([
      { role: 'user', content: 'u2' },
      { role: 'assistant', content: 'a1' },
    ])
    await POST(
      makeRequest({ messages: [{ role: 'user', content: 'follow up' }], conversationId: CONVO_ID }),
    )
    const args = vi.mocked(streamText).mock.calls[0]![0]
    const turns = (args.messages as Array<{ role: string; content: string }>).filter(
      (m) => m.role !== 'system',
    )
    expect(turns).toEqual([{ role: 'user', content: 'u2' }])
  })

  it('replay drains an all-assistant history window to an empty turns array', async () => {
    mockAuthed()
    mockLimit.mockResolvedValueOnce([{ role: 'assistant', content: 'stray' }])
    await POST(
      makeRequest({ messages: [{ role: 'user', content: 'follow up' }], conversationId: CONVO_ID }),
    )
    const args = vi.mocked(streamText).mock.calls[0]![0]
    const turns = (args.messages as Array<{ role: string; content: string }>).filter(
      (m) => m.role !== 'system',
    )
    expect(turns).toEqual([])
  })
})
