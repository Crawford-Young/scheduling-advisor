import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { FriendButton } from './friend-button'
import {
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  removeFriend,
} from '@/server/actions/friends'

const refreshMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

vi.mock('@/server/actions/friends', () => ({
  sendFriendRequest: vi.fn(),
  acceptFriendRequest: vi.fn(),
  declineFriendRequest: vi.fn(),
  cancelFriendRequest: vi.fn(),
  removeFriend: vi.fn(),
}))

const PROFILE_USER_ID = 'user-2'
const FRIENDSHIP_ID = 'friendship-1'
const ERROR_MESSAGE = 'Something went wrong. Try again.'

describe('FriendButton', () => {
  beforeEach(() => {
    refreshMock.mockClear()
    vi.mocked(sendFriendRequest).mockReset()
    vi.mocked(acceptFriendRequest).mockReset()
    vi.mocked(declineFriendRequest).mockReset()
    vi.mocked(cancelFriendRequest).mockReset()
    vi.mocked(removeFriend).mockReset()
  })

  describe('view: none', () => {
    it('renders an "Add friend" button', () => {
      render(<FriendButton profileUserId={PROFILE_USER_ID} view="none" friendshipId={null} />)
      expect(screen.getByRole('button', { name: 'Add friend' })).toBeInTheDocument()
    })

    it('sends a friend request and refreshes on success', async () => {
      const user = userEvent.setup()
      vi.mocked(sendFriendRequest).mockResolvedValue({ data: {} as never })
      render(<FriendButton profileUserId={PROFILE_USER_ID} view="none" friendshipId={null} />)

      await user.click(screen.getByRole('button', { name: 'Add friend' }))

      await vi.waitFor(() => {
        expect(sendFriendRequest).toHaveBeenCalledWith({ addresseeId: PROFILE_USER_ID })
        expect(refreshMock).toHaveBeenCalled()
      })
    })

    it('renders the error message when the action fails', async () => {
      const user = userEvent.setup()
      vi.mocked(sendFriendRequest).mockResolvedValue({ error: 'boom' })
      render(<FriendButton profileUserId={PROFILE_USER_ID} view="none" friendshipId={null} />)

      await user.click(screen.getByRole('button', { name: 'Add friend' }))

      expect(await screen.findByText(ERROR_MESSAGE)).toBeInTheDocument()
      expect(refreshMock).not.toHaveBeenCalled()
    })

    it('clears a previous error on the next attempt', async () => {
      const user = userEvent.setup()
      vi.mocked(sendFriendRequest).mockResolvedValueOnce({ error: 'boom' })
      render(<FriendButton profileUserId={PROFILE_USER_ID} view="none" friendshipId={null} />)

      await user.click(screen.getByRole('button', { name: 'Add friend' }))
      expect(await screen.findByText(ERROR_MESSAGE)).toBeInTheDocument()

      vi.mocked(sendFriendRequest).mockResolvedValueOnce({ data: {} as never })
      await user.click(screen.getByRole('button', { name: 'Add friend' }))

      await vi.waitFor(() => {
        expect(screen.queryByText(ERROR_MESSAGE)).not.toBeInTheDocument()
      })
    })

    it('disables the button while the action is pending', async () => {
      const user = userEvent.setup()
      let resolveAction: (value: Awaited<ReturnType<typeof sendFriendRequest>>) => void = () => {}
      vi.mocked(sendFriendRequest).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveAction = resolve
          }),
      )
      render(<FriendButton profileUserId={PROFILE_USER_ID} view="none" friendshipId={null} />)
      const button = screen.getByRole('button', { name: 'Add friend' })

      await user.click(button)

      await vi.waitFor(() => expect(button).toBeDisabled())

      resolveAction({ data: {} as never })

      await vi.waitFor(() => expect(button).not.toBeDisabled())
    })
  })

  describe('view: outgoing', () => {
    it('renders a "Requested" outline button', () => {
      render(
        <FriendButton
          profileUserId={PROFILE_USER_ID}
          view="outgoing"
          friendshipId={FRIENDSHIP_ID}
        />,
      )
      expect(screen.getByRole('button', { name: 'Requested' })).toBeInTheDocument()
    })

    it('cancels the request on click', async () => {
      const user = userEvent.setup()
      vi.mocked(cancelFriendRequest).mockResolvedValue({ data: { success: true } })
      render(
        <FriendButton
          profileUserId={PROFILE_USER_ID}
          view="outgoing"
          friendshipId={FRIENDSHIP_ID}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Requested' }))

      await vi.waitFor(() => {
        expect(cancelFriendRequest).toHaveBeenCalledWith({ friendshipId: FRIENDSHIP_ID })
        expect(refreshMock).toHaveBeenCalled()
      })
    })

    it('does not call cancelFriendRequest when friendshipId is null', async () => {
      const user = userEvent.setup()
      render(<FriendButton profileUserId={PROFILE_USER_ID} view="outgoing" friendshipId={null} />)

      await user.click(screen.getByRole('button', { name: 'Requested' }))

      expect(cancelFriendRequest).not.toHaveBeenCalled()
    })
  })

  describe('view: incoming', () => {
    it('renders Accept and Decline buttons', () => {
      render(
        <FriendButton
          profileUserId={PROFILE_USER_ID}
          view="incoming"
          friendshipId={FRIENDSHIP_ID}
        />,
      )
      expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument()
    })

    it('accepts the request on click', async () => {
      const user = userEvent.setup()
      vi.mocked(acceptFriendRequest).mockResolvedValue({ data: {} as never })
      render(
        <FriendButton
          profileUserId={PROFILE_USER_ID}
          view="incoming"
          friendshipId={FRIENDSHIP_ID}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Accept' }))

      await vi.waitFor(() => {
        expect(acceptFriendRequest).toHaveBeenCalledWith({ friendshipId: FRIENDSHIP_ID })
        expect(refreshMock).toHaveBeenCalled()
      })
    })

    it('declines the request on click', async () => {
      const user = userEvent.setup()
      vi.mocked(declineFriendRequest).mockResolvedValue({ data: { success: true } })
      render(
        <FriendButton
          profileUserId={PROFILE_USER_ID}
          view="incoming"
          friendshipId={FRIENDSHIP_ID}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Decline' }))

      await vi.waitFor(() => {
        expect(declineFriendRequest).toHaveBeenCalledWith({ friendshipId: FRIENDSHIP_ID })
        expect(refreshMock).toHaveBeenCalled()
      })
    })

    it('does not call acceptFriendRequest or declineFriendRequest when friendshipId is null', async () => {
      const user = userEvent.setup()
      render(<FriendButton profileUserId={PROFILE_USER_ID} view="incoming" friendshipId={null} />)

      await user.click(screen.getByRole('button', { name: 'Accept' }))
      await user.click(screen.getByRole('button', { name: 'Decline' }))

      expect(acceptFriendRequest).not.toHaveBeenCalled()
      expect(declineFriendRequest).not.toHaveBeenCalled()
    })
  })

  describe('view: friends', () => {
    it('renders a "Friends" trigger button', () => {
      render(
        <FriendButton
          profileUserId={PROFILE_USER_ID}
          view="friends"
          friendshipId={FRIENDSHIP_ID}
        />,
      )
      expect(screen.getByRole('button', { name: 'Friends' })).toBeInTheDocument()
    })

    it('marks the trigger as a menu and shows a caret, so removal is discoverable', () => {
      render(
        <FriendButton
          profileUserId={PROFILE_USER_ID}
          view="friends"
          friendshipId={FRIENDSHIP_ID}
        />,
      )
      const trigger = screen.getByRole('button', { name: 'Friends' })
      expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
      // The label alone states the relationship and reads as an inert status
      // pill; the caret is what tells a user actions live behind it.
      expect(trigger.querySelector('svg')).not.toBeNull()
    })

    it('removes the friendship when "Remove friend" is selected', async () => {
      const user = userEvent.setup()
      vi.mocked(removeFriend).mockResolvedValue({ data: { success: true } })
      render(
        <FriendButton
          profileUserId={PROFILE_USER_ID}
          view="friends"
          friendshipId={FRIENDSHIP_ID}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Friends' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Remove friend' }))

      await vi.waitFor(() => {
        expect(removeFriend).toHaveBeenCalledWith({ friendshipId: FRIENDSHIP_ID })
        expect(refreshMock).toHaveBeenCalled()
      })
    })

    it('does not call removeFriend when friendshipId is null', async () => {
      const user = userEvent.setup()
      render(<FriendButton profileUserId={PROFILE_USER_ID} view="friends" friendshipId={null} />)

      await user.click(screen.getByRole('button', { name: 'Friends' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Remove friend' }))

      expect(removeFriend).not.toHaveBeenCalled()
    })
  })
})
