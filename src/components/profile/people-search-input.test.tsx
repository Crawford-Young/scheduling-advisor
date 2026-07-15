import * as React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { PeopleSearchInput } from './people-search-input'

const replaceMock = vi.fn()
let currentParams = new URLSearchParams()

const DEBOUNCE_MS = 300

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/feed',
  useSearchParams: () => currentParams,
}))

vi.mock('@/lib/ui', () => ({
  Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
}))

function searchInput(): HTMLInputElement {
  return screen.getByRole('textbox') as HTMLInputElement
}

describe('PeopleSearchInput', () => {
  beforeEach(() => {
    replaceMock.mockClear()
    currentParams = new URLSearchParams()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('seeds the input with the current ?q= value', () => {
    currentParams = new URLSearchParams('q=ada')
    render(<PeopleSearchInput />)

    expect(searchInput().value).toBe('ada')
  })

  it('debounces typing and replaces ?q= once after the delay, with scroll: false', () => {
    vi.useFakeTimers()
    render(<PeopleSearchInput />)
    fireEvent.change(searchInput(), { target: { value: 'ada' } })
    expect(searchInput().value).toBe('ada')
    expect(replaceMock).not.toHaveBeenCalled()

    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(replaceMock).toHaveBeenCalledTimes(1)
    expect(replaceMock).toHaveBeenCalledWith('/feed?q=ada', { scroll: false })
  })

  it('coalesces rapid keystrokes into a single debounced replace', () => {
    vi.useFakeTimers()
    render(<PeopleSearchInput />)
    fireEvent.change(searchInput(), { target: { value: 'a' } })
    fireEvent.change(searchInput(), { target: { value: 'ad' } })
    fireEvent.change(searchInput(), { target: { value: 'ada' } })

    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(replaceMock).toHaveBeenCalledTimes(1)
    expect(replaceMock).toHaveBeenCalledWith('/feed?q=ada', { scroll: false })
  })

  it('removes the q param when the input is cleared', () => {
    vi.useFakeTimers()
    currentParams = new URLSearchParams('q=ada')
    render(<PeopleSearchInput />)
    fireEvent.change(searchInput(), { target: { value: '' } })

    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(replaceMock).toHaveBeenCalledWith('/feed', { scroll: false })
  })

  it('preserves an unrelated existing param', () => {
    vi.useFakeTimers()
    currentParams = new URLSearchParams('foo=bar')
    render(<PeopleSearchInput />)
    fireEvent.change(searchInput(), { target: { value: 'ada' } })

    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(replaceMock).toHaveBeenCalledWith('/feed?foo=bar&q=ada', { scroll: false })
  })

  it('does not fire the debounced replace if unmounted before the delay', () => {
    vi.useFakeTimers()
    const { unmount } = render(<PeopleSearchInput />)
    fireEvent.change(searchInput(), { target: { value: 'ada' } })
    unmount()

    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('unmounts cleanly when no search timer is pending', () => {
    vi.useFakeTimers()
    const { unmount } = render(<PeopleSearchInput />)
    unmount()

    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(replaceMock).not.toHaveBeenCalled()
  })
})
