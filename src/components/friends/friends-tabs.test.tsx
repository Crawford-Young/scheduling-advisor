import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FriendsTabs } from './friends-tabs'
import type { FriendRequestEntry, FriendUser } from '@/server/queries/friends'

vi.mock('./friends-list', () => ({
  FriendsList: ({
    friends,
    isFiltered,
  }: {
    friends: readonly FriendUser[]
    isFiltered: boolean
  }) => <div data-testid="friends-list" data-count={friends.length} data-filtered={isFiltered} />,
}))

vi.mock('./request-lists', () => ({
  IncomingRequestsList: ({
    requests,
    isFiltered,
  }: {
    requests: readonly FriendRequestEntry[]
    isFiltered: boolean
  }) => <div data-testid="incoming-list" data-count={requests.length} data-filtered={isFiltered} />,
  OutgoingRequestsList: ({
    requests,
    isFiltered,
  }: {
    requests: readonly FriendRequestEntry[]
    isFiltered: boolean
  }) => <div data-testid="outgoing-list" data-count={requests.length} data-filtered={isFiltered} />,
}))

function makeUser(overrides: Partial<FriendUser> = {}): FriendUser {
  return {
    friendshipId: 'f-1',
    userId: 'u-1',
    username: 'ada',
    name: 'Ada Lovelace',
    image: null,
    ...overrides,
  }
}

function makeRequest(overrides: Partial<FriendRequestEntry> = {}): FriendRequestEntry {
  return {
    ...makeUser(overrides),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

describe('FriendsTabs', () => {
  it('defaults to the Friends tab', () => {
    render(<FriendsTabs friends={[makeUser()]} incoming={[]} outgoing={[]} />)
    expect(screen.getByTestId('friends-list')).toBeInTheDocument()
    expect(screen.queryByTestId('incoming-list')).not.toBeInTheDocument()
  })

  it('shows total counts on every tab trigger', () => {
    render(
      <FriendsTabs
        friends={[makeUser({ friendshipId: 'f-1' }), makeUser({ friendshipId: 'f-2' })]}
        incoming={[makeRequest({ friendshipId: 'r-1' })]}
        outgoing={[]}
      />,
    )
    expect(screen.getByRole('tab', { name: 'Friends 2' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Requests 1' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Sent 0' })).toBeInTheDocument()
  })

  it('switches panels when a different tab is clicked', async () => {
    const user = userEvent.setup()
    render(
      <FriendsTabs
        friends={[makeUser()]}
        incoming={[makeRequest()]}
        outgoing={[makeRequest({ friendshipId: 'r-2' })]}
      />,
    )

    await user.click(screen.getByRole('tab', { name: 'Requests 1' }))
    expect(await screen.findByTestId('incoming-list')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Sent 1' }))
    expect(await screen.findByTestId('outgoing-list')).toBeInTheDocument()
  })

  it('has an accessible search input that filters by name or username', async () => {
    const user = userEvent.setup()
    render(
      <FriendsTabs
        friends={[makeUser({ friendshipId: 'f-1', name: 'Ada Lovelace', username: 'ada' })]}
        incoming={[]}
        outgoing={[]}
      />,
    )

    await user.type(screen.getByRole('searchbox', { name: 'Search friends' }), 'zzz-no-match')

    expect(screen.getByTestId('friends-list')).toHaveAttribute('data-count', '0')
    expect(screen.getByTestId('friends-list')).toHaveAttribute('data-filtered', 'true')
  })

  it('keeps tab counts as totals even while a search query filters the visible list', async () => {
    const user = userEvent.setup()
    render(
      <FriendsTabs
        friends={[
          makeUser({ friendshipId: 'f-1', name: 'Ada Lovelace', username: 'ada' }),
          makeUser({ friendshipId: 'f-2', name: 'Bob Marley', username: 'bob' }),
        ]}
        incoming={[]}
        outgoing={[]}
      />,
    )

    await user.type(screen.getByRole('searchbox', { name: 'Search friends' }), 'ada')

    expect(screen.getByTestId('friends-list')).toHaveAttribute('data-count', '1')
    expect(screen.getByRole('tab', { name: 'Friends 2' })).toBeInTheDocument()
  })

  it('matches on username as well as name', async () => {
    const user = userEvent.setup()
    render(
      <FriendsTabs
        friends={[makeUser({ name: null, username: 'carol' })]}
        incoming={[]}
        outgoing={[]}
      />,
    )

    await user.type(screen.getByRole('searchbox', { name: 'Search friends' }), 'carol')

    expect(screen.getByTestId('friends-list')).toHaveAttribute('data-count', '1')
  })

  it('matches on name for a user with no username', async () => {
    const user = userEvent.setup()
    render(
      <FriendsTabs
        friends={[makeUser({ name: 'Dana Scully', username: null })]}
        incoming={[]}
        outgoing={[]}
      />,
    )

    await user.type(screen.getByRole('searchbox', { name: 'Search friends' }), 'dana')

    expect(screen.getByTestId('friends-list')).toHaveAttribute('data-count', '1')
  })

  it('filters the requests panels with the same query', async () => {
    const user = userEvent.setup()
    render(
      <FriendsTabs
        friends={[]}
        incoming={[makeRequest({ friendshipId: 'r-1', name: 'Ada Lovelace', username: 'ada' })]}
        outgoing={[makeRequest({ friendshipId: 'r-2', name: 'Bob Marley', username: 'bob' })]}
      />,
    )

    await user.type(screen.getByRole('searchbox', { name: 'Search friends' }), 'bob')
    await user.click(screen.getByRole('tab', { name: 'Requests 1' }))
    expect(await screen.findByTestId('incoming-list')).toHaveAttribute('data-count', '0')

    await user.click(screen.getByRole('tab', { name: 'Sent 1' }))
    expect(await screen.findByTestId('outgoing-list')).toHaveAttribute('data-count', '1')
  })

  it('treats an empty or whitespace-only query as unfiltered', async () => {
    const user = userEvent.setup()
    render(
      <FriendsTabs friends={[makeUser({ friendshipId: 'f-1' })]} incoming={[]} outgoing={[]} />,
    )

    await user.type(screen.getByRole('searchbox', { name: 'Search friends' }), '   ')

    expect(screen.getByTestId('friends-list')).toHaveAttribute('data-filtered', 'false')
    expect(screen.getByTestId('friends-list')).toHaveAttribute('data-count', '1')
  })
})
