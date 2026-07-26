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

vi.mock('@/components/friends/requests-section', () => ({
  RequestsSection: ({
    incoming,
    outgoing,
  }: {
    incoming: readonly { friendshipId: string }[]
    outgoing: readonly { friendshipId: string }[]
  }) => (
    <div
      data-testid="requests-section"
      data-incoming-count={incoming.length}
      data-outgoing-count={outgoing.length}
    />
  ),
}))

vi.mock('@/components/friends/friends-section', () => ({
  FriendsSection: ({ friends }: { friends: readonly { friendshipId: string }[] }) => (
    <div data-testid="friends-section" data-friends-count={friends.length} />
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

  it('passes incoming and outgoing requests to RequestsSection', async () => {
    authMock.mockResolvedValue({ user: { id: 'viewer-1' } })
    getIncomingRequestsMock.mockResolvedValue([{ friendshipId: 'r-1' }])
    getOutgoingRequestsMock.mockResolvedValue([{ friendshipId: 'r-2' }, { friendshipId: 'r-3' }])

    render(await FriendsPage())

    const section = screen.getByTestId('requests-section')
    expect(section).toHaveAttribute('data-incoming-count', '1')
    expect(section).toHaveAttribute('data-outgoing-count', '2')
  })

  it('passes friends to FriendsSection', async () => {
    authMock.mockResolvedValue({ user: { id: 'viewer-1' } })
    getFriendsMock.mockResolvedValue([{ friendshipId: 'f-1' }])

    render(await FriendsPage())

    expect(screen.getByTestId('friends-section')).toHaveAttribute('data-friends-count', '1')
  })

  it('wraps the page in a reveal ViewTransition with a two-section space-y-10 container', async () => {
    authMock.mockResolvedValue({ user: { id: 'viewer-1' } })

    render(await FriendsPage())

    const viewTransition = screen.getByTestId('view-transition')
    expect(viewTransition).toHaveAttribute('data-enter', 'reveal-enter')
    expect(viewTransition).toHaveAttribute('data-default', 'none')
    const staggerReveal = screen.getByTestId('stagger-reveal')
    expect(staggerReveal).toHaveClass('mx-auto', 'max-w-5xl', 'space-y-10')
  })
})
