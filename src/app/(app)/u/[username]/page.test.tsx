import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import ProfilePage from './page'

const authMock = vi.fn()
const getProfileByUsernameMock = vi.fn()
const getProfileWeekEventsMock = vi.fn()
const getFriendshipBetweenMock = vi.fn()
const resolveWeekStartMock = vi.fn()
const notFoundMock = vi.fn(() => {
  throw new Error('NOT_FOUND')
})

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    ViewTransition: ({
      children,
      enter,
      exit,
      default: defaultTransition,
    }: {
      readonly children: React.ReactNode
      readonly enter?: string
      readonly exit?: string
      readonly default?: string
    }) => (
      <div
        data-testid="view-transition"
        data-enter={enter}
        data-exit={exit}
        data-default={defaultTransition}
      >
        {children}
      </div>
    ),
  }
})

vi.mock('@/lib/ui', () => ({
  StaggerReveal: ({
    children,
    className,
  }: {
    readonly children: React.ReactNode
    readonly className?: string
  }) => (
    <div data-testid="stagger-reveal" className={className}>
      {children}
    </div>
  ),
}))

vi.mock('@/auth', () => ({ auth: () => authMock() }))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('REDIRECT')
  }),
  notFound: () => notFoundMock(),
}))

vi.mock('@/server/queries/profile', () => ({
  getProfileByUsername: (...args: unknown[]) => getProfileByUsernameMock(...args),
  getProfileWeekEvents: (...args: unknown[]) => getProfileWeekEventsMock(...args),
}))

vi.mock('@/server/queries/friends', () => ({
  getFriendshipBetween: (...args: unknown[]) => getFriendshipBetweenMock(...args),
}))

vi.mock('@/lib/calendar-week-param', () => ({
  resolveWeekStart: (...args: unknown[]) => resolveWeekStartMock(...args),
}))

vi.mock('@/components/profile/profile-header', () => ({
  ProfileHeader: ({
    identity,
    action,
  }: {
    identity: { name: string | null; username: string }
    action?: React.ReactNode
  }) => (
    <div data-testid="profile-header">
      {identity.name ?? identity.username}
      {action}
    </div>
  ),
}))

vi.mock('@/components/profile/friend-button', () => ({
  FriendButton: ({
    profileUserId,
    view,
    friendshipId,
  }: {
    profileUserId: string
    view: string
    friendshipId: string | null
  }) => (
    <div
      data-testid="friend-button"
      data-profile-user-id={profileUserId}
      data-view={view}
      data-friendship-id={friendshipId ?? ''}
    >
      friend button
    </div>
  ),
}))

