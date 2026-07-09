import { render } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import CalendarPage from './page'

const authMock = vi.fn()
const getUserTasksMock = vi.fn()
const getTaskStreaksMock = vi.fn()
const safeDeleteExpiredEventsMock = vi.fn()
const getCalendarPrefsMock = vi.fn()

vi.mock('@/auth', () => ({ auth: () => authMock() }))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('REDIRECT')
  }),
}))

vi.mock('@/server/queries/tasks', () => ({
  getUserTasks: () => getUserTasksMock(),
}))

vi.mock('@/server/queries/consistency', () => ({
  getTaskStreaks: () => getTaskStreaksMock(),
}))

vi.mock('@/server/actions/event-ttl', () => ({
  safeDeleteExpiredEvents: () => safeDeleteExpiredEventsMock(),
}))

vi.mock('@/server/queries/calendar-prefs', () => ({
  getCalendarPrefs: () => getCalendarPrefsMock(),
}))

interface MockCalendarClientEvent {
  readonly id: string
  readonly recurrenceGroupId: string | null
}

vi.mock('@/components/calendar/calendar-client', () => ({
  CalendarClient: ({
    weekStart,
    events,
  }: {
    weekStart: string
    events: readonly MockCalendarClientEvent[]
  }) => (
    <div
      data-testid="calendar-client"
      data-week-start={weekStart}
      data-evt0-recurrence-group-id={events[0]?.recurrenceGroupId ?? ''}
    />
  ),
}))

function makeSession() {
  return { user: { id: 'user-1' } }
}

/** Mirrors the page's own Monday-of-current-week fallback, in local time. */
function expectedFallbackWeekStart(): string {
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  return monday.toISOString().slice(0, 10)
}

describe('CalendarPage', () => {
  beforeEach(() => {
    authMock.mockReset().mockResolvedValue(makeSession())
    getUserTasksMock.mockReset().mockResolvedValue([])
    getTaskStreaksMock.mockReset().mockResolvedValue({})
    safeDeleteExpiredEventsMock.mockReset().mockResolvedValue(undefined)
    getCalendarPrefsMock.mockReset().mockResolvedValue(null)
  })

  it('redirects to /login when unauthenticated', async () => {
    authMock.mockResolvedValueOnce(null as never)
    await expect(CalendarPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT')
  })

  it('passes a valid ?week= value through unchanged to CalendarClient', async () => {
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

  it('falls back to the current week for a non-existent calendar date', async () => {
    const { getByTestId } = render(
      await CalendarPage({ searchParams: Promise.resolve({ week: '2026-13-99' }) }),
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

  it('threads a task recurrenceGroupId through to the event mapping', async () => {
    getUserTasksMock.mockResolvedValueOnce([
      {
        id: 'task-1',
        title: 'Grouped task',
        startAt: new Date('2026-06-01T09:00:00.000Z'),
        endAt: new Date('2026-06-01T10:00:00.000Z'),
        targetDate: null,
        type: 'task',
        status: 'pending',
        activityType: 'solo',
        visibility: 'only_me',
        color: null,
        allDay: false,
        location: null,
        description: null,
        recurrence: null,
        recurrenceDays: null,
        recurrenceGroupId: 'group-1',
        locked: false,
      },
    ])
    const { getByTestId } = render(await CalendarPage({ searchParams: Promise.resolve({}) }))
    expect(getByTestId('calendar-client')).toHaveAttribute(
      'data-evt0-recurrence-group-id',
      'group-1',
    )
  })

  it('maps a null recurrenceGroupId when the task has none', async () => {
    getUserTasksMock.mockResolvedValueOnce([
      {
        id: 'task-2',
        title: 'Ungrouped task',
        startAt: new Date('2026-06-01T09:00:00.000Z'),
        endAt: new Date('2026-06-01T10:00:00.000Z'),
        targetDate: null,
        type: 'task',
        status: 'pending',
        activityType: 'solo',
        visibility: 'only_me',
        color: null,
        allDay: false,
        location: null,
        description: null,
        recurrence: null,
        recurrenceDays: null,
        recurrenceGroupId: null,
        locked: false,
      },
    ])
    const { getByTestId } = render(await CalendarPage({ searchParams: Promise.resolve({}) }))
    expect(getByTestId('calendar-client')).toHaveAttribute('data-evt0-recurrence-group-id', '')
  })
})
