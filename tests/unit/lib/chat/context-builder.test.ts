import { describe, it, expect, vi } from 'vitest'

vi.mock('@/auth', () => ({ auth: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }) }))

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
    const ctx = await buildContextBlock('America/New_York', new Date('2026-06-01T12:00:00Z'))
    expect(ctx).toContain('2026-06-01')
    expect(ctx).toContain('America/New_York')
    expect(ctx).toContain('847')
  })

  it('lists only items scheduled or due today', async () => {
    const ctx = await buildContextBlock('UTC', new Date('2026-06-01T12:00:00Z'))
    expect(ctx).toContain('[habit:task-1]')
    expect(ctx).toContain('Morning Run')
    expect(ctx).not.toContain('[goal:goal-1]') // due 2026-06-15, not today
    expect(ctx).not.toContain('Finish proposal')
  })

  it('excludes tasks scheduled on another day', async () => {
    const { getUserTasks } = await import('@/server/queries/tasks')
    vi.mocked(getUserTasks).mockResolvedValueOnce([
      {
        id: 'task-tomorrow',
        title: 'Tomorrow thing',
        type: 'task',
        status: 'pending',
        startAt: new Date('2026-06-02T07:00:00Z'),
        targetDate: null,
      },
    ] as never)
    const ctx = await buildContextBlock('UTC', new Date('2026-06-01T12:00:00Z'))
    expect(ctx).not.toContain('Tomorrow thing')
    expect(ctx).toContain('(none)')
  })

  it('includes date-only items due today', async () => {
    const { getUserTasks } = await import('@/server/queries/tasks')
    vi.mocked(getUserTasks).mockResolvedValueOnce([
      {
        id: 'goal-today',
        title: 'Due today goal',
        type: 'goal',
        status: 'pending',
        startAt: null,
        targetDate: new Date('2026-06-01T12:00:00Z'),
      },
    ] as never)
    const ctx = await buildContextBlock('UTC', new Date('2026-06-01T12:00:00Z'))
    expect(ctx).toContain('[goal:goal-today] Due today goal')
    expect(ctx).toContain('due 2026-06-01')
  })

  it('renders times as user-timezone wall-clock, not UTC', async () => {
    const { getUserTasks } = await import('@/server/queries/tasks')
    vi.mocked(getUserTasks).mockResolvedValueOnce([
      {
        id: 'task-evening',
        title: 'Evening thing',
        type: 'task',
        status: 'pending',
        startAt: new Date('2026-06-01T23:30:00Z'), // 19:30 EDT same local day
        targetDate: null,
      },
    ] as never)
    const ctx = await buildContextBlock('America/New_York', new Date('2026-06-01T12:00:00Z'))
    expect(ctx).toContain('19:30')
    expect(ctx).not.toContain('23:30')
    expect(ctx).not.toContain('UTC')
  })

  it('judges "today" in the user timezone, not UTC date', async () => {
    const { getUserTasks } = await import('@/server/queries/tasks')
    vi.mocked(getUserTasks).mockResolvedValueOnce([
      {
        id: 'task-late',
        title: 'Late tonight',
        type: 'task',
        status: 'pending',
        startAt: new Date('2026-06-02T01:00:00Z'), // 21:00 EDT 2026-06-01 — today locally
        targetDate: null,
      },
    ] as never)
    const ctx = await buildContextBlock('America/New_York', new Date('2026-06-01T12:00:00Z'))
    expect(ctx).toContain('Late tonight')
    expect(ctx).toContain('21:00')
  })

  it('marks completed items as done', async () => {
    const ctx = await buildContextBlock('UTC', new Date('2026-06-01T12:00:00Z'))
    expect(ctx).toContain('Morning Run')
    expect(ctx).toMatch(/Morning Run.*done|done.*Morning Run/)
  })

  it('marks uncompleted items as pending', async () => {
    const { getUserTasks } = await import('@/server/queries/tasks')
    vi.mocked(getUserTasks).mockResolvedValueOnce([
      {
        id: 'goal-1',
        title: 'Finish proposal',
        type: 'goal',
        status: 'pending',
        startAt: null,
        targetDate: new Date('2026-06-01T12:00:00Z'),
      },
    ] as never)
    const ctx = await buildContextBlock('UTC', new Date('2026-06-01T12:00:00Z'))
    expect(ctx).toContain('Finish proposal')
    expect(ctx).toContain('pending')
  })

  it('shows (none) when no tasks', async () => {
    const { getUserTasks } = await import('@/server/queries/tasks')
    vi.mocked(getUserTasks).mockResolvedValueOnce([])
    const ctx = await buildContextBlock('UTC', new Date('2026-06-01T12:00:00Z'))
    expect(ctx).toContain('(none)')
  })

  it('marks skipped check-in as skipped', async () => {
    const { getUserCheckIns } = await import('@/server/queries/check-ins')
    vi.mocked(getUserCheckIns).mockResolvedValueOnce([
      {
        taskId: 'task-1',
        scheduledAt: new Date('2026-06-01T00:00:00Z'),
        completedAt: null,
        skippedAt: new Date('2026-06-01T08:00:00Z'),
      },
    ] as never)
    const ctx = await buildContextBlock('UTC', new Date('2026-06-01T12:00:00Z'))
    expect(ctx).toContain('skipped')
  })

  it('includes check-in with null taskId without error', async () => {
    const { getUserCheckIns } = await import('@/server/queries/check-ins')
    vi.mocked(getUserCheckIns).mockResolvedValueOnce([
      {
        taskId: null,
        scheduledAt: new Date('2026-06-01T00:00:00Z'),
        completedAt: null,
        skippedAt: null,
      },
    ] as never)
    const ctx = await buildContextBlock('UTC', new Date('2026-06-01T12:00:00Z'))
    expect(ctx).toContain('--- Current Context ---')
  })

  it('uses empty string for userId when unauthenticated', async () => {
    const { auth } = await import('@/auth')
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const ctx = await buildContextBlock('UTC', new Date('2026-06-01T12:00:00Z'))
    expect(ctx).toContain('--- Current Context ---')
  })

  it('marks pending check-in (no completedAt or skippedAt) as pending', async () => {
    const { getUserCheckIns } = await import('@/server/queries/check-ins')
    vi.mocked(getUserCheckIns).mockResolvedValueOnce([
      {
        taskId: 'task-1',
        scheduledAt: new Date('2026-06-01T00:00:00Z'),
        completedAt: null,
        skippedAt: null,
      },
    ] as never)
    const ctx = await buildContextBlock('UTC', new Date('2026-06-01T12:00:00Z'))
    expect(ctx).toContain('pending')
  })

  it('shows task with no startAt or targetDate as pending with no time', async () => {
    const { getUserTasks } = await import('@/server/queries/tasks')
    vi.mocked(getUserTasks).mockResolvedValueOnce([
      {
        id: 'task-x',
        title: 'Floating task',
        type: 'task',
        status: 'pending',
        startAt: null,
        targetDate: null,
      },
    ] as never)
    const ctx = await buildContextBlock('UTC', new Date('2026-06-01T12:00:00Z'))
    expect(ctx).toContain('[task:task-x] Floating task — pending')
  })
})
