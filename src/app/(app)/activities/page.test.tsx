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

vi.mock('@/components/activity/activity-create', () => ({
  ActivityCreate: () => <div data-testid="activity-create" />,
}))

vi.mock('@/components/activity/activity-card-actions', () => ({
  ActivityCardActions: ({ taskId }: { taskId: string }) => (
    <div data-testid="actions" data-task-id={taskId} />
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
  }: {
    title: string
    type: string
    detail: React.ReactNode
  }) => (
    <article data-testid="activity-card" data-type={type}>
      <span>{title}</span>
      {detail}
    </article>
  ),
}))

interface TaskOverrides {
  id?: string
  title?: string
  type?: 'task' | 'goal' | 'habit'
  status?: 'pending' | 'in_progress' | 'completed'
  startAt?: Date | null
  targetDate?: Date | null
  recurrence?: string | null
}

function makeTask(over: TaskOverrides = {}) {
  return {
    id: 'id-1',
    title: 'Item',
    type: 'task',
    status: 'pending',
    startAt: new Date('2026-06-20T09:00:00.000Z'),
    endAt: new Date('2026-06-20T10:00:00.000Z'),
    recurrence: null,
    targetDate: null,
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

  it('redirects to /login when unauthenticated', async () => {
    authMock.mockResolvedValue(null)
    await expect(ActivitiesPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT')
  })

  it('shows all activity types when no filter is set', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserTasksMock.mockResolvedValue([
      makeTask({ id: 't1', title: 'A task', type: 'task' }),
      makeTask({ id: 'g1', title: 'A goal', type: 'goal' }),
      makeTask({ id: 'h1', title: 'A habit', type: 'habit' }),
    ])
    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getAllByTestId('activity-card')).toHaveLength(3)
  })

  it('filters to a single type via ?type=goal', async () => {
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

  it('renders a type-specific detail line for each activity', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserTasksMock.mockResolvedValue([
      makeTask({ id: 'g1', type: 'goal', targetDate: new Date('2026-08-01T12:00:00.000Z') }),
      makeTask({ id: 'h1', type: 'habit', recurrence: 'weekly' }),
      makeTask({ id: 't1', type: 'task', startAt: new Date('2026-06-20T09:00:00.000Z') }),
    ])
    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText('Target: 2026-08-01')).toBeInTheDocument()
    expect(screen.getByText('weekly')).toBeInTheDocument()
    expect(screen.getByText(/^Due /)).toBeInTheDocument()
  })

  it('shows the empty state when there are no activities', async () => {
    authMock.mockResolvedValue(makeSession())
    getUserTasksMock.mockResolvedValue([])
    render(await ActivitiesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText(/no activities yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /plan with ai/i })).toBeInTheDocument()
  })
})
