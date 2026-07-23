import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { axe } from 'jest-axe'
import { GlobalSearch } from '@/components/search/global-search'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))

const globalSearchMock = vi.fn()
const searchUsersGlobalMock = vi.fn()
vi.mock('@/server/actions/search', () => ({
  globalSearch: (input: unknown) => globalSearchMock(input),
  searchUsersGlobal: (input: unknown) => searchUsersGlobalMock(input),
}))

const EVENT = {
  id: 'ev-1',
  title: 'Team dinner',
  startAt: new Date(2026, 6, 25, 19, 0),
  location: 'Downtown',
}
const SEARCH_DATA = { events: [EVENT], activities: [{ id: 'act-1', title: 'Dinner prep' }] }
const USERS = [{ username: 'sam', name: 'Sam Lee', image: null }]

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.useFakeTimers()
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
  globalSearchMock.mockResolvedValue({ data: SEARCH_DATA })
  searchUsersGlobalMock.mockResolvedValue({ data: USERS })
})

afterEach(() => {
  vi.useRealTimers() // never call runOnlyPendingTimers here — the axe test runs on real timers and it would throw
  vi.clearAllMocks()
  document.documentElement.className = ''
})

function getInput(): HTMLElement {
  return screen.getByPlaceholderText(/search events/i)
}

// The dropdown opens on focus — the primary open path most tests exercise.
// The dedicated Ctrl+K toggle test below covers the global hotkey separately.
async function openViaFocus(): Promise<void> {
  fireEvent.focus(getInput())
  await act(async () => {})
}

async function typeQuery(text: string): Promise<void> {
  fireEvent.input(getInput(), { target: { value: text } })
  await act(async () => {
    vi.advanceTimersByTime(300)
  })
}

