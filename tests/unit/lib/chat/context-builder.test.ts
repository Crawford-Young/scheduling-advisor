import { describe, it, expect, vi } from 'vitest'

vi.mock('@/server/queries/tasks', () => ({
  getUserTasks: vi.fn().mockResolvedValue([
    {
      id: 'task-1',
      title: 'Morning Run',
      type: 'habit',
      status: 'pending',
      startAt: new Date('2026-06-01T07:00:00Z'),
      targetDate: null,
    },
    {
      id: 'goal-1',
      title: 'Finish proposal',
      type: 'goal',
      status: 'pending',
      startAt: null,
      targetDate: new Date('2026-06-15T00:00:00Z'),
    },
  ]),
}))

vi.mock('@/server/queries/check-ins', () => ({
  getUserCheckIns: vi.fn().mockResolvedValue([
    {
      taskId: 'task-1',
      scheduledAt: new Date('2026-06-01T00:00:00Z'),
      completedAt: new Date('2026-06-01T07:15:00Z'),
      skippedAt: null,
    },
  ]),
}))

vi.mock('@/server/queries/tokens', () => ({
  getTokenBalance: vi.fn().mockResolvedValue(847),
}))

import { buildContextBlock } from '@/lib/chat/context-builder'

describe('buildContextBlock', () => {
  it('includes date, timezone, and credit balance', async () => {
    const ctx = await buildContextBlock(
      'user-1',
      'America/New_York',
      new Date('2026-06-01T12:00:00Z'),
    )
    expect(ctx).toContain('2026-06-01')
    expect(ctx).toContain('America/New_York')
    expect(ctx).toContain('847')
  })

  it('lists planned items with IDs', async () => {
    const ctx = await buildContextBlock('user-1', 'UTC', new Date('2026-06-01T12:00:00Z'))
    expect(ctx).toContain('[habit:task-1]')
    expect(ctx).toContain('Morning Run')
    expect(ctx).toContain('[goal:goal-1]')
    expect(ctx).toContain('Finish proposal')
  })

  it('marks completed items as done', async () => {
    const ctx = await buildContextBlock('user-1', 'UTC', new Date('2026-06-01T12:00:00Z'))
    expect(ctx).toContain('Morning Run')
    expect(ctx).toMatch(/Morning Run.*done|done.*Morning Run/)
  })

  it('marks uncompleted items as pending', async () => {
    const ctx = await buildContextBlock('user-1', 'UTC', new Date('2026-06-01T12:00:00Z'))
    expect(ctx).toContain('Finish proposal')
    expect(ctx).toContain('pending')
  })
})
