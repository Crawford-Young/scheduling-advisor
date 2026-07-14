import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/ai', () => ({
  advisorModel: { modelId: 'claude-sonnet-4-6' },
  quickModel: { modelId: 'claude-haiku-4-5' },
}))
vi.mock('@/lib/chat/context-builder', () => ({
  buildContextBlock: vi.fn().mockResolvedValue('CTX'),
}))
// tools.ts pulls in server-side modules (transitively '@/auth') purely to build
// CHAT_TOOL_NAMES/buildChatTools; mock those out so this unit test stays isolated
// from the real NextAuth module graph.
vi.mock('@/server/services', () => ({ getCalendarService: vi.fn() }))
vi.mock('@/server/queries/tasks', () => ({ getUserTasks: vi.fn() }))
vi.mock('@/server/queries/check-ins', () => ({ getUserCheckIns: vi.fn() }))
vi.mock('@/server/actions/items', () => ({
  markItemComplete: vi.fn(),
  markItemSkipped: vi.fn(),
  rescheduleItem: vi.fn(),
  createHabit: vi.fn(),
  createGoal: vi.fn(),
  createTask: vi.fn(),
  updateItem: vi.fn(),
}))

import { getMode } from '@/lib/chat/modes'
import { CHAT_TOOL_NAMES } from '@/lib/chat/tools'

describe('mode registry', () => {
  it('advisor: sonnet, all 19 tools, persisted, history 50, maxSteps 5', () => {
    const m = getMode('advisor')
    expect((m.model as { modelId: string }).modelId).toBe('claude-sonnet-4-6')
    expect([...m.toolNames].sort()).toEqual([...CHAT_TOOL_NAMES].sort())
    expect(m).toMatchObject({ persisted: true, historyLimit: 50, maxSteps: 5 })
  })

  it('quick-schedule: haiku, exactly 3 tools, ephemeral, no history, maxSteps 2', () => {
    const m = getMode('quick-schedule')
    expect((m.model as { modelId: string }).modelId).toBe('claude-haiku-4-5')
    expect([...m.toolNames].sort()).toEqual(['createCalendarEvent', 'createTask', 'proposeAction'])
    expect(m).toMatchObject({ persisted: false, historyLimit: 0, maxSteps: 2 })
  })

  it('quick-schedule system prompt steers proposeAction to the valid entityType enum', () => {
    const sys = getMode('quick-schedule').buildSystem()
    expect(sys).toContain("entityType must be 'habit', 'goal', or 'event'")
    expect(sys).toContain("date-only tasks propose as 'event'")
    expect(sys).not.toContain("entityType: 'task'")
  })

  it('every mode system prompt is stable (no dates) and mentions only allowlisted tools', () => {
    for (const name of ['advisor', 'quick-schedule'] as const) {
      const m = getMode(name)
      const sys = m.buildSystem()
      expect(sys).not.toMatch(/\d{4}-\d{2}-\d{2}/)
      const mentioned = CHAT_TOOL_NAMES.filter((t) => sys.includes(t))
      for (const t of mentioned) expect(m.toolNames).toContain(t)
    }
  })

  it('quick-schedule context contains date, week bounds, timezone and nothing user-specific', async () => {
    const ctx = await getMode('quick-schedule').buildContext('America/Chicago')
    expect(ctx).toMatch(/Date: \d{4}-\d{2}-\d{2}/)
    expect(ctx).toMatch(/Week: \d{4}-\d{2}-\d{2} – \d{4}-\d{2}-\d{2}/)
    expect(ctx).toContain('America/Chicago')
    expect(ctx).not.toContain("Today's items")
  })

  it('advisor context delegates to buildContextBlock', async () => {
    await expect(getMode('advisor').buildContext('UTC')).resolves.toBe('CTX')
  })
})