describe('GlobalSearch', () => {
  it('renders a persistent search input with a keyboard hint', () => {
    render(<GlobalSearch username="crawford" />)
    expect(getInput()).toBeInTheDocument()
    expect(screen.getByText('⌘K')).toBeInTheDocument()
    // The dropdown is closed until the input is focused.
    expect(screen.queryByText('Calendar')).not.toBeInTheDocument()
  })

  it('opens the dropdown on focus and shows the pages list at empty query', async () => {
    render(<GlobalSearch username="crawford" />)
    await openViaFocus()
    expect(screen.getByText('Calendar')).toBeInTheDocument()
  })

  it('toggles the dropdown open and closed with Ctrl+K and Meta+K', async () => {
    render(<GlobalSearch username="crawford" />)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    await act(async () => {})
    expect(screen.getByText('Calendar')).toBeInTheDocument()
    expect(getInput()).toHaveFocus()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    await act(async () => {})
    expect(screen.queryByText('Calendar')).not.toBeInTheDocument()
    expect(getInput()).not.toHaveFocus()
  })

  it('closes on Escape and blurs the input', async () => {
    render(<GlobalSearch username="crawford" />)
    await openViaFocus()
    expect(screen.getByText('Calendar')).toBeInTheDocument()
    fireEvent.keyDown(getInput(), { key: 'Escape' })
    await act(async () => {})
    expect(screen.queryByText('Calendar')).not.toBeInTheDocument()
    expect(getInput()).not.toHaveFocus()
  })

  it('closes on an outside pointerdown', async () => {
    render(<GlobalSearch username="crawford" />)
    await openViaFocus()
    expect(screen.getByText('Calendar')).toBeInTheDocument()
    fireEvent.pointerDown(document.body)
    await act(async () => {})
    expect(screen.queryByText('Calendar')).not.toBeInTheDocument()
  })

  it('shows all pages at empty query and filters them from the first character', async () => {
    render(<GlobalSearch username="crawford" />)
    await openViaFocus()
    expect(screen.getByText('Calendar')).toBeInTheDocument()
    expect(screen.getByText('My profile')).toBeInTheDocument()
    fireEvent.input(getInput(), { target: { value: 'c' } })
    await act(async () => {})
    expect(screen.getByText('Calendar')).toBeInTheDocument()
    // Deviation: brief's fixture asserted 'Feed' absent at query 'c', but Feed's own
    // keyword 'social' contains the letter 'c' (real PAGE_INDEX data, out of this
    // task's scope) so it legitimately matches too — 'Home' is the only PAGE_INDEX
    // entry with no 'c' anywhere in its label or keywords, so it's the one that
    // actually demonstrates the filter excluding a non-match.
    expect(screen.queryByText('Home')).not.toBeInTheDocument()
    expect(globalSearchMock).not.toHaveBeenCalled()
  })

  it('omits the My profile entry when username is null', async () => {
    render(<GlobalSearch username={null} />)
    await openViaFocus()
    expect(screen.getByText('Calendar')).toBeInTheDocument()
    expect(screen.queryByText('My profile')).not.toBeInTheDocument()
  })

  it('debounces and fires both actions once at >=2 chars', async () => {
    render(<GlobalSearch username="crawford" />)
    await openViaFocus()
    fireEvent.input(getInput(), { target: { value: 'din' } })
    await act(async () => {
      vi.advanceTimersByTime(299)
    })
    expect(globalSearchMock).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(globalSearchMock).toHaveBeenCalledTimes(1)
    expect(globalSearchMock).toHaveBeenCalledWith({ query: 'din' })
    expect(searchUsersGlobalMock).toHaveBeenCalledWith({ query: 'din' })
  })

  it('renders groups progressively as each action resolves', async () => {
    const users = deferred<{ data: typeof USERS }>()
    searchUsersGlobalMock.mockReturnValue(users.promise)
    render(<GlobalSearch username="crawford" />)
    await openViaFocus()
    await typeQuery('dinner')
    expect(screen.getByText('Team dinner')).toBeInTheDocument()
    expect(screen.getByText('Dinner prep')).toBeInTheDocument()
    expect(screen.queryByText('Sam Lee')).not.toBeInTheDocument()
    await act(async () => {
      users.resolve({ data: USERS })
    })
    expect(screen.getByText('Sam Lee')).toBeInTheDocument()
  })

  it('discards stale responses when a newer query is in flight', async () => {
    const first = deferred<{ data: typeof SEARCH_DATA }>()
    globalSearchMock.mockReturnValueOnce(first.promise)
    render(<GlobalSearch username="crawford" />)
    await openViaFocus()
    await typeQuery('din')
    await typeQuery('lunch meeting')
    await act(async () => {
      first.resolve({
        data: { events: [{ ...EVENT, title: 'STALE EVENT' }], activities: [] },
      })
    })
    expect(screen.queryByText('STALE EVENT')).not.toBeInTheDocument()
  })

  it('navigates to the event week and closes the dropdown on event select', async () => {
    render(<GlobalSearch username="crawford" />)
    await openViaFocus()
    await typeQuery('dinner')
    fireEvent.click(screen.getByText('Team dinner'))
    expect(pushMock).toHaveBeenCalledWith('/calendar?week=2026-07-25')
    expect(screen.queryByText('Team dinner')).not.toBeInTheDocument()
  })

  it('navigates to bare /calendar for an event without startAt', async () => {
    globalSearchMock.mockResolvedValue({
      data: { events: [{ ...EVENT, startAt: null }], activities: [] },
    })
    render(<GlobalSearch username="crawford" />)
    await openViaFocus()
    await typeQuery('dinner')
    fireEvent.click(screen.getByText('Team dinner'))
    expect(pushMock).toHaveBeenCalledWith('/calendar')
  })

  it('navigates with the activity title filter on activity select', async () => {
    render(<GlobalSearch username="crawford" />)
    await openViaFocus()
    await typeQuery('dinner')
    fireEvent.click(screen.getByText('Dinner prep'))
    expect(pushMock).toHaveBeenCalledWith('/activities?q=Dinner%20prep')
  })

  it('navigates to the user profile on user select', async () => {
    render(<GlobalSearch username="crawford" />)
    await openViaFocus()
    await typeQuery('sam')
    // Deviation: the brief's waitFor deadlocks under vi.useFakeTimers() (waitFor's
    // internal polling relies on real timers) — typeQuery's `act` already flushes
    // the resolved-promise state update, so the assertion runs directly.
    expect(screen.getByText('Sam Lee')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Sam Lee'))
    expect(pushMock).toHaveBeenCalledWith('/u/sam')
  })

  it('navigates on page select', async () => {
    render(<GlobalSearch username="crawford" />)
    await openViaFocus()
    fireEvent.click(screen.getByText('Calendar'))
    expect(pushMock).toHaveBeenCalledWith('/calendar')
  })

  it('selects the highlighted item with Enter (cmdk auto-selects the first item)', async () => {
    render(<GlobalSearch username="crawford" />)
    await openViaFocus()
    fireEvent.keyDown(getInput(), { key: 'Enter' })
    expect(pushMock).toHaveBeenCalledWith('/calendar')
  })

  it('moves the selection with ArrowDown before Enter', async () => {
    render(<GlobalSearch username="crawford" />)
    await openViaFocus()
    const input = getInput()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(pushMock).toHaveBeenCalledWith('/activities')
  })

  it('fetches fresh after Escape-close then reopen — no stale results, input reset', async () => {
    render(<GlobalSearch username="crawford" />)
    await openViaFocus()
    await typeQuery('dinner')
    expect(screen.getByText('Team dinner')).toBeInTheDocument()
    fireEvent.keyDown(getInput(), { key: 'Escape' })
    await act(async () => {})
    await openViaFocus()
    expect(screen.queryByText('Team dinner')).not.toBeInTheDocument()
    expect(getInput()).toHaveValue('')
    await typeQuery('dinner')
    expect(globalSearchMock).toHaveBeenCalledTimes(2)
  })

  it('fetches fresh after an outside-click close then reopen — no stale results, input reset', async () => {
    render(<GlobalSearch username="crawford" />)
    await openViaFocus()
    await typeQuery('dinner')
    expect(screen.getByText('Team dinner')).toBeInTheDocument()
    fireEvent.pointerDown(document.body)
    await act(async () => {})
    await openViaFocus()
    expect(screen.queryByText('Team dinner')).not.toBeInTheDocument()
    expect(getInput()).toHaveValue('')
    await typeQuery('dinner')
    expect(globalSearchMock).toHaveBeenCalledTimes(2)
  })

  it('shows the empty state when everything resolves empty and no page matches', async () => {
    globalSearchMock.mockResolvedValue({ data: { events: [], activities: [] } })
    searchUsersGlobalMock.mockResolvedValue({ data: [] })
    render(<GlobalSearch username="crawford" />)
    await openViaFocus()
    await typeQuery('zzzz')
    expect(screen.getByText('No results found.')).toBeInTheDocument()
  })

  it('keeps results absent when an action returns an error shape', async () => {
    globalSearchMock.mockResolvedValue({ error: 'Too many requests' })
    render(<GlobalSearch username="crawford" />)
    await openViaFocus()
    await typeQuery('dinner')
    expect(screen.queryByText('Team dinner')).not.toBeInTheDocument()
  })

  it('has no axe violations with the dropdown open in dark and light themes', async () => {
    vi.useRealTimers()
    render(<GlobalSearch username="crawford" />)
    fireEvent.focus(getInput())
    await screen.findByText('Calendar')
    for (const theme of ['dark', 'light']) {
      document.documentElement.className = theme
      // Deviation: `region` disabled here — confirmed via the installed
      // @crawfordyoung/ui dist (AppShell, index.mjs) that the `topbar` slot
      // renders as a sibling of `<main>`, not inside it or any other landmark
      // (no `<header>`/`role="banner"` wrapper) — a standalone unit render of
      // GlobalSearch (outside AppShell) is real page content contained by no
      // landmark, which is a library-composition fact this component doesn't
      // own, not markup this task introduced. The old Dialog-based version
      // never hit this because Radix's `role="dialog"` content is exempt from
      // the region rule; removing the Dialog surfaced it. The
      // `aria-hidden-focus` disable the old test carried IS removed here —
      // it was there for Radix's Dialog focus guards, which are gone.
      expect(
        await axe(document.body, { rules: { region: { enabled: false } } }),
      ).toHaveNoViolations()
    }
  })

  it('keeps user results absent when the user search action returns an error shape', async () => {
    searchUsersGlobalMock.mockResolvedValue({ error: 'Too many requests' })
    render(<GlobalSearch username="crawford" />)
    await openViaFocus()
    await typeQuery('dinner')
    expect(screen.queryByText('Sam Lee')).not.toBeInTheDocument()
  })

  it('renders an event result without a location suffix when location is null', async () => {
    globalSearchMock.mockResolvedValue({
      data: { events: [{ ...EVENT, location: null }], activities: [] },
    })
    const { container } = render(<GlobalSearch username="crawford" />)
    await openViaFocus()
    await typeQuery('dinner')
    expect(screen.getByText('Team dinner')).toBeInTheDocument()
    expect(container.textContent).not.toContain('·')
  })

  it('shows the username as fallback display text when a user has no name', async () => {
    searchUsersGlobalMock.mockResolvedValue({
      data: [{ username: 'noname', name: null, image: null }],
    })
    render(<GlobalSearch username="crawford" />)
    await openViaFocus()
    await typeQuery('zz')
    expect(screen.getByText('noname')).toBeInTheDocument()
  })
})
