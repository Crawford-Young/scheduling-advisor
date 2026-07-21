import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import ProfilePage from './page'

const authMock = vi.fn()
const getProfileByUsernameMock = vi.fn()
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
}))

vi.mock('@/components/profile/profile-header', () => ({
  ProfileHeader: ({ identity }: { identity: { name: string | null; username: string } }) => (
    <div data-testid="profile-header">{identity.name ?? identity.username}</div>
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

/** Builds the params Promise ProfilePage expects. */
function pageArgs(username: string) {
  return { params: Promise.resolve({ username }) }
}

describe('ProfilePage', () => {
  beforeEach(() => {
    authMock.mockReset()
    getProfileByUsernameMock.mockReset()
    notFoundMock.mockClear()
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

  it('wraps the page in a reveal ViewTransition with a StaggerReveal container', async () => {
    authMock.mockResolvedValue({ user: { id: 'viewer-1' } })
    getProfileByUsernameMock.mockResolvedValue(makeIdentity())

    render(await ProfilePage(pageArgs('ada')))

    const viewTransition = screen.getByTestId('view-transition')
    expect(viewTransition).toHaveAttribute('data-enter', 'reveal-enter')
    expect(viewTransition).toHaveAttribute('data-default', 'none')
    const staggerReveal = screen.getByTestId('stagger-reveal')
    expect(staggerReveal).toHaveClass('mx-auto', 'max-w-5xl', 'space-y-6')
  })
})
