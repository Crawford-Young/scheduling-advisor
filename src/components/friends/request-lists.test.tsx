import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { IncomingRequestsList, OutgoingRequestsList } from './request-lists'
import {
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
} from '@/server/actions/friends'

const refreshMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

vi.mock('@/server/actions/friends', () => ({
  acceptFriendRequest: vi.fn(),
  declineFriendRequest: vi.fn(),
  cancelFriendRequest: vi.fn(),
}))

const ERROR_MESSAGE = 'Something went wrong. Try again.'
const NO_MATCHES = 'No matches.'

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    friendshipId: 'friendship-1',
    userId: 'user-1',
    username: 'ada',
    name: 'Ada Lovelace',
    image: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
}

describe('IncomingRequestsList', () => {
  beforeEach(() => {
    refreshMock.mockClear()
    vi.mocked(acceptFriendRequest).mockReset()
    vi.mocked(declineFriendRequest).mockReset()
  })

  it('renders the "No incoming requests." empty state when requests is empty and not filtered', () => {
    render(<IncomingRequestsList requests={[]} isFiltered={false} />)
    expect(screen.getByText('No incoming requests.')).toBeInTheDocument()
  })

  it('renders the "No matches." empty state when requests is empty and filtered', () => {
    render(<IncomingRequestsList requests={[]} isFiltered={true} />)
    expect(screen.getByText(NO_MATCHES)).toBeInTheDocument()
  })

  it('renders an incoming request row with the requester name', () => {
    render(<IncomingRequestsList requests={[makeRequest()]} isFiltered={false} />)
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
  })

  it('renders rows inside a divide-y container', () => {
    const { container } = render(
      <IncomingRequestsList requests={[makeRequest()]} isFiltered={false} />,
    )
    expect(container.querySelector('.divide-y')).not.toBeNull()
  })

  it('accepts an incoming request and refreshes on success', async () => {
    const user = userEvent.setup()
    vi.mocked(acceptFriendRequest).mockResolvedValue({ data: {} as never })
    render(<IncomingRequestsList requests={[makeRequest()]} isFiltered={false} />)

    await user.click(screen.getByRole('button', { name: 'Accept' }))

    await vi.waitFor(() => {
      expect(acceptFriendRequest).toHaveBeenCalledWith({ friendshipId: 'friendship-1' })
      expect(refreshMock).toHaveBeenCalled()
    })
  })

  it('declines an incoming request and refreshes on success', async () => {
    const user = userEvent.setup()
    vi.mocked(declineFriendRequest).mockResolvedValue({ data: { success: true } })
    render(<IncomingRequestsList requests={[makeRequest()]} isFiltered={false} />)

    await user.click(screen.getByRole('button', { name: 'Decline' }))

    await vi.waitFor(() => {
      expect(declineFriendRequest).toHaveBeenCalledWith({ friendshipId: 'friendship-1' })
      expect(refreshMock).toHaveBeenCalled()
    })
  })

  it('shows an inline error when accepting fails, without refreshing', async () => {
    const user = userEvent.setup()
    vi.mocked(acceptFriendRequest).mockResolvedValue({ error: 'boom' })
    render(<IncomingRequestsList requests={[makeRequest()]} isFiltered={false} />)

    await user.click(screen.getByRole('button', { name: 'Accept' }))

    expect(await screen.findByText(ERROR_MESSAGE)).toBeInTheDocument()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('disables Accept/Decline while the action is pending', async () => {
    const user = userEvent.setup()
    let resolveAction: (value: Awaited<ReturnType<typeof acceptFriendRequest>>) => void = () => {}
    vi.mocked(acceptFriendRequest).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve
        }),
    )
    render(<IncomingRequestsList requests={[makeRequest()]} isFiltered={false} />)
    const acceptButton = screen.getByRole('button', { name: 'Accept' })

    await user.click(acceptButton)

    await vi.waitFor(() => expect(acceptButton).toBeDisabled())

    resolveAction({ data: {} as never })

    await vi.waitFor(() => expect(acceptButton).not.toBeDisabled())
  })
})

describe('OutgoingRequestsList', () => {
  beforeEach(() => {
    refreshMock.mockClear()
    vi.mocked(cancelFriendRequest).mockReset()
  })

  it('renders the "No sent requests." empty state when requests is empty and not filtered', () => {
    render(<OutgoingRequestsList requests={[]} isFiltered={false} />)
    expect(screen.getByText('No sent requests.')).toBeInTheDocument()
  })

  it('renders the "No matches." empty state when requests is empty and filtered', () => {
    render(<OutgoingRequestsList requests={[]} isFiltered={true} />)
    expect(screen.getByText(NO_MATCHES)).toBeInTheDocument()
  })

  it('renders an outgoing request row with the addressee name', () => {
    render(
      <OutgoingRequestsList requests={[makeRequest({ name: 'Bob Marley' })]} isFiltered={false} />,
    )
    expect(screen.getByText('Bob Marley')).toBeInTheDocument()
  })

  it('renders rows inside a divide-y container', () => {
    const { container } = render(
      <OutgoingRequestsList requests={[makeRequest()]} isFiltered={false} />,
    )
    expect(container.querySelector('.divide-y')).not.toBeNull()
  })

  it('cancels an outgoing request and refreshes on success', async () => {
    const user = userEvent.setup()
    vi.mocked(cancelFriendRequest).mockResolvedValue({ data: { success: true } })
    render(<OutgoingRequestsList requests={[makeRequest()]} isFiltered={false} />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await vi.waitFor(() => {
      expect(cancelFriendRequest).toHaveBeenCalledWith({ friendshipId: 'friendship-1' })
      expect(refreshMock).toHaveBeenCalled()
    })
  })

  it('shows an inline error when cancelling fails, without refreshing', async () => {
    const user = userEvent.setup()
    vi.mocked(cancelFriendRequest).mockResolvedValue({ error: 'boom' })
    render(<OutgoingRequestsList requests={[makeRequest()]} isFiltered={false} />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(await screen.findByText(ERROR_MESSAGE)).toBeInTheDocument()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('disables Cancel while the action is pending', async () => {
    const user = userEvent.setup()
    let resolveAction: (value: Awaited<ReturnType<typeof cancelFriendRequest>>) => void = () => {}
    vi.mocked(cancelFriendRequest).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve
        }),
    )
    render(<OutgoingRequestsList requests={[makeRequest()]} isFiltered={false} />)
    const cancelButton = screen.getByRole('button', { name: 'Cancel' })

    await user.click(cancelButton)

    await vi.waitFor(() => expect(cancelButton).toBeDisabled())

    resolveAction({ data: { success: true } })

    await vi.waitFor(() => expect(cancelButton).not.toBeDisabled())
  })
})
