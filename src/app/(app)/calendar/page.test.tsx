import { render } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import CalendarPage from './page'

const authMock = vi.fn()
const getUserEventsMock = vi.fn()
const getUserActivitiesMock = vi.fn()
const safeDeleteExpiredEventsMock = vi.fn()
const safeGenerateEventsMock = vi.fn()
const getCalendarPrefsMock = vi.fn()

vi.mock('@/auth', () => ({ auth: () => authMock() }))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('REDIRECT')
  }),
}))

vi.mock('@/server/queries/events', () => ({
  getUserEvents: () => getUserEventsMock(),
}))

vi.mock('@/server/queries/activities', () => ({
  getUserActivities: () => getUserActivitiesMock(),
}))

vi.mock('@/server/actions/event-ttl', () => ({
  safeDeleteExpiredEvents: () => safeDeleteExpiredEventsMock(),
}))

vi.mock('@/server/actions/event-generation', () => ({
  safeGenerateEvents: () => safeGenerateEventsMock(),
}))

vi.mock('@/server/queries/calendar-prefs', () => ({
  getCalendarPrefs: () => getCalendarPrefsMock(),
}))

interface MockClientEvent {
  readonly id: string
  readonly activityId: string | null
  readonly status: string
  readonly locked?: boolean
}

interface MockActivityOption {
  readonly id: string
  readonly minDurationMin: number
}

vi.mock('@/components/calendar/calendar-client', () => ({
  CalendarClient: ({
    weekStart,
    events,
    activities,
  }: {
    weekStart: string
    events: readonly MockClientEvent[]
    activities: readonly MockActivityOption[]
  }) => (
    <div
      data-testid="calendar-client"
      data-week-start={weekStart}
      data-event-count={String(events.length)}
      data-evt0-id={events[0]?.id ?? ''}
      data-evt0-activity-id={events[0]?.activityId ?? ''}
      data-evt0-status={events[0]?.status ?? ''}
      data-evt0-locked={String(events[0]?.locked ?? '')}
      data-activity-options={activities.map((a) => `${a.id}:${a.minDurationMin}`).join('|')}
    />
  ),
}))

function makeSession() {
  return { user: { id: 'user-1' } }
}

function expectedFallbackWeekStart(): string {
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  return monday.toISOString().slice(0, 10)
}

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt-1',
    userId: 'user-1',
    activityId: 'act-1',
    title: 'Session',
    description: null,
    location: null,
    startAt: new Date('2026-06-01T09:00:00.000Z'),
    endAt: new Date('2026-06-01T10:00:00.000Z'),
    allDay: false,
    status: 'pending',
    locked: false,
    color: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  }
}

function makeActivity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'act-1',
    userId: 'user-1',
    title: 'Running',
    color: 'blue',
    description: null,
    defaultLocation: null,
    minDurationMin: 30,
    maxDurationMin: 60,
    weeklyTargetSessions: 3,
    schedule: [],
    timeZone: null,
    generatedThrough: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  }
}

describe('CalendarPage', () => {
  beforeEach(() => {
    authMock.mockReset().mockResolvedValue(makeSession())
    getUserEventsMock.mockReset().mockResolvedValue([])
    getUserActivitiesMock.mockReset().mockResolvedValue([])
    safeDeleteExpiredEventsMock.mockReset().mockResolvedValue(undefined)
    safeGenerateEventsMock.mockReset().mockResolvedValue(undefined)
    getCalendarPrefsMock.mockReset().mockResolvedValue(null)
  })

  it('sweeps TTL then generation before reading events', async () => {
    await CalendarPage({ searchParams: Promise.resolve({}) })
    const deleteOrder = safeDeleteExpiredEventsMock.mock.invocationCallOrder[0]!
    const generateOrder = safeGenerateEventsMock.mock.invocationCallOrder[0]!
    const eventsOrder = getUserEventsMock.mock.invocationCallOrder[0]!
    expect(deleteOrder).toBeLessThan(generateOrder)
    expect(generateOrder).toBeLessThan(eventsOrder)
  })

  it('redirects to /login when unauthenticated', async () => {
    authMock.mockResolvedValueOnce(null as never)
    await expect(CalendarPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT')
  })

  it('passes a valid ?week= value through unchanged', async () => {
    const { getByTestId } = render(
      await CalendarPage({ searchParams: Promise.resolve({ week: '2026-06-01' }) }),
    )
    expect(getByTestId('calendar-client')).toHaveAttribute('data-week-start', '2026-06-01')
  })

  it('falls back to the current week for a malformed ?week= value', async () => {
    const { getByTestId } = render(
      await CalendarPage({ searchParams: Promise.resolve({ week: 'garbage' }) }),
    )
    expect(getByTestId('calendar-client')).toHaveAttribute(
      'data-week-start',
      expectedFallbackWeekStart(),
    )
  })

  it('falls back to the current week when ?week= is absent', async () => {
    const { getByTestId } = render(await CalendarPage({ searchParams: Promise.resolve({}) }))
    expect(getByTestId('calendar-client')).toHaveAttribute(
      'data-week-start',
      expectedFallbackWeekStart(),
    )
  })

  it('maps events to client props, threading activityId/status/locked', async () => {
    getUserEventsMock.mockResolvedValueOnce([makeEvent({ status: 'completed', locked: true })])
    const { getByTestId } = render(await CalendarPage({ searchParams: Promise.resolve({}) }))
    const client = getByTestId('calendar-client')
    expect(client).toHaveAttribute('data-event-count', '1')
    expect(client).toHaveAttribute('data-evt0-id', 'evt-1')
    expect(client).toHaveAttribute('data-evt0-activity-id', 'act-1')
    expect(client).toHaveAttribute('data-evt0-status', 'completed')
    expect(client).toHaveAttribute('data-evt0-locked', 'true')
  })

  it('filters out events without a start/end time (unschedulable)', async () => {
    getUserEventsMock.mockResolvedValueOnce([
      makeEvent({ id: 'timed' }),
      makeEvent({ id: 'no-start', startAt: null }),
      makeEvent({ id: 'no-end', endAt: null }),
    ])
    const { getByTestId } = render(await CalendarPage({ searchParams: Promise.resolve({}) }))
    const client = getByTestId('calendar-client')
    expect(client).toHaveAttribute('data-event-count', '1')
    expect(client).toHaveAttribute('data-evt0-id', 'timed')
  })

  it('builds activity options with minDurationMin as the default duration', async () => {
    getUserActivitiesMock.mockResolvedValueOnce([makeActivity({ id: 'act-1', minDurationMin: 25 })])
    const { getByTestId } = render(await CalendarPage({ searchParams: Promise.resolve({}) }))
    expect(getByTestId('calendar-client')).toHaveAttribute('data-activity-options', 'act-1:25')
  })
})
