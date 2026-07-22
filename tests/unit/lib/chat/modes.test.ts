import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/chat/model-tiers', () => ({
  MODEL_TIERS: {
    sonnet: {
      tier: 'sonnet',
      model: { modelId: 'claude-sonnet-4-6' },
      multiplier: 1,
      label: 'Sonnet',
    },
    opus: { tier: 'opus', model: { modelId: 'claude-opus-4-8' }, multiplier: 2, label: 'Opus' },
  },
}))
vi.mock('@/lib/chat/context-builder', () => ({
  buildContextBlock: vi.fn().mockResolvedValue('CTX'),
}))
// tools.ts pulls in server-side modules (transitively '@/auth'/'@/db') purely to
// build CHAT_TOOL_NAMES/buildChatTools; mock those out so this unit test stays
// isolated from the real module graph.
vi.mock('@/db', () => ({ db: { select: vi.fn() } }))
vi.mock('@/db/schema', () => ({ events: {} }))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
  lt: vi.fn(),
  asc: vi.fn(),
}))
vi.mock('@/server/queries/activities', () => ({ getUserActivities: vi.fn() }))
vi.mock('@/server/actions/activities', () => ({ createActivity: vi.fn() }))
vi.mock('@/server/actions/events', () => ({
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
}))
vi.mock('@/server/actions/chat-mutations', () => ({ createEvents: vi.fn() }))

import { getMode } from '@/lib/chat/modes'
import { CHAT_TOOL_NAMES } from '@/lib/chat/tools'

describe('mode registry (activity model)', () => {
  it('advisor: sonnet, all tools except the direct event-create pair, persisted, history 50, maxSteps 5', () => {
    const m = getMode('advisor')
    expect((m.model as { modelId: string }).modelId).toBe('claude-sonnet-4-6')
    // Advisor drops createEvent/createEvents — calendar events go through
    // proposeEvent for user approval (the card creates them).
    const expectedTools = CHAT_TOOL_NAMES.filter((t) => t !== 'createEvent' && t !== 'createEvents')
    expect([...m.toolNames].sort()).toEqual([...expectedTools].sort())
    expect(m.toolNames).toContain('proposeEvent')
    expect(m.toolNames).not.toContain('createEvent')
    expect(m.toolNames).not.toContain('createEvents')
    expect(m).toMatchObject({ persisted: true, historyLimit: 50, maxSteps: 5 })
  })

  it('every mode system prompt is stable (no dates) and mentions only allowlisted tools (explicit "never <tool>" call-outs of a disallowed tool are exempt)', () => {
    for (const name of ['advisor'] as const) {
      const m = getMode(name)
      const sys = m.buildSystem()
      expect(sys).not.toMatch(/\d{4}-\d{2}-\d{2}/)
      const mentioned = CHAT_TOOL_NAMES.filter((t) => sys.includes(t))
      for (const t of mentioned) {
        // A prompt may name a disallowed tool only to forbid it (e.g. "never
        // call createEvent directly — use proposeEvent"). Exempt those.
        const negated = new RegExp(`never[^.]*\`?${t}\`?`, 'i').test(sys)
        if (!negated) expect(m.toolNames).toContain(t)
      }
    }
  })

  it('advisor system prompt mentions no killed tool name', () => {
    const sys = getMode('advisor').buildSystem()
    for (const killed of [
      'getUserTasks',
      'getUserCheckIns',
      'markItemComplete',
      'createHabit',
      'createGoal',
      'createTask',
      'updateItem',
      'createCalendarEvent',
      'showTaskCard',
    ]) {
      expect(sys).not.toContain(killed)
    }
  })

  it('advisor context delegates to buildContextBlock', async () => {
    await expect(getMode('advisor').buildContext('UTC')).resolves.toBe('CTX')
  })
})
