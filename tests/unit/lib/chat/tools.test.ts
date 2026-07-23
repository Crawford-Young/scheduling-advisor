import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { z } from 'zod'

// getWeekSchedule reads events for a week via a userId-scoped db select; the
// rest of the read/mutation surface delegates to auth-scoped queries/actions.
// getTravelTime's mode-resolution reads calendarPrefs.travelMode via
// .where(...).limit(1) — a distinct chain tail from the events .orderBy() one.
const mockOrderBy = vi.hoisted(() => vi.fn())
const mockLimit = vi.hoisted(() => vi.fn())
const mockWhere = vi.hoisted(() =>
  vi.fn().mockReturnValue({ orderBy: mockOrderBy, limit: mockLimit }),
)
const mockFrom = vi.hoisted(() => vi.fn().mockReturnValue({ where: mockWhere }))
const mockSelect = vi.hoisted(() => vi.fn().mockReturnValue({ from: mockFrom }))

vi.mock('@/db', () => ({ db: { select: mockSelect } }))
vi.mock('@/db/schema', () => ({
  events: { userId: 'events.userId', startAt: 'events.startAt' },
  calendarPrefs: { userId: 'calendarPrefs.userId', travelMode: 'calendarPrefs.travelMode' },
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
  gte: vi.fn((col: unknown, val: unknown) => ({ op: 'gte', col, val })),
  lt: vi.fn((col: unknown, val: unknown) => ({ op: 'lt', col, val })),
  asc: vi.fn((col: unknown) => ({ op: 'asc', col })),
}))
vi.mock('@/server/queries/activities', () => ({ getUserActivities: vi.fn() }))
vi.mock('@/server/actions/activities', () => ({ createActivity: vi.fn() }))
vi.mock('@/server/actions/events', () => ({
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
}))
vi.mock('@/server/actions/chat-mutations', () => ({ createEvents: vi.fn() }))
vi.mock('@/server/travel', () => ({
  getUserTravelPlan: vi.fn(),
  resolveLocation: vi.fn(),
  getCachedTravelTime: vi.fn(),
  getLiveTravelTime: vi.fn(),
  TRAFFIC_AWARE_WINDOW_HOURS: 2,
}))

import { getUserActivities } from '@/server/queries/activities'
import { createActivity } from '@/server/actions/activities'
import { createEvent, updateEvent, deleteEvent } from '@/server/actions/events'
import { createEvents } from '@/server/actions/chat-mutations'
import {
  getUserTravelPlan,
  resolveLocation,
  getCachedTravelTime,
  getLiveTravelTime,
} from '@/server/travel'
import { buildChatTools, pickTools, CHAT_TOOL_NAMES, type ChatToolSet } from '@/lib/chat/tools'

const ONE_HOUR_MS = 60 * 60 * 1000
const THREE_HOURS_MS = 3 * ONE_HOUR_MS

type ToolExecute = (params: unknown, options: unknown) => Promise<unknown>

function execute(all: ChatToolSet, name: keyof ChatToolSet, params: unknown): Promise<unknown> {
  return (all[name].execute as ToolExecute)(params, {})
}

const KILLED_TOOLS = [
  'getUserTasks',
  'getUserCheckIns',
  'showTaskCard',
  'showHabitCard',
  'showGoalCard',
  'showReflectionCard',
  'markItemComplete',
  'markItemSkipped',
  'rescheduleItem',
  'createHabit',
  'createGoal',
  'createTask',
  'updateItem',
  'createCalendarEvent',
  'getCalendarEvents',
] as const

