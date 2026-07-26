import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { FriendsSection } from './friends-section'
import { removeFriend } from '@/server/actions/friends'

const refreshMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

vi.mock('@/server/actions/friends', () => ({
  removeFriend: vi.fn(),
}))

const ERROR_MESSAGE = 'Something went wrong. Try again.'

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

describe('FriendsSection', () => {
  beforeEach(() => {
    refreshMock.mockClear()
    vi.mocked(removeFriend).mockReset()
  })

  it('renders the "No friends yet. Find people via search." empty state when friends is empty', () => {
    render(<FriendsSection friends={[]} />)
    expect(screen.getByText('No friends yet. Find people via search.')).toBeInTheDocument()
  })

  it('renders a friend row with the friend name', () => {
    render(<FriendsSection friends={[makeFriend()]} />)
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
  })

  it('removes a friend and refreshes on success', async () => {
    const user = userEvent.setup()
    vi.mocked(removeFriend).mockResolvedValue({ data: { success: true } })
    render(<FriendsSection friends={[makeFriend()]} />)

    await user.click(screen.getByRole('button', { name: 'Remove friend' }))

    await vi.waitFor(() => {
      expect(removeFriend).toHaveBeenCalledWith({ friendshipId: 'friendship-1' })
      expect(refreshMock).toHaveBeenCalled()
    })
  })

  it('shows an inline error when removing fails, without refreshing', async () => {
    const user = userEvent.setup()
    vi.mocked(removeFriend).mockResolvedValue({ error: 'boom' })
    render(<FriendsSection friends={[makeFriend()]} />)

    await user.click(screen.getByRole('button', { name: 'Remove friend' }))

    expect(await screen.findByText(ERROR_MESSAGE)).toBeInTheDocument()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('disables the Remove friend button while the action is pending', async () => {
    const user = userEvent.setup()
    let resolveAction: (value: Awaited<ReturnType<typeof removeFriend>>) => void = () => {}
    vi.mocked(removeFriend).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve
        }),
    )
    render(<FriendsSection friends={[makeFriend()]} />)
    const button = screen.getByRole('button', { name: 'Remove friend' })

    await user.click(button)

    await vi.waitFor(() => expect(button).toBeDisabled())

    resolveAction({ data: { success: true } })

    await vi.waitFor(() => expect(button).not.toBeDisabled())
  })
})
