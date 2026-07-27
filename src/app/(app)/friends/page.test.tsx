import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import FriendsPage from './page'

const authMock = vi.fn()
const getFriendsMock = vi.fn()
const getIncomingRequestsMock = vi.fn()
const getOutgoingRequestsMock = vi.fn()

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

vi.mock('@/auth', () => ({ auth: () => authMock() }))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('REDIRECT')
  }),
}))

vi.mock('@/server/queries/friends', () => ({
  getFriends: (...args: unknown[]) => getFriendsMock(...args),
  getIncomingRequests: (...args: unknown[]) => getIncomingRequestsMock(...args),
  getOutgoingRequests: (...args: unknown[]) => getOutgoingRequestsMock(...args),
}))

vi.mock('@/components/friends/friends-tabs', () => ({
  FriendsTabs: ({
    friends,
    incoming,
    outgoing,
  }: {
    friends: readonly { friendshipId: string }[]
    incoming: readonly { friendshipId: string }[]
    outgoing: readonly { friendshipId: string }[]
  }) => (
    <div
      data-testid="friends-tabs"
      data-friends-count={friends.length}
      data-incoming-count={incoming.length}
      data-outgoing-count={outgoing.length}
    />
  ),
}))

vi.mock('@/lib/ui', () => ({
  PageHeader: ({ title }: { title: React.ReactNode }) => (
    <div data-testid="page-header">{title}</div>
  ),
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

describe('FriendsPage', () => {
  beforeEach(() => {
    authMock.mockReset()
    getFriendsMock.mockReset().mockResolvedValue([])
    getIncomingRequestsMock.mockReset().mockResolvedValue([])
    getOutgoingRequestsMock.mockReset().mockResolvedValue([])
  })

  it('redirects to /login when unauthenticated', async () => {
    authMock.mockResolvedValue(null)

    await expect(FriendsPage()).rejects.toThrow('REDIRECT')
  })

  it('reads friends, incoming, and outgoing requests scoped to the session user', async () => {
    authMock.mockResolvedValue({ user: { id: 'viewer-1' } })

    await FriendsPage()

    expect(getFriendsMock).toHaveBeenCalledWith('viewer-1')
    expect(getIncomingRequestsMock).toHaveBeenCalledWith('viewer-1')
    expect(getOutgoingRequestsMock).toHaveBeenCalledWith('viewer-1')
  })

  it('renders the page header with the "Friends" title', async () => {
    authMock.mockResolvedValue({ user: { id: 'viewer-1' } })

    render(await FriendsPage())

    expect(screen.getByTestId('page-header')).toHaveTextContent('Friends')
  })

  it('passes friends, incoming, and outgoing requests to FriendsTabs', async () => {
    authMock.mockResolvedValue({ user: { id: 'viewer-1' } })
    getFriendsMock.mockResolvedValue([{ friendshipId: 'f-1' }])
    getIncomingRequestsMock.mockResolvedValue([{ friendshipId: 'r-1' }])
    getOutgoingRequestsMock.mockResolvedValue([{ friendshipId: 'r-2' }, { friendshipId: 'r-3' }])

    render(await FriendsPage())

    const tabs = screen.getByTestId('friends-tabs')
    expect(tabs).toHaveAttribute('data-friends-count', '1')
    expect(tabs).toHaveAttribute('data-incoming-count', '1')
    expect(tabs).toHaveAttribute('data-outgoing-count', '2')
  })

  it('wraps the page in a reveal ViewTransition with a single-section space-y-6 container', async () => {
    authMock.mockResolvedValue({ user: { id: 'viewer-1' } })

    render(await FriendsPage())

    const viewTransition = screen.getByTestId('view-transition')
    expect(viewTransition).toHaveAttribute('data-enter', 'reveal-enter')
    expect(viewTransition).toHaveAttribute('data-default', 'none')
    const staggerReveal = screen.getByTestId('stagger-reveal')
    expect(staggerReveal).toHaveClass('mx-auto', 'max-w-5xl', 'space-y-6')
  })
})
