import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import ActivitiesPage from './page'

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

vi.mock('@/components/activity/activity-filters', () => ({
  ActivityFilters: () => <div data-testid="activity-filters" />,
}))

vi.mock('@/components/activity/activity-create-button', () => ({
  ActivityCreateButton: ({ use24h }: { use24h?: boolean }) => (
    <div data-testid="activity-create-button" data-use24h={String(use24h)} />
  ),
}))

interface MockActivityRow {
  id: string
  title: string
  type: string
  status: string
  dateIso: string | null
  dateLabel: string
  recurrence: string | null
  location: string | null
  description: string | null
  color: string | null
  allDay: boolean
  streak: number
  startAt: string | null
  endAt: string | null
  targetDate: string | null
  activityType: string
  visibility: string
  joinability: string | null
  maxParticipants: number | null
}

// Render each row's data props so page-side row-building contract bugs surface.
vi.mock('@/components/activity/activity-table', () => ({
  ActivityTable: ({ items, use24h }: { items: MockActivityRow[]; use24h?: boolean }) => (
    <div data-testid="activity-table" data-use24h={String(use24h)}>
      {items.map((row) => (
        <div
          key={row.id}
          data-testid="activity-row"
          data-type={row.type}
          data-task-id={row.id}
          data-date-iso={row.dateIso ?? ''}
          data-target-date={row.targetDate ?? ''}
          data-streak={String(row.streak)}
          data-color={row.color ?? ''}
          data-location={row.location ?? ''}
          data-description={row.description ?? ''}
          data-all-day={String(row.allDay)}
          data-activity-type={row.activityType}
          data-visibility={row.visibility}
        >
          <span>{row.title}</span>
          <span data-testid="row-date-label">{row.dateLabel}</span>
        </div>
      ))}
    </div>
  ),
}))

vi.mock('@/components/chat/open-chat-button', () => ({
  OpenChatButton: ({ label }: { label: string }) => <button>{label}</button>,
}))

vi.mock('@/lib/ui', () => ({
  EmptyState: ({ message }: { message: string }) => <p>{message}</p>,
}))

interface TaskOverrides {
  id?: string
  title?: string
  type?: 'task' | 'goal'
  status?: 'pending' | 'in_progress' | 'completed'
  startAt?: Date | null
  targetDate?: Date | null
  recurrence?: string | null
  color?: string | null
  location?: string | null
  description?: string | null
  allDay?: boolean
}

function makeTask(over: TaskOverrides = {}) {
  return {
    id: 'id-1',
    title: 'Item',
    type: 'task' as const,
    status: 'pending' as const,
    startAt: new Date('2026-06-20T09:00:00.000Z'),
    endAt: new Date('2026-06-20T10:00:00.000Z'),
    recurrence: null,
    targetDate: null,
    color: null,
    location: null,
    description: null,
    allDay: false,
    activityType: 'solo',
    visibility: 'only_me',
    joinability: null,
    maxParticipants: null,
    ...over,
  }
}

function makeSession() {
  return { user: { id: 'user-1' } }
}

