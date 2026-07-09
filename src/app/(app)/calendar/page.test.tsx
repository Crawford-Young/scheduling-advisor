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

vi.mock('@/components/calendar/calendar-client', () => ({
  CalendarClient: ({ weekStart }: { weekStart: string }) => (
    <div data-testid="calendar-client" data-week-start={weekStart} />
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
})