describe('buildChatTools (activity model)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLimit.mockReset().mockResolvedValue([])
  })

  it('exposes exactly the 13 activity-model tools, including getTravelTime', () => {
    expect(Object.keys(buildChatTools('u1')).sort()).toEqual([...CHAT_TOOL_NAMES].sort())
    expect(CHAT_TOOL_NAMES).toHaveLength(13)
    expect(CHAT_TOOL_NAMES).toContain('getTravelTime')
  })

  it('no longer exposes any killed task/habit/goal/check-in tool', () => {
    const all = buildChatTools('u1')
    for (const killed of KILLED_TOOLS) {
      expect(all).not.toHaveProperty(killed)
      expect(CHAT_TOOL_NAMES as readonly string[]).not.toContain(killed)
    }
  })

  it('pickTools returns only the requested subset', () => {
    const all = buildChatTools('u1')
    const subset = pickTools(all, ['proposeAction', 'createEvent', 'createEvents'])
    expect(Object.keys(subset).sort()).toEqual(['createEvent', 'createEvents', 'proposeAction'])
  })

  it.each([
    'showWeekCalendar',
    'showScheduleSuggestion',
    'showLifeBalance',
    'proposeAction',
  ] as const)('%s echoes its props', async (name) => {
    const all = buildChatTools('u1')
    const props = { any: 'value' }
    await expect(execute(all, name, props)).resolves.toEqual(props)
  })

  it('proposeAction echoes an activity-entity proposal', async () => {
    const all = buildChatTools('u1')
    const props = { action: 'Create Gym activity', entityType: 'activity', detail: '3x/week' }
    await expect(execute(all, 'proposeAction', props)).resolves.toEqual(props)
  })

  it('getWeekSchedule returns week-scoped events plus the user activities', async () => {
    mockOrderBy.mockResolvedValueOnce([{ id: 'e1', title: 'Gym' }])
    vi.mocked(getUserActivities).mockResolvedValueOnce([{ id: 'a1', title: 'Gym' }] as never)
    const all = buildChatTools('u1')
    const result = (await execute(all, 'getWeekSchedule', { weekStart: '2026-06-03' })) as {
      events: unknown
      activities: unknown
    }
    expect(mockSelect).toHaveBeenCalled()
    expect(result.events).toEqual([{ id: 'e1', title: 'Gym' }])
    expect(result.activities).toEqual([{ id: 'a1', title: 'Gym' }])
  })

  it('getActivities delegates to the auth-scoped activities query', async () => {
    vi.mocked(getUserActivities).mockResolvedValueOnce([{ id: 'a1' }] as never)
    const all = buildChatTools('u1')
    await expect(execute(all, 'getActivities', {})).resolves.toEqual([{ id: 'a1' }])
  })

  it('createActivity delegates to the activities action', async () => {
    vi.mocked(createActivity).mockResolvedValueOnce({ data: { id: 'a1' } } as never)
    const all = buildChatTools('u1')
    const params = {
      title: 'Gym',
      minDurationMin: 30,
      maxDurationMin: 60,
      weeklyTargetSessions: 3,
      schedule: [{ day: 1, startMinutes: 420, durationMin: 60 }],
    }
    await expect(execute(all, 'createActivity', params)).resolves.toEqual({ data: { id: 'a1' } })
    expect(createActivity).toHaveBeenCalledWith(params)
  })

  it('createEvent delegates to the events action', async () => {
    vi.mocked(createEvent).mockResolvedValueOnce({ data: { id: 'e1' } } as never)
    const all = buildChatTools('u1')
    const params = { title: 'Lunch', startAt: '2026-06-03T12:00:00.000Z' }
    await expect(execute(all, 'createEvent', params)).resolves.toEqual({ data: { id: 'e1' } })
    expect(createEvent).toHaveBeenCalledWith(params)
  })

  it('createEvents delegates to the bulk chat-mutation (N independent rows)', async () => {
    vi.mocked(createEvents).mockResolvedValueOnce({ data: [{ id: 'e1' }, { id: 'e2' }] } as never)
    const all = buildChatTools('u1')
    const params = { events: [{ title: 'A' }, { title: 'B' }] }
    await expect(execute(all, 'createEvents', params)).resolves.toEqual({
      data: [{ id: 'e1' }, { id: 'e2' }],
    })
    expect(createEvents).toHaveBeenCalledWith(params)
  })

  it('updateEvent delegates to the events action', async () => {
    vi.mocked(updateEvent).mockResolvedValueOnce({ data: { id: 'e1' } } as never)
    const all = buildChatTools('u1')
    const params = { id: 'e1', title: 'Renamed' }
    await expect(execute(all, 'updateEvent', params)).resolves.toEqual({ data: { id: 'e1' } })
    expect(updateEvent).toHaveBeenCalledWith(params)
  })

  it('deleteEvent delegates to the events action', async () => {
    vi.mocked(deleteEvent).mockResolvedValueOnce({ data: { success: true } } as never)
    const all = buildChatTools('u1')
    const params = { id: 'e1' }
    await expect(execute(all, 'deleteEvent', params)).resolves.toEqual({ data: { success: true } })
    expect(deleteEvent).toHaveBeenCalledWith(params)
  })

  it('proposeEvent echoes its props (render-only)', async () => {
    const all = buildChatTools('u1')
    const props = { title: 'Standup', date: '2026-01-01', start: '09:00', end: '09:15' }
    await expect(execute(all, 'proposeEvent', props)).resolves.toEqual(props)
  })

  describe('proposeEvent schema', () => {
    const schema = buildChatTools('u1').proposeEvent.inputSchema as z.ZodTypeAny
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

  describe('getTravelTime schema', () => {
    const schema = buildChatTools('u1').getTravelTime.inputSchema as z.ZodTypeAny
    const valid = { origin: 'home', destination: 'work' }

    it('accepts origin + destination with mode/departureTimeIso omitted', () => {
      expect(schema.safeParse(valid).success).toBe(true)
    })

    it('accepts an explicit valid mode', () => {
      expect(schema.safeParse({ ...valid, mode: 'transit' }).success).toBe(true)
    })

    it('rejects an unknown mode', () => {
      expect(schema.safeParse({ ...valid, mode: 'teleport' }).success).toBe(false)
    })

    it('rejects a missing origin', () => {
      expect(schema.safeParse({ destination: 'work' }).success).toBe(false)
    })

    it('rejects a missing destination', () => {
      expect(schema.safeParse({ origin: 'home' }).success).toBe(false)
    })

    it('accepts a departureTimeIso string', () => {
      expect(
        schema.safeParse({ ...valid, departureTimeIso: '2026-01-01T12:00:00.000Z' }).success,
      ).toBe(true)
    })
  })

  describe('getTravelTime execute (subscription gate, resolution, mode/traffic policy)', () => {
    const ESTIMATE = { durationMin: 20, distanceMeters: 5000, trafficAware: false }
    const HOME: Awaited<ReturnType<typeof resolveLocation>> = {
      point: { lat: 1, lng: 1 },
      label: '123 Home St',
    }
    const OFFICE: Awaited<ReturnType<typeof resolveLocation>> = {
      point: { lat: 2, lng: 2 },
      label: '456 Office Ave',
    }

    it('free user (no travel plan) -> subscription error, zero resolve/travel calls', async () => {
      vi.mocked(getUserTravelPlan).mockResolvedValueOnce(false)
      const all = buildChatTools('u1')

      const result = await execute(all, 'getTravelTime', { origin: 'home', destination: 'work' })

      expect(result).toEqual({ error: 'Travel estimates require a subscription.' })
      expect(resolveLocation).not.toHaveBeenCalled()
      expect(getCachedTravelTime).not.toHaveBeenCalled()
      expect(getLiveTravelTime).not.toHaveBeenCalled()
    })

    it('unresolvable origin -> the exact clarify error, never resolves destination', async () => {
      vi.mocked(getUserTravelPlan).mockResolvedValueOnce(true)
      vi.mocked(resolveLocation).mockResolvedValueOnce(null)
      const all = buildChatTools('u1')

      const result = await execute(all, 'getTravelTime', { origin: 'nowhere', destination: 'work' })

      expect(result).toEqual({
        error:
          "Couldn't find a location for 'nowhere'. Ask the user to clarify or save it as a place.",
      })
      expect(resolveLocation).toHaveBeenCalledTimes(1)
      expect(getCachedTravelTime).not.toHaveBeenCalled()
    })

    it('unresolvable destination -> its own clarify error', async () => {
      vi.mocked(getUserTravelPlan).mockResolvedValueOnce(true)
      vi.mocked(resolveLocation).mockResolvedValueOnce(HOME).mockResolvedValueOnce(null)
      const all = buildChatTools('u1')

      const result = await execute(all, 'getTravelTime', { origin: 'home', destination: 'nowhere' })

      expect(result).toEqual({
        error:
          "Couldn't find a location for 'nowhere'. Ask the user to clarify or save it as a place.",
      })
    })

    it('mode omitted uses calendarPrefs.travelMode when a row exists', async () => {
      vi.mocked(getUserTravelPlan).mockResolvedValueOnce(true)
      vi.mocked(resolveLocation).mockResolvedValueOnce(HOME).mockResolvedValueOnce(OFFICE)
      mockLimit.mockResolvedValueOnce([{ travelMode: 'transit' }])
      vi.mocked(getCachedTravelTime).mockResolvedValueOnce(ESTIMATE)
      const all = buildChatTools('u1')

      await execute(all, 'getTravelTime', { origin: 'home', destination: 'office' })

      expect(getCachedTravelTime).toHaveBeenCalledWith('u1', {
        origin: HOME.point,
        destination: OFFICE.point,
        mode: 'transit',
      })
    })

    it('mode omitted defaults to driving when no calendarPrefs row exists', async () => {
      vi.mocked(getUserTravelPlan).mockResolvedValueOnce(true)
      vi.mocked(resolveLocation).mockResolvedValueOnce(HOME).mockResolvedValueOnce(OFFICE)
      vi.mocked(getCachedTravelTime).mockResolvedValueOnce(ESTIMATE)
      const all = buildChatTools('u1')

      await execute(all, 'getTravelTime', { origin: 'home', destination: 'office' })

      expect(getCachedTravelTime).toHaveBeenCalledWith('u1', {
        origin: HOME.point,
        destination: OFFICE.point,
        mode: 'driving',
      })
    })

    it('explicit mode wins over calendarPrefs, with no db lookup', async () => {
      vi.mocked(getUserTravelPlan).mockResolvedValueOnce(true)
      vi.mocked(resolveLocation).mockResolvedValueOnce(HOME).mockResolvedValueOnce(OFFICE)
      vi.mocked(getCachedTravelTime).mockResolvedValueOnce(ESTIMATE)
      const all = buildChatTools('u1')

      await execute(all, 'getTravelTime', {
        origin: 'home',
        destination: 'office',
        mode: 'walking',
      })

      expect(getCachedTravelTime).toHaveBeenCalledWith('u1', {
        origin: HOME.point,
        destination: OFFICE.point,
        mode: 'walking',
      })
      expect(mockLimit).not.toHaveBeenCalled()
    })

    it('departureTimeIso 1h from now -> getLiveTravelTime called with departureTime', async () => {
      vi.mocked(getUserTravelPlan).mockResolvedValueOnce(true)
      vi.mocked(resolveLocation).mockResolvedValueOnce(HOME).mockResolvedValueOnce(OFFICE)
      vi.mocked(getLiveTravelTime).mockResolvedValueOnce({ ...ESTIMATE, trafficAware: true })
      const departureTimeIso = new Date(Date.now() + ONE_HOUR_MS).toISOString()
      const all = buildChatTools('u1')

      await execute(all, 'getTravelTime', {
        origin: 'home',
        destination: 'office',
        mode: 'driving',
        departureTimeIso,
      })

      expect(getLiveTravelTime).toHaveBeenCalledWith('u1', {
        origin: HOME.point,
        destination: OFFICE.point,
        mode: 'driving',
        departureTime: new Date(departureTimeIso),
      })
      expect(getCachedTravelTime).not.toHaveBeenCalled()
    })

    it('departureTimeIso 3h from now -> getCachedTravelTime, no departureTime key', async () => {
      vi.mocked(getUserTravelPlan).mockResolvedValueOnce(true)
      vi.mocked(resolveLocation).mockResolvedValueOnce(HOME).mockResolvedValueOnce(OFFICE)
      vi.mocked(getCachedTravelTime).mockResolvedValueOnce(ESTIMATE)
      const departureTimeIso = new Date(Date.now() + THREE_HOURS_MS).toISOString()
      const all = buildChatTools('u1')

      await execute(all, 'getTravelTime', {
        origin: 'home',
        destination: 'office',
        mode: 'driving',
        departureTimeIso,
      })

      expect(getCachedTravelTime).toHaveBeenCalledWith('u1', {
        origin: HOME.point,
        destination: OFFICE.point,
        mode: 'driving',
      })
      expect(getLiveTravelTime).not.toHaveBeenCalled()
    })

    it('departureTimeIso absent -> getCachedTravelTime', async () => {
      vi.mocked(getUserTravelPlan).mockResolvedValueOnce(true)
      vi.mocked(resolveLocation).mockResolvedValueOnce(HOME).mockResolvedValueOnce(OFFICE)
      vi.mocked(getCachedTravelTime).mockResolvedValueOnce(ESTIMATE)
      const all = buildChatTools('u1')

      await execute(all, 'getTravelTime', {
        origin: 'home',
        destination: 'office',
        mode: 'driving',
      })

      expect(getCachedTravelTime).toHaveBeenCalledWith('u1', {
        origin: HOME.point,
        destination: OFFICE.point,
        mode: 'driving',
      })
      expect(getLiveTravelTime).not.toHaveBeenCalled()
    })

    it('unparseable departureTimeIso is treated as absent — cached path, no throw', async () => {
      vi.mocked(getUserTravelPlan).mockResolvedValueOnce(true)
      vi.mocked(resolveLocation).mockResolvedValueOnce(HOME).mockResolvedValueOnce(OFFICE)
      vi.mocked(getCachedTravelTime).mockResolvedValueOnce(ESTIMATE)
      const all = buildChatTools('u1')

      await expect(
        execute(all, 'getTravelTime', {
          origin: 'home',
          destination: 'office',
          mode: 'driving',
          departureTimeIso: 'not-a-date',
        }),
      ).resolves.toEqual({
        durationMin: ESTIMATE.durationMin,
        distanceMeters: ESTIMATE.distanceMeters,
        mode: 'driving',
        trafficAware: ESTIMATE.trafficAware,
        origin: HOME.label,
        destination: OFFICE.label,
      })
      expect(getLiveTravelTime).not.toHaveBeenCalled()
    })

    it('null estimate (rate-limited or service failure) -> friendly unavailable error, never throws', async () => {
      vi.mocked(getUserTravelPlan).mockResolvedValueOnce(true)
      vi.mocked(resolveLocation).mockResolvedValueOnce(HOME).mockResolvedValueOnce(OFFICE)
      vi.mocked(getCachedTravelTime).mockResolvedValueOnce(null)
      const all = buildChatTools('u1')

      const result = await execute(all, 'getTravelTime', {
        origin: 'home',
        destination: 'office',
        mode: 'driving',
      })

      expect(result).toEqual({ error: 'Travel time is unavailable right now.' })
    })

    it('success shape carries resolved location labels', async () => {
      vi.mocked(getUserTravelPlan).mockResolvedValueOnce(true)
      vi.mocked(resolveLocation).mockResolvedValueOnce(HOME).mockResolvedValueOnce(OFFICE)
      vi.mocked(getCachedTravelTime).mockResolvedValueOnce(ESTIMATE)
      const all = buildChatTools('u1')

      const result = await execute(all, 'getTravelTime', {
        origin: 'home',
        destination: 'office',
        mode: 'driving',
      })

      expect(result).toEqual({
        durationMin: ESTIMATE.durationMin,
        distanceMeters: ESTIMATE.distanceMeters,
        mode: 'driving',
        trafficAware: ESTIMATE.trafficAware,
        origin: HOME.label,
        destination: OFFICE.label,
      })
    })
  })
})