describe('ActivitiesPage', () => {
  beforeEach(() => {
    authMock.mockReset()
    getUserTasksMock.mockReset()
    getTaskStreaksMock.mockReset().mockResolvedValue({})
    safeDeleteExpiredEventsMock.mockReset().mockResolvedValue(undefined)
    getCalendarPrefsMock.mockReset().mockResolvedValue(null)
  })

  it('no longer imports the ActivityCreate quick-add bar', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/(app)/activities/page.tsx'), 'utf8')
    expect(src).not.toMatch(/@\/components\/activity\/activity-create['"]/)
    expect(src).not.toMatch(/<ActivityCreate\s*\/>/)
    expect(src).toContain('ActivityFilters')
    expect(src).toContain('ActivityCreateButton')
  })

  it('redirects to /login when unauthenticated', async () => {
    authMock.mockResolvedValue(null)
    await expect(ActivitiesPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT')
  })

  it('shows all activity types when no filter is set', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserTasksMock.mockResolvedValue([
      makeTask({ id: 't1', title: 'A task', type: 'task' }),
      makeTask({ id: 'g1', title: 'A goal', type: 'goal' }),
    ])
    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getAllByTestId('activity-row')).toHaveLength(2)
  })

  it('filters to goals only via ?type=goal', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserTasksMock.mockResolvedValue([
      makeTask({ id: 't1', title: 'A task', type: 'task' }),
      makeTask({ id: 'g1', title: 'A goal', type: 'goal' }),
    ])
    render(await ActivitiesPage({ searchParams: Promise.resolve({ type: 'goal' }) }))
    const cards = screen.getAllByTestId('activity-row')
    expect(cards).toHaveLength(1)
    expect(cards[0]).toHaveAttribute('data-type', 'goal')
  })

  it('falls back to all for an unknown filter value', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserTasksMock.mockResolvedValue([
      makeTask({ id: 't1', type: 'task' }),
      makeTask({ id: 'g1', type: 'goal' }),
    ])
    render(await ActivitiesPage({ searchParams: Promise.resolve({ type: 'bogus' }) }))
    expect(screen.getAllByTestId('activity-row')).toHaveLength(2)
  })

  it('?type=habit falls back to all (habit is no longer a valid filter)', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserTasksMock.mockResolvedValue([
      makeTask({ id: 't1', type: 'task' }),
      makeTask({ id: 'g1', type: 'goal' }),
    ])
    render(await ActivitiesPage({ searchParams: Promise.resolve({ type: 'habit' }) }))
    expect(screen.getAllByTestId('activity-row')).toHaveLength(2)
  })

  it('filters by ?status=completed', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserTasksMock.mockResolvedValue([
      makeTask({ id: 't1', title: 'Done task', type: 'task', status: 'completed' }),
      makeTask({ id: 't2', title: 'Pending task', type: 'task', status: 'pending' }),
    ])
    render(await ActivitiesPage({ searchParams: Promise.resolve({ status: 'completed' }) }))
    const cards = screen.getAllByTestId('activity-row')
    expect(cards).toHaveLength(1)
    expect(screen.getByText('Done task')).toBeInTheDocument()
  })

  it('filters by ?q= with case-insensitive title match', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserTasksMock.mockResolvedValue([
      makeTask({ id: 't1', title: 'Morning gym session', type: 'task' }),
      makeTask({ id: 't2', title: 'Read a book', type: 'task' }),
    ])
    render(await ActivitiesPage({ searchParams: Promise.resolve({ q: 'gym' }) }))
    const cards = screen.getAllByTestId('activity-row')
    expect(cards).toHaveLength(1)
    expect(screen.getByText('Morning gym session')).toBeInTheDocument()
  })

  it('?recurring=1 shows only tasks where recurrence is not null', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserTasksMock.mockResolvedValue([
      makeTask({ id: 't1', title: 'One-off task', type: 'task', recurrence: null }),
      makeTask({ id: 't2', title: 'Recurring task', type: 'task', recurrence: 'daily' }),
    ])
    render(await ActivitiesPage({ searchParams: Promise.resolve({ recurring: '1' }) }))
    const cards = screen.getAllByTestId('activity-row')
    expect(cards).toHaveLength(1)
    expect(screen.getByText('Recurring task')).toBeInTheDocument()
  })

  it('combined params are ANDed together', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserTasksMock.mockResolvedValue([
      makeTask({ id: 'g1', title: 'Gym goal', type: 'goal', status: 'pending' }),
      makeTask({ id: 't1', title: 'Gym task', type: 'task', status: 'pending' }),
      makeTask({ id: 'g2', title: 'Run goal', type: 'goal', status: 'completed' }),
    ])
    render(await ActivitiesPage({ searchParams: Promise.resolve({ type: 'goal', q: 'gym' }) }))
    const cards = screen.getAllByTestId('activity-row')
    expect(cards).toHaveLength(1)
    expect(screen.getByText('Gym goal')).toBeInTheDocument()
  })

  it('filtered empty result shows EmptyState and OpenChatButton', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserTasksMock.mockResolvedValue([makeTask({ id: 't1', title: 'A task', type: 'task' })])
    render(await ActivitiesPage({ searchParams: Promise.resolve({ q: 'nonexistent' }) }))
    expect(screen.getByText(/no activities yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /plan with ai/i })).toBeInTheDocument()
  })

  it('builds a type-specific date label and streak per row', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserTasksMock.mockResolvedValue([
      makeTask({ id: 'g1', type: 'goal', targetDate: new Date('2026-08-01T12:00:00.000Z') }),
      makeTask({ id: 'r1', type: 'task', recurrence: 'weekly' }),
      makeTask({ id: 't1', type: 'task', startAt: null }),
    ])
    getTaskStreaksMock.mockResolvedValue({ r1: 3 })
    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))

    const rows = screen.getAllByTestId('activity-row')
    const byId = (id: string): HTMLElement => rows.find((r) => r.dataset.taskId === id)!

    // Goal: date-only target conversion + label; goals always carry streak 0
    const goal = byId('g1')
    expect(within(goal).getByTestId('row-date-label')).toHaveTextContent('Target: 2026-08-01')
    expect(goal).toHaveAttribute('data-target-date', '2026-08-01')
    expect(goal).toHaveAttribute('data-streak', '0')

    // Recurring task: streak wired in from the streak map
    expect(byId('r1')).toHaveAttribute('data-streak', '3')

    // Non-recurring task with no start time falls back to "No time set"
    expect(within(byId('t1')).getByTestId('row-date-label')).toHaveTextContent('No time set')
  })

  it('assembles rich fields and social props into each row', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserTasksMock.mockResolvedValue([
      makeTask({
        id: 't-rich',
        type: 'task',
        color: 'blue',
        location: 'Coffee shop',
        description: 'Some notes',
        allDay: true,
      }),
    ])
    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))
    const row = screen.getByTestId('activity-row')
    expect(row).toHaveAttribute('data-task-id', 't-rich')
    expect(row).toHaveAttribute('data-color', 'blue')
    expect(row).toHaveAttribute('data-location', 'Coffee shop')
    expect(row).toHaveAttribute('data-description', 'Some notes')
    expect(row).toHaveAttribute('data-all-day', 'true')
    expect(row).toHaveAttribute('data-activity-type', 'solo')
    expect(row).toHaveAttribute('data-visibility', 'only_me')
  })

  it('threads use24h=true from calendar prefs into the create button and table', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserTasksMock.mockResolvedValue([makeTask({ id: 't1', type: 'task' })])
    getCalendarPrefsMock.mockResolvedValue({ use24h: true })
    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByTestId('activity-create-button')).toHaveAttribute('data-use24h', 'true')
    expect(screen.getByTestId('activity-table')).toHaveAttribute('data-use24h', 'true')
  })

  it('defaults use24h to false when there is no calendar prefs row', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserTasksMock.mockResolvedValue([makeTask({ id: 't1', type: 'task' })])
    getCalendarPrefsMock.mockResolvedValue(null)
    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByTestId('activity-create-button')).toHaveAttribute('data-use24h', 'false')
    expect(screen.getByTestId('activity-table')).toHaveAttribute('data-use24h', 'false')
  })

  it('shows the empty state when there are no activities', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserTasksMock.mockResolvedValue([])
    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText(/no activities yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /plan with ai/i })).toBeInTheDocument()
  })
})
