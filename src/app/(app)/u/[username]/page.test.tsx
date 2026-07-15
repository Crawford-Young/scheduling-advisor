import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import ProfilePage from './page'

const authMock = vi.fn()
const getProfileByUsernameMock = vi.fn()
const getProfileStreaksMock = vi.fn()
const getProfileStatsMock = vi.fn()
const getProfileActivitiesMock = vi.fn()
const notFoundMock = vi.fn(() => {
  throw new Error('NOT_FOUND')
})

vi.mock('@/auth', () => ({ auth: () => authMock() }))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('REDIRECT')
  }),
  notFound: () => notFoundMock(),
}))

vi.mock('@/server/queries/profile', () => ({
  getProfileByUsername: (...args: unknown[]) => getProfileByUsernameMock(...args),
  getProfileStreaks: (...args: unknown[]) => getProfileStreaksMock(...args),
  getProfileStats: (...args: unknown[]) => getProfileStatsMock(...args),
  getProfileActivities: (...args: unknown[]) => getProfileActivitiesMock(...args),
}))

vi.mock('@/components/profile/profile-header', () => ({
  ProfileHeader: ({ identity }: { identity: { name: string | null; username: string } }) => (
    <div data-testid="profile-header">{identity.name ?? identity.username}</div>
  ),
}))

vi.mock('@/components/profile/profile-stats', () => ({
  ProfileStats: ({
    stats,
  }: {
    stats: { completionsThisWeek: number; completionsThisMonth: number; completionsAllTime: number }
  }) => (
    <div data-testid="profile-stats">
      <span data-testid="stat-week">{stats.completionsThisWeek}</span>
      <span data-testid="stat-month">{stats.completionsThisMonth}</span>
      <span data-testid="stat-all-time">{stats.completionsAllTime}</span>
    </div>
  ),
}))

vi.mock('@/lib/ui', () => ({
  EmptyState: ({ message }: { message: string }) => <p>{message}</p>,
  StreakBadge: ({ streak }: { streak: number }) => <span data-testid="streak-badge">{streak}</span>,
}))

function makeIdentity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'owner-1',
    name: 'Ada Lovelace',
    username: 'ada',
    image: null,
    bio: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    isOwner: false,
    ...overrides,
  }
}

describe('ProfilePage', () => {
  beforeEach(() => {
    authMock.mockReset()
    getProfileByUsernameMock.mockReset()
    getProfileStreaksMock.mockReset().mockResolvedValue([])
    getProfileStatsMock
      .mockReset()
      .mockResolvedValue({ completionsThisWeek: 0, completionsThisMonth: 0, completionsAllTime: 0 })
    getProfileActivitiesMock.mockReset().mockResolvedValue([])
    notFoundMock.mockClear()
  })

  it('redirects to /login when unauthenticated', async () => {
    authMock.mockResolvedValue(null)

    await expect(ProfilePage({ params: Promise.resolve({ username: 'ada' }) })).rejects.toThrow(
      'REDIRECT',
    )
  })

  it('calls notFound() when the identity lookup returns null', async () => {
    authMock.mockResolvedValue({ user: { id: 'viewer-1' } })
    getProfileByUsernameMock.mockResolvedValue(null)

    await expect(ProfilePage({ params: Promise.resolve({ username: 'ghost' }) })).rejects.toThrow(
      'NOT_FOUND',
    )
    expect(notFoundMock).toHaveBeenCalled()
  })

  it('fetches streaks/stats/activities scoped to the resolved owner id', async () => {
    authMock.mockResolvedValue({ user: { id: 'viewer-1' } })
    getProfileByUsernameMock.mockResolvedValue(makeIdentity({ id: 'owner-1' }))

    await ProfilePage({ params: Promise.resolve({ username: 'ada' }) })

    expect(getProfileStreaksMock).toHaveBeenCalledWith('viewer-1', 'owner-1')
    expect(getProfileStatsMock).toHaveBeenCalledWith('viewer-1', 'owner-1')
    expect(getProfileActivitiesMock).toHaveBeenCalledWith('viewer-1', 'owner-1')
  })

  it('renders the header, streak titles, stat counts, and activity titles from fetched data', async () => {
    authMock.mockResolvedValue({ user: { id: 'viewer-1' } })
    getProfileByUsernameMock.mockResolvedValue(makeIdentity())
    getProfileStreaksMock.mockResolvedValue([{ title: 'Morning Run', current: 4, best: 6 }])
    getProfileStatsMock.mockResolvedValue({
      completionsThisWeek: 2,
      completionsThisMonth: 9,
      completionsAllTime: 40,
    })
    getProfileActivitiesMock.mockResolvedValue([
      {
        id: 'a1',
        title: 'Daily Stretch',
        type: 'task',
        recurrence: 'daily',
        streak: 5,
        lastStartAt: new Date('2026-07-09T10:00:00.000Z'),
      },
    ])

    render(await ProfilePage({ params: Promise.resolve({ username: 'ada' }) }))

    expect(screen.getByTestId('profile-header')).toHaveTextContent('Ada Lovelace')
    expect(screen.getByText('Morning Run')).toBeInTheDocument()
    expect(screen.getByText('best 6')).toBeInTheDocument()
    expect(screen.getByTestId('stat-week')).toHaveTextContent('2')
    expect(screen.getByTestId('stat-month')).toHaveTextContent('9')
    expect(screen.getByTestId('stat-all-time')).toHaveTextContent('40')
    expect(screen.getByText('Daily Stretch')).toBeInTheDocument()
  })

  it('shows an empty-state message when there are no streaks', async () => {
    authMock.mockResolvedValue({ user: { id: 'viewer-1' } })
    getProfileByUsernameMock.mockResolvedValue(makeIdentity())
    getProfileStreaksMock.mockResolvedValue([])

    render(await ProfilePage({ params: Promise.resolve({ username: 'ada' }) }))

    expect(screen.getByText(/no streaks yet/i)).toBeInTheDocument()
  })

  it('shows an empty-state message when there are no visible activities', async () => {
    authMock.mockResolvedValue({ user: { id: 'viewer-1' } })
    getProfileByUsernameMock.mockResolvedValue(makeIdentity())
    getProfileActivitiesMock.mockResolvedValue([])

    render(await ProfilePage({ params: Promise.resolve({ username: 'ada' }) }))

    expect(screen.getByText(/no visible activities yet/i)).toBeInTheDocument()
  })

  it('renders a recurrence label only when the activity has one, and hides the streak badge when streak is 0', async () => {
    authMock.mockResolvedValue({ user: { id: 'viewer-1' } })
    getProfileByUsernameMock.mockResolvedValue(makeIdentity())
    getProfileActivitiesMock.mockResolvedValue([
      {
        id: 'a1',
        title: 'One-off Task',
        type: 'task',
        recurrence: null,
        streak: 0,
        lastStartAt: null,
      },
    ])

    render(await ProfilePage({ params: Promise.resolve({ username: 'ada' }) }))

    expect(screen.getByText('One-off Task')).toBeInTheDocument()
    expect(screen.queryByTestId('streak-badge')).not.toBeInTheDocument()
  })
})
