import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import FeedPage from './page'

const authMock = vi.fn()
const searchUsersMock = vi.fn()

vi.mock('@/auth', () => ({ auth: () => authMock() }))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('REDIRECT')
  }),
}))

vi.mock('@/server/queries/profile', () => ({
  searchUsers: (...args: unknown[]) => searchUsersMock(...args),
}))

vi.mock('@/components/profile/people-search-input', () => ({
  PeopleSearchInput: () => <div data-testid="people-search-input" />,
}))

vi.mock('@/components/profile/person-card', () => ({
  PersonCard: ({
    result,
  }: {
    result: { username: string; name: string | null; image: string | null }
  }) => (
    <div data-testid="person-card">
      {result.name ?? `@${result.username}`} @{result.username}
    </div>
  ),
}))

vi.mock('@/lib/ui', () => ({
  EmptyState: ({ message }: { message: string }) => <p>{message}</p>,
}))

function pageArgs(q?: string) {
  return {
    searchParams: Promise.resolve(q === undefined ? {} : { q }),
  }
}

describe('FeedPage', () => {
  beforeEach(() => {
    authMock.mockReset()
    searchUsersMock.mockReset().mockResolvedValue([])
  })

  it('redirects to /login when unauthenticated', async () => {
    authMock.mockResolvedValue(null)

    await expect(FeedPage(pageArgs('ada'))).rejects.toThrow('REDIRECT')
  })

  it('shows the search prompt and does not call searchUsers when q is empty', async () => {
    authMock.mockResolvedValue({ user: { id: 'viewer-1' } })

    render(await FeedPage(pageArgs()))

    expect(screen.getByText('Search for people by name or username.')).toBeInTheDocument()
    expect(searchUsersMock).not.toHaveBeenCalled()
  })

  it('shows the search prompt and does not call searchUsers when q is whitespace', async () => {
    authMock.mockResolvedValue({ user: { id: 'viewer-1' } })

    render(await FeedPage(pageArgs('   ')))

    expect(screen.getByText('Search for people by name or username.')).toBeInTheDocument()
    expect(searchUsersMock).not.toHaveBeenCalled()
  })

  it('renders each result as a person card when q has matches', async () => {
    authMock.mockResolvedValue({ user: { id: 'viewer-1' } })
    searchUsersMock.mockResolvedValue([
      { username: 'ada', name: 'Ada Lovelace', image: null },
      { username: 'carol', name: null, image: null },
    ])

    render(await FeedPage(pageArgs('a')))

    expect(searchUsersMock).toHaveBeenCalledWith('viewer-1', 'a')
    expect(screen.getAllByTestId('person-card')).toHaveLength(2)
    expect(screen.getByText('Ada Lovelace @ada')).toBeInTheDocument()
    expect(screen.getByText('@carol @carol')).toBeInTheDocument()
  })

  it('shows a no-results message when q has no matches', async () => {
    authMock.mockResolvedValue({ user: { id: 'viewer-1' } })
    searchUsersMock.mockResolvedValue([])

    render(await FeedPage(pageArgs('zzz')))

    expect(screen.getByText('No people found.')).toBeInTheDocument()
  })

  it('always renders the people search input', async () => {
    authMock.mockResolvedValue({ user: { id: 'viewer-1' } })

    render(await FeedPage(pageArgs('ada')))

    expect(screen.getByTestId('people-search-input')).toBeInTheDocument()
  })
})