vi.mock('@/components/profile/profile-week-view', () => ({
  ProfileWeekView: ({ events, weekStart }: { events: readonly unknown[]; weekStart: string }) => (
    <div
      data-testid="profile-week-view"
      data-week-start={weekStart}
      data-event-count={events.length}
    >
      week view
    </div>
  ),
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

/** Builds the params/searchParams promises ProfilePage expects. */
function pageArgs(username: string, week?: string) {
  return {
    params: Promise.resolve({ username }),
    searchParams: Promise.resolve({ week }),
  }
}

describe('ProfilePage', () => {
  beforeEach(() => {
    authMock.mockReset()
    getProfileByUsernameMock.mockReset()
    getProfileWeekEventsMock.mockReset()
    getFriendshipBetweenMock.mockReset()
    resolveWeekStartMock.mockReset()
    notFoundMock.mockClear()
    resolveWeekStartMock.mockReturnValue('2026-07-19')
    getProfileWeekEventsMock.mockResolvedValue([])
    getFriendshipBetweenMock.mockResolvedValue(null)
  })

  it('redirects to /login when unauthenticated', async () => {
    authMock.mockResolvedValue(null)

    await expect(ProfilePage(pageArgs('ada'))).rejects.toThrow('REDIRECT')
  })

  it('calls notFound() when the identity lookup returns null', async () => {
    authMock.mockResolvedValue({ user: { id: 'viewer-1' } })
    getProfileByUsernameMock.mockResolvedValue(null)

    await expect(ProfilePage(pageArgs('ghost'))).rejects.toThrow('NOT_FOUND')
    expect(notFoundMock).toHaveBeenCalled()
  })

  it('resolves the identity scoped to the viewer session', async () => {
    authMock.mockResolvedValue({ user: { id: 'viewer-1' } })
    getProfileByUsernameMock.mockResolvedValue(makeIdentity({ id: 'owner-1' }))

    await ProfilePage(pageArgs('ada'))

    expect(getProfileByUsernameMock).toHaveBeenCalledWith('viewer-1', 'ada')
  })

  it('renders the header from the fetched identity', async () => {
    authMock.mockResolvedValue({ user: { id: 'viewer-1' } })
    getProfileByUsernameMock.mockResolvedValue(makeIdentity())

    render(await ProfilePage(pageArgs('ada')))

    expect(screen.getByTestId('profile-header')).toHaveTextContent('Ada Lovelace')
  })

  it('wraps the page in a reveal ViewTransition with a two-section space-y-10 container', async () => {
    authMock.mockResolvedValue({ user: { id: 'viewer-1' } })
    getProfileByUsernameMock.mockResolvedValue(makeIdentity())

    const { container } = render(await ProfilePage(pageArgs('ada')))

    const viewTransition = screen.getByTestId('view-transition')
    expect(viewTransition).toHaveAttribute('data-enter', 'reveal-enter')
    expect(viewTransition).toHaveAttribute('data-default', 'none')
    const outer = container.querySelector('.mx-auto.max-w-5xl.space-y-10')
    expect(outer).not.toBeNull()
  })

  it('resolves weekStart via resolveWeekStart from the ?week= search param', async () => {
    authMock.mockResolvedValue({ user: { id: 'viewer-1' } })
    getProfileByUsernameMock.mockResolvedValue(makeIdentity({ id: 'owner-1' }))

    await ProfilePage(pageArgs('ada', '2026-07-12'))

    expect(resolveWeekStartMock).toHaveBeenCalledWith('2026-07-12')
  })

  it('fetches the viewer-scoped week of events for the profile owner', async () => {
    authMock.mockResolvedValue({ user: { id: 'viewer-1' } })
    getProfileByUsernameMock.mockResolvedValue(makeIdentity({ id: 'owner-1' }))
    resolveWeekStartMock.mockReturnValue('2026-07-19')

    await ProfilePage(pageArgs('ada'))

    expect(getProfileWeekEventsMock).toHaveBeenCalledWith('viewer-1', 'owner-1', '2026-07-19')
  })

  it('renders ProfileWeekView with the fetched events and weekStart, outside StaggerReveal', async () => {
    authMock.mockResolvedValue({ user: { id: 'viewer-1' } })
    getProfileByUsernameMock.mockResolvedValue(makeIdentity({ id: 'owner-1' }))
    resolveWeekStartMock.mockReturnValue('2026-07-19')
    getProfileWeekEventsMock.mockResolvedValue([{ kind: 'busy', id: 'evt-1' }])

    render(await ProfilePage(pageArgs('ada')))

    const weekView = screen.getByTestId('profile-week-view')
    expect(weekView).toHaveAttribute('data-week-start', '2026-07-19')
    expect(weekView).toHaveAttribute('data-event-count', '1')

    const staggerReveal = screen.getByTestId('stagger-reveal')
    expect(within(staggerReveal).queryByTestId('profile-week-view')).toBeNull()
    expect(within(staggerReveal).getByTestId('profile-header')).toBeInTheDocument()
  })

  it('does not fetch a friendship or render a FriendButton for the profile owner', async () => {
    authMock.mockResolvedValue({ user: { id: 'owner-1' } })
    getProfileByUsernameMock.mockResolvedValue(makeIdentity({ id: 'owner-1', isOwner: true }))

    render(await ProfilePage(pageArgs('ada')))

    expect(getFriendshipBetweenMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('friend-button')).not.toBeInTheDocument()
  })

  it('renders FriendButton with view "none" when no friendship row exists for a non-owner profile', async () => {
    authMock.mockResolvedValue({ user: { id: 'viewer-1' } })
    getProfileByUsernameMock.mockResolvedValue(makeIdentity({ id: 'owner-1', isOwner: false }))
    getFriendshipBetweenMock.mockResolvedValue(null)

    render(await ProfilePage(pageArgs('ada')))

    expect(getFriendshipBetweenMock).toHaveBeenCalledWith('viewer-1', 'owner-1')
    const friendButton = screen.getByTestId('friend-button')
    expect(friendButton).toHaveAttribute('data-profile-user-id', 'owner-1')
    expect(friendButton).toHaveAttribute('data-view', 'none')
    expect(friendButton).toHaveAttribute('data-friendship-id', '')
  })

  it('renders FriendButton with view "outgoing" when the viewer sent a pending request', async () => {
    authMock.mockResolvedValue({ user: { id: 'viewer-1' } })
    getProfileByUsernameMock.mockResolvedValue(makeIdentity({ id: 'owner-1', isOwner: false }))
    getFriendshipBetweenMock.mockResolvedValue({
      id: 'friendship-1',
      requesterId: 'viewer-1',
      addresseeId: 'owner-1',
      status: 'pending',
    })

    render(await ProfilePage(pageArgs('ada')))

    const friendButton = screen.getByTestId('friend-button')
    expect(friendButton).toHaveAttribute('data-view', 'outgoing')
    expect(friendButton).toHaveAttribute('data-friendship-id', 'friendship-1')
  })

  it('renders FriendButton with view "incoming" when the viewer received a pending request', async () => {
    authMock.mockResolvedValue({ user: { id: 'viewer-1' } })
    getProfileByUsernameMock.mockResolvedValue(makeIdentity({ id: 'owner-1', isOwner: false }))
    getFriendshipBetweenMock.mockResolvedValue({
      id: 'friendship-1',
      requesterId: 'owner-1',
      addresseeId: 'viewer-1',
      status: 'pending',
    })

    render(await ProfilePage(pageArgs('ada')))

    const friendButton = screen.getByTestId('friend-button')
    expect(friendButton).toHaveAttribute('data-view', 'incoming')
    expect(friendButton).toHaveAttribute('data-friendship-id', 'friendship-1')
  })

  it('renders FriendButton with view "friends" when the friendship is accepted', async () => {
    authMock.mockResolvedValue({ user: { id: 'viewer-1' } })
    getProfileByUsernameMock.mockResolvedValue(makeIdentity({ id: 'owner-1', isOwner: false }))
    getFriendshipBetweenMock.mockResolvedValue({
      id: 'friendship-1',
      requesterId: 'viewer-1',
      addresseeId: 'owner-1',
      status: 'accepted',
    })

    render(await ProfilePage(pageArgs('ada')))

    const friendButton = screen.getByTestId('friend-button')
    expect(friendButton).toHaveAttribute('data-view', 'friends')
    expect(friendButton).toHaveAttribute('data-friendship-id', 'friendship-1')
  })
})
