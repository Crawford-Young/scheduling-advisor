import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ActivityFilters } from './activity-filters'

const replaceMock = vi.fn()
let currentParams = new URLSearchParams()

const DEBOUNCE_MS = 300

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/activities',
  useSearchParams: () => currentParams,
}))

vi.mock('@/lib/ui', () => ({
  Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
}))

function searchInput(): HTMLInputElement {
  return screen.getByRole('textbox') as HTMLInputElement
}

describe('ActivityFilters', () => {
  beforeEach(() => {
    replaceMock.mockClear()
    currentParams = new URLSearchParams()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces the search input and replaces ?q= once after the delay', () => {
    vi.useFakeTimers()
    render(<ActivityFilters />)
    fireEvent.change(searchInput(), { target: { value: 'hello' } })
    expect(searchInput().value).toBe('hello')
    expect(replaceMock).not.toHaveBeenCalled()

    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(replaceMock).toHaveBeenCalledTimes(1)
    expect(replaceMock).toHaveBeenCalledWith('/activities?q=hello')
  })

  it('coalesces rapid keystrokes into a single debounced replace', () => {
    vi.useFakeTimers()
    render(<ActivityFilters />)
    fireEvent.change(searchInput(), { target: { value: 'a' } })
    fireEvent.change(searchInput(), { target: { value: 'ab' } })
    fireEvent.change(searchInput(), { target: { value: 'abc' } })

    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(replaceMock).toHaveBeenCalledTimes(1)
    expect(replaceMock).toHaveBeenCalledWith('/activities?q=abc')
  })

  it('debounced clear removes the q param', () => {
    vi.useFakeTimers()
    currentParams = new URLSearchParams('q=foo')
    render(<ActivityFilters />)
    fireEvent.change(searchInput(), { target: { value: '' } })

    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(replaceMock).toHaveBeenCalledWith('/activities')
  })

  it('preserves other existing params when updating the search', () => {
    vi.useFakeTimers()
    currentParams = new URLSearchParams('week=2026-07-13')
    render(<ActivityFilters />)
    fireEvent.change(searchInput(), { target: { value: 'gym' } })

    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(replaceMock).toHaveBeenCalledWith('/activities?week=2026-07-13&q=gym')
  })

  it('does not fire the debounced replace if unmounted before the delay', () => {
    vi.useFakeTimers()
    const { unmount } = render(<ActivityFilters />)
    fireEvent.change(searchInput(), { target: { value: 'hello' } })
    unmount()

    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('unmounts cleanly when no search timer is pending', () => {
    vi.useFakeTimers()
    const { unmount } = render(<ActivityFilters />)
    unmount()

    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('reflects the current q param in the input', () => {
    currentParams = new URLSearchParams('q=bar')
    render(<ActivityFilters />)
    expect(searchInput().value).toBe('bar')
  })

  it('no longer renders type, status, or recurring controls', () => {
    render(<ActivityFilters />)
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })
})
