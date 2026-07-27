import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { FriendsList } from './friends-list'
import { removeFriend } from '@/server/actions/friends'

const refreshMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

vi.mock('@/server/actions/friends', () => ({
  removeFriend: vi.fn(),
}))

const ERROR_MESSAGE = 'Something went wrong. Try again.'
const NO_MATCHES = 'No matches.'

function makeFriend(overrides: Record<string, unknown> = {}) {
  return {
    friendshipId: 'friendship-1',
    userId: 'user-1',
    username: 'ada',
    name: 'Ada Lovelace',
    image: null,
    ...overrides,
  }
}

describe('FriendsList', () => {
  beforeEach(() => {
    refreshMock.mockClear()
    vi.mocked(removeFriend).mockReset()
  })

  it('renders the "No friends yet. Find people via search." empty state when friends is empty and not filtered', () => {
    render(<FriendsList friends={[]} isFiltered={false} />)
    expect(screen.getByText('No friends yet. Find people via search.')).toBeInTheDocument()
  })

  it('renders the "No matches." empty state when friends is empty and filtered', () => {
    render(<FriendsList friends={[]} isFiltered={true} />)
    expect(screen.getByText(NO_MATCHES)).toBeInTheDocument()
  })

  it('renders a friend row with the friend name', () => {
    render(<FriendsList friends={[makeFriend()]} isFiltered={false} />)
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
  })

  it('renders rows inside a divide-y container', () => {
    const { container } = render(<FriendsList friends={[makeFriend()]} isFiltered={false} />)
    expect(container.querySelector('.divide-y')).not.toBeNull()
  })

  it('renders a ⋯ options trigger labelled for the friend, with no always-visible Remove button', () => {
    render(<FriendsList friends={[makeFriend()]} isFiltered={false} />)
    expect(screen.getByRole('button', { name: 'Options for Ada Lovelace' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove friend' })).not.toBeInTheDocument()
  })

  it('removes a friend via the ⋯ menu and refreshes on success', async () => {
    const user = userEvent.setup()
    vi.mocked(removeFriend).mockResolvedValue({ data: { success: true } })
    render(<FriendsList friends={[makeFriend()]} isFiltered={false} />)

    // happy-dom + Radix dismissable-layer trap: a same-tick click() fired in
    // the same synchronous burst that mounts the dropdown's portal gets
    // consumed as an outside interaction and the menu closes instead of
    // opening. Two separately-awaited userEvent.click calls (as here, and as
    // friend-button.test.tsx already does) give the async boundary needed.
    await user.click(screen.getByRole('button', { name: 'Options for Ada Lovelace' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Remove friend' }))

    await vi.waitFor(() => {
      expect(removeFriend).toHaveBeenCalledWith({ friendshipId: 'friendship-1' })
      expect(refreshMock).toHaveBeenCalled()
    })
  })

  it('shows an inline error when removing fails, without refreshing', async () => {
    const user = userEvent.setup()
    vi.mocked(removeFriend).mockResolvedValue({ error: 'boom' })
    render(<FriendsList friends={[makeFriend()]} isFiltered={false} />)

    await user.click(screen.getByRole('button', { name: 'Options for Ada Lovelace' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Remove friend' }))

    expect(await screen.findByText(ERROR_MESSAGE)).toBeInTheDocument()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('disables the ⋯ trigger while the action is pending', async () => {
    const user = userEvent.setup()
    let resolveAction: (value: Awaited<ReturnType<typeof removeFriend>>) => void = () => {}
    vi.mocked(removeFriend).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve
        }),
    )
    render(<FriendsList friends={[makeFriend()]} isFiltered={false} />)
    const trigger = screen.getByRole('button', { name: 'Options for Ada Lovelace' })

    await user.click(trigger)
    await user.click(await screen.findByRole('menuitem', { name: 'Remove friend' }))

    await vi.waitFor(() => expect(trigger).toBeDisabled())

    resolveAction({ data: { success: true } })

    await vi.waitFor(() => expect(trigger).not.toBeDisabled())
  })
})
