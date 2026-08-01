import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { AddFriendDialog, SEARCH_DEBOUNCE_MS } from './add-friend-dialog'
import type { FriendshipView } from '@/lib/friendship-view'

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }))

const searchUsersGlobalMock = vi.fn()
vi.mock('@/server/actions/search', () => ({
  searchUsersGlobal: (input: unknown) => searchUsersGlobalMock(input),
}))

const sendFriendRequestMock = vi.fn()
vi.mock('@/server/actions/friends', () => ({
  sendFriendRequest: (input: unknown) => sendFriendRequestMock(input),
}))

const RESULTS = [
  { id: 'user-dana', username: 'dana', name: 'Dana Reyes', image: null },
  { id: 'user-sam', username: 'sam', name: 'Sam Ortiz', image: null },
]

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.useFakeTimers()
  searchUsersGlobalMock.mockResolvedValue({ data: RESULTS })
  sendFriendRequestMock.mockResolvedValue({ data: { friendshipId: 'f-new' } })
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

function renderDialog(relations: ReadonlyMap<string, FriendshipView> = new Map()): void {
  render(<AddFriendDialog open onOpenChange={vi.fn()} relations={relations} />)
}

function getSearchInput(): HTMLElement {
  return screen.getByRole('searchbox', { name: 'Search people' })
}

async function typeQuery(text: string): Promise<void> {
  fireEvent.input(getSearchInput(), { target: { value: text } })
  await act(async () => {
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS)
  })
}

describe('AddFriendDialog', () => {
  it('renders a dialog titled Add friend with a search hint and no premature search', () => {
    renderDialog()
    expect(screen.getByRole('dialog', { name: 'Add friend' })).toBeInTheDocument()
    expect(getSearchInput()).toBeInTheDocument()
    expect(screen.getByText('Search for people by name or @username.')).toBeInTheDocument()
    expect(searchUsersGlobalMock).not.toHaveBeenCalled()
  })

  it('does not search below the minimum query length', async () => {
    renderDialog()
    await typeQuery('d')
    expect(searchUsersGlobalMock).not.toHaveBeenCalled()
  })

  it('debounces and searches with the typed query and server-side self-exclusion', async () => {
    renderDialog()
    fireEvent.input(getSearchInput(), { target: { value: 'dana' } })
    expect(searchUsersGlobalMock).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS)
    })
    expect(searchUsersGlobalMock).toHaveBeenCalledWith({ query: 'dana', excludeSelf: true })
  })

  it('renders result rows with name and @username and an Add button', async () => {
    renderDialog()
    await typeQuery('da')
    expect(screen.getByText('Dana Reyes')).toBeInTheDocument()
    expect(screen.getByText('@dana')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add' })).toHaveLength(2)
  })

  it('shows relationship status instead of Add for existing friends and pending pairs', async () => {
    renderDialog(
      new Map<string, FriendshipView>([
        ['user-dana', 'friends'],
        ['user-sam', 'outgoing'],
      ]),
    )
    await typeQuery('da')
    expect(screen.getByText('Friends')).toBeInTheDocument()
    expect(screen.getByText('Requested')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument()
  })

  it('marks a user who already sent the viewer a request', async () => {
    renderDialog(new Map<string, FriendshipView>([['user-dana', 'incoming']]))
    await typeQuery('da')
    expect(screen.getByText('Sent you a request')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add' })).toHaveLength(1)
  })

  it('sends a friend request with the row user id and flips the row to Requested on success', async () => {
    renderDialog()
    await typeQuery('da')

    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0] as HTMLElement)
    await act(async () => {})

    expect(sendFriendRequestMock).toHaveBeenCalledWith({ addresseeId: 'user-dana' })
    expect(refreshMock).toHaveBeenCalled()
    expect(screen.getByText('Requested')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add' })).toHaveLength(1)
  })

  it('disables only the pending row while its send is in flight', async () => {
    const send = deferred<{ data: unknown }>()
    sendFriendRequestMock.mockReturnValueOnce(send.promise)
    renderDialog()
    await typeQuery('da')

    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0] as HTMLElement)
    await act(async () => {})
    expect(screen.getAllByRole('button', { name: 'Add' })[0]).toBeDisabled()
    expect(screen.getAllByRole('button', { name: 'Add' })[1]).not.toBeDisabled()

    await act(async () => {
      send.resolve({ data: { friendshipId: 'f-new' } })
    })
    expect(screen.getByText('Requested')).toBeInTheDocument()
  })

  it('shows an error on the row and keeps the Add button when the send fails', async () => {
    sendFriendRequestMock.mockResolvedValueOnce({ error: 'Too many requests' })
    renderDialog()
    await typeQuery('da')

    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0] as HTMLElement)
    await act(async () => {})

    expect(screen.getByText('Something went wrong. Try again.')).toBeInTheDocument()
    expect(refreshMock).not.toHaveBeenCalled()
    expect(screen.getAllByRole('button', { name: 'Add' })).toHaveLength(2)
  })

  it('shows a searching state while a request is in flight', async () => {
    const search = deferred<{ data: typeof RESULTS }>()
    searchUsersGlobalMock.mockReturnValueOnce(search.promise)
    renderDialog()
    await typeQuery('da')

    expect(screen.getByText('Searching…')).toBeInTheDocument()

    await act(async () => {
      search.resolve({ data: RESULTS })
    })
    expect(screen.queryByText('Searching…')).not.toBeInTheDocument()
  })

  it('shows an empty state when the search returns no users', async () => {
    searchUsersGlobalMock.mockResolvedValueOnce({ data: [] })
    renderDialog()
    await typeQuery('zz')
    expect(screen.getByText('No people found.')).toBeInTheDocument()
  })

  it('discards a stale response that resolves after a newer query', async () => {
    const first = deferred<{ data: typeof RESULTS }>()
    searchUsersGlobalMock.mockReturnValueOnce(first.promise)
    searchUsersGlobalMock.mockResolvedValueOnce({
      data: [{ id: 'user-zoe', username: 'zoe', name: 'Zoe Park', image: null }],
    })
    renderDialog()

    await typeQuery('da')
    await typeQuery('zo')

    await act(async () => {
      first.resolve({ data: RESULTS })
    })

    expect(screen.getByText('Zoe Park')).toBeInTheDocument()
    expect(screen.queryByText('Dana Reyes')).not.toBeInTheDocument()
  })

  it('hides results when the query drops below the minimum length', async () => {
    renderDialog()
    await typeQuery('da')
    expect(screen.getByText('Dana Reyes')).toBeInTheDocument()

    await typeQuery('d')
    expect(screen.queryByText('Dana Reyes')).not.toBeInTheDocument()
    expect(searchUsersGlobalMock).toHaveBeenCalledTimes(1)
  })
})
