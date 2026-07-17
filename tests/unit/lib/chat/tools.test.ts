import { describe, it, expect, vi } from 'vitest'
import type { z } from 'zod'

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

import { getCalendarService } from '@/server/services'
import { getUserTasks } from '@/server/queries/tasks'
import { getUserCheckIns } from '@/server/queries/check-ins'
import {
  markItemComplete,
  markItemSkipped,
  rescheduleItem,
  createHabit,
  createGoal,
  createTask,
  updateItem,
} from '@/server/actions/items'
import { buildChatTools, pickTools, CHAT_TOOL_NAMES, type ChatToolSet } from '@/lib/chat/tools'

type ToolExecute = (params: unknown, options: unknown) => Promise<unknown>

function execute(all: ChatToolSet, name: keyof ChatToolSet, params: unknown): Promise<unknown> {
  return (all[name].execute as ToolExecute)(params, {})
}

describe('buildChatTools', () => {
  it('exposes exactly the 20 chat tools', () => {
    expect(Object.keys(buildChatTools('u1')).sort()).toEqual([...CHAT_TOOL_NAMES].sort())
    expect(CHAT_TOOL_NAMES).toHaveLength(20)
  })

  it('pickTools returns only the requested subset', () => {
    const all = buildChatTools('u1')
    const subset = pickTools(all, ['proposeAction', 'createCalendarEvent', 'createTask'])
    expect(Object.keys(subset).sort()).toEqual([
      'createCalendarEvent',
      'createTask',
      'proposeAction',
    ])
  })

  it('display tools echo their props', async () => {
    const all = buildChatTools('u1')
    const props = { taskId: 't', title: 'x', type: 'task', status: 'pending' }
    await expect(
      (all.showTaskCard.execute as (p: unknown, o: unknown) => Promise<unknown>)(props, {}),
    ).resolves.toEqual(props)
  })

  it('getCalendarEvents delegates to the calendar service for the closed-over userId', async () => {
    const getEvents = vi.fn().mockResolvedValue([{ id: 'e1' }])
    vi.mocked(getCalendarService).mockResolvedValueOnce({
      getEvents,
      createEvent: vi.fn(),
    } as never)
    const all = buildChatTools('u1')
    const result = await execute(all, 'getCalendarEvents', {
      start: '2026-01-01T00:00:00.000Z',
      end: '2026-01-02T00:00:00.000Z',
    })
    expect(getEvents).toHaveBeenCalledWith(
      'u1',
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-02T00:00:00.000Z'),
    )
    expect(result).toEqual([{ id: 'e1' }])
  })

  it('getUserTasks delegates to the tasks query', async () => {
    vi.mocked(getUserTasks).mockResolvedValueOnce([{ id: 't1' }] as never)
    const all = buildChatTools('u1')
    await expect(execute(all, 'getUserTasks', {})).resolves.toEqual([{ id: 't1' }])
  })

  it('getUserCheckIns delegates to the check-ins query', async () => {
    vi.mocked(getUserCheckIns).mockResolvedValueOnce([{ id: 'c1' }] as never)
    const all = buildChatTools('u1')
    await expect(execute(all, 'getUserCheckIns', {})).resolves.toEqual([{ id: 'c1' }])
  })

  it.each([
    'showHabitCard',
    'showGoalCard',
    'showScheduleSuggestion',
    'showReflectionCard',
    'showWeekCalendar',
    'showLifeBalance',
    'proposeAction',
  ] as const)('%s echoes its props', async (name) => {
    const all = buildChatTools('u1')
    const props = { any: 'value' }
    await expect(execute(all, name, props)).resolves.toEqual(props)
  })

  it('markItemComplete delegates to the items action', async () => {
    vi.mocked(markItemComplete).mockResolvedValueOnce({ ok: true } as never)
    const all = buildChatTools('u1')
    const params = { taskId: 't1', date: '2026-01-01' }
    await expect(execute(all, 'markItemComplete', params)).resolves.toEqual({ ok: true })
    expect(markItemComplete).toHaveBeenCalledWith(params)
  })

  it('markItemSkipped delegates to the items action', async () => {
    vi.mocked(markItemSkipped).mockResolvedValueOnce({ ok: true } as never)
    const all = buildChatTools('u1')
    const params = { taskId: 't1', date: '2026-01-01' }
    await expect(execute(all, 'markItemSkipped', params)).resolves.toEqual({ ok: true })
    expect(markItemSkipped).toHaveBeenCalledWith(params)
  })

  it('rescheduleItem delegates to the items action', async () => {
    vi.mocked(rescheduleItem).mockResolvedValueOnce({ ok: true } as never)
    const all = buildChatTools('u1')
    const params = { taskId: 't1', newDate: '2026-01-02', newTime: '09:00' }
    await expect(execute(all, 'rescheduleItem', params)).resolves.toEqual({ ok: true })
    expect(rescheduleItem).toHaveBeenCalledWith(params)
  })

  it('createCalendarEvent delegates to the calendar service for the closed-over userId', async () => {
    const createEvent = vi.fn().mockResolvedValue({ id: 'e2' })
    vi.mocked(getCalendarService).mockResolvedValueOnce({
      getEvents: vi.fn(),
      createEvent,
    } as never)
    const all = buildChatTools('u1')
    const result = await execute(all, 'createCalendarEvent', {
      title: 'Focus block',
      start: '2026-01-01T09:00:00.000Z',
      end: '2026-01-01T10:00:00.000Z',
    })
    expect(createEvent).toHaveBeenCalledWith('u1', {
      title: 'Focus block',
      start: new Date('2026-01-01T09:00:00.000Z'),
      end: new Date('2026-01-01T10:00:00.000Z'),
    })
    expect(result).toEqual({ id: 'e2' })
  })

  it('createHabit delegates to the items action', async () => {
    vi.mocked(createHabit).mockResolvedValueOnce({ id: 'h1' } as never)
    const all = buildChatTools('u1')
    const params = {
      title: 'Meditate',
      startDate: '2026-01-01',
      visibility: 'only_me' as const,
    }
    await expect(execute(all, 'createHabit', params)).resolves.toEqual({ id: 'h1' })
    expect(createHabit).toHaveBeenCalledWith(params)
  })

  it('createGoal delegates to the items action', async () => {
    vi.mocked(createGoal).mockResolvedValueOnce({ id: 'g1' } as never)
    const all = buildChatTools('u1')
    const params = {
      title: 'Run a marathon',
      targetDate: '2026-06-01',
      visibility: 'everyone' as const,
    }
    await expect(execute(all, 'createGoal', params)).resolves.toEqual({ id: 'g1' })
    expect(createGoal).toHaveBeenCalledWith(params)
  })

  it('createTask delegates to the items action', async () => {
    vi.mocked(createTask).mockResolvedValueOnce({ id: 'task1' } as never)
    const all = buildChatTools('u1')
    const params = {
      title: 'Buy groceries',
      dueDate: '2026-01-05',
      visibility: 'busy' as const,
    }
    await expect(execute(all, 'createTask', params)).resolves.toEqual({ id: 'task1' })
    expect(createTask).toHaveBeenCalledWith(params)
  })

  it('updateItem delegates to the items action', async () => {
    vi.mocked(updateItem).mockResolvedValueOnce({ id: 't1', title: 'Updated' } as never)
    const all = buildChatTools('u1')
    const params = { taskId: 't1', fields: { title: 'Updated' } }
    await expect(execute(all, 'updateItem', params)).resolves.toEqual({
      id: 't1',
      title: 'Updated',
    })
    expect(updateItem).toHaveBeenCalledWith(params)
  })

  it('proposeEvent echoes its props (render-only)', async () => {
    const all = buildChatTools('u1')
    const props = { title: 'Standup', date: '2026-01-01', start: '09:00', end: '09:15' }
    await expect(execute(all, 'proposeEvent', props)).resolves.toEqual(props)
  })

  describe('proposeEvent schema', () => {
    const schema = buildChatTools('u1').proposeEvent.parameters as z.ZodTypeAny
    const valid = { title: 'Standup', date: '2026-01-01', start: '09:00', end: '09:15' }

    it('accepts a valid event with optional description omitted', () => {
      expect(schema.safeParse(valid).success).toBe(true)
    })

    it('accepts a valid event with description', () => {
      expect(schema.safeParse({ ...valid, description: 'Daily sync' }).success).toBe(true)
    })

    it('rejects an empty title', () => {
      expect(schema.safeParse({ ...valid, title: '' }).success).toBe(false)
    })

    it('rejects a malformed date', () => {
      expect(schema.safeParse({ ...valid, date: '2026/01/01' }).success).toBe(false)
    })

    it('rejects a malformed start time', () => {
      expect(schema.safeParse({ ...valid, start: '9:00' }).success).toBe(false)
    })

    it('rejects a malformed end time', () => {
      expect(schema.safeParse({ ...valid, end: '9:15' }).success).toBe(false)
    })

    it('rejects end equal to start', () => {
      expect(schema.safeParse({ ...valid, start: '09:00', end: '09:00' }).success).toBe(false)
    })

    it('rejects end before start', () => {
      expect(schema.safeParse({ ...valid, start: '10:00', end: '09:00' }).success).toBe(false)
    })

    it('accepts a weekly recurrence with weekday tokens and a week count', () => {
      expect(
        schema.safeParse({
          ...valid,
          recurrence: 'weekly',
          recurrenceDays: ['Mon', 'Fri'],
          recurrenceCount: 8,
        }).success,
      ).toBe(true)
    })

    it('accepts a daily recurrence with a count', () => {
      expect(schema.safeParse({ ...valid, recurrence: 'daily', recurrenceCount: 4 }).success).toBe(
        true,
      )
    })

    it('accepts a monthly recurrence with a count', () => {
      expect(
        schema.safeParse({ ...valid, recurrence: 'monthly', recurrenceCount: 6 }).success,
      ).toBe(true)
    })

    it('rejects a recurrenceCount below the minimum of 2', () => {
      expect(schema.safeParse({ ...valid, recurrence: 'daily', recurrenceCount: 1 }).success).toBe(
        false,
      )
    })

    it('rejects a recurrenceCount above the maximum of 52', () => {
      expect(
        schema.safeParse({ ...valid, recurrence: 'weekly', recurrenceCount: 53 }).success,
      ).toBe(false)
    })

    it('rejects an unknown recurrence frequency', () => {
      expect(schema.safeParse({ ...valid, recurrence: 'yearly' }).success).toBe(false)
    })

    it('rejects a bad weekday token', () => {
      expect(
        schema.safeParse({ ...valid, recurrence: 'weekly', recurrenceDays: ['Mon', 'Funday'] })
          .success,
      ).toBe(false)
    })
  })
})
