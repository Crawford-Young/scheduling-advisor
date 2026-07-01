import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import ActivitiesPage from './page'

const authMock = vi.fn()
const getUserTasksMock = vi.fn()
const getTaskStreaksMock = vi.fn()

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

vi.mock('@/components/activity/activity-filters', () => ({
  ActivityFilters: () => <div data-testid="activity-filters" />,
}))

vi.mock('@/components/activity/activity-create-button', () => ({
  ActivityCreateButton: () => <div data-testid="activity-create-button" />,
}))

vi.mock('@/components/activity/activity-card-actions', () => ({
  ActivityCardActions: ({
    taskId,
    color,
    location,
    description,
    allDay,
  }: {
    taskId: string
    color?: string | null
    location?: string | null
    description?: string | null
    allDay?: boolean
  }) => (
    <div
      data-testid="actions"
      data-task-id={taskId}
      data-color={color ?? ''}
      data-location={location ?? ''}
      data-description={description ?? ''}
      data-all-day={String(allDay)}
    />
  ),
}))

vi.mock('@/components/chat/open-chat-button', () => ({
  OpenChatButton: ({ label }: { label: string }) => <button>{label}</button>,
}))

vi.mock('@/lib/ui', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  EmptyState: ({ message }: { message: string }) => <p>{message}</p>,
  ActivityCard: ({
    title,
    type,
    detail,
    actions,
  }: {
    title: string
    type: string
    detail: React.ReactNode
    actions: React.ReactNode
  }) => (
    <article data-testid="activity-card" data-type={type}>
      <span>{title}</span>
      {detail}
      {actions}
    </article>
  ),
  StreakBadge: ({ streak }: { streak: number }) => <span data-testid="streak-badge">{streak}</span>,
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
    expect(screen.getAllByTestId('activity-card')).toHaveLength(2)
  })

  it('filters to goals only via ?type=goal', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserTasksMock.mockResolvedValue([
      makeTask({ id: 't1', title: 'A task', type: 'task' }),
      makeTask({ id: 'g1', title: 'A goal', type: 'goal' }),
    ])
    render(await ActivitiesPage({ searchParams: Promise.resolve({ type: 'goal' }) }))
    const cards = screen.getAllByTestId('activity-card')
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
    expect(screen.getAllByTestId('activity-card')).toHaveLength(2)
  })

  it('?type=habit falls back to all (habit is no longer a valid filter)', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserTasksMock.mockResolvedValue([
      makeTask({ id: 't1', type: 'task' }),
      makeTask({ id: 'g1', type: 'goal' }),
    ])
    render(await ActivitiesPage({ searchParams: Promise.resolve({ type: 'habit' }) }))
    expect(screen.getAllByTestId('activity-card')).toHaveLength(2)
  })

  it('filters by ?status=completed', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserTasksMock.mockResolvedValue([
      makeTask({ id: 't1', title: 'Done task', type: 'task', status: 'completed' }),
      makeTask({ id: 't2', title: 'Pending task', type: 'task', status: 'pending' }),
    ])
    render(await ActivitiesPage({ searchParams: Promise.resolve({ status: 'completed' }) }))
    const cards = screen.getAllByTestId('activity-card')
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
    const cards = screen.getAllByTestId('activity-card')
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
    const cards = screen.getAllByTestId('activity-card')
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
    const cards = screen.getAllByTestId('activity-card')
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

  it('renders a type-specific detail line for each activity', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserTasksMock.mockResolvedValue([
      makeTask({ id: 'g1', type: 'goal', targetDate: new Date('2026-08-01T12:00:00.000Z') }),
      makeTask({ id: 'r1', type: 'task', recurrence: 'weekly' }),
      makeTask({ id: 't1', type: 'task', startAt: new Date('2026-06-20T09:00:00.000Z') }),
    ])
    getTaskStreaksMock.mockResolvedValue({ r1: 3 })
    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText('Target: 2026-08-01')).toBeInTheDocument()
    expect(screen.getByTestId('streak-badge')).toHaveTextContent('3')
    expect(screen.getByText(/^Due /)).toBeInTheDocument()
  })

  it('hydrates the card actions with the task rich fields (color/location/description/allDay)', async () => {
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
    const actions = screen.getByTestId('actions')
    expect(actions).toHaveAttribute('data-task-id', 't-rich')
    expect(actions).toHaveAttribute('data-color', 'blue')
    expect(actions).toHaveAttribute('data-location', 'Coffee shop')
    expect(actions).toHaveAttribute('data-description', 'Some notes')
    expect(actions).toHaveAttribute('data-all-day', 'true')
  })

  it('shows the empty state when there are no activities', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserTasksMock.mockResolvedValue([])
    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText(/no activities yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /plan with ai/i })).toBeInTheDocument()
  })
})
