import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ConversationFilters } from './conversation-filters'

const replaceMock = vi.fn()
let currentParams = new URLSearchParams()

const DEBOUNCE_MS = 300

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/reflections',
  useSearchParams: () => currentParams,
}))

vi.mock('@/lib/ui', () => ({
  Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange: (value: string) => void
    children: React.ReactNode
  }) => (
    <select value={value} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}))

function typeSelect(): HTMLSelectElement {
  return screen.getByRole('option', { name: 'All types' }).closest('select') as HTMLSelectElement
}

function searchInput(): HTMLInputElement {
  return screen.getByRole('textbox') as HTMLInputElement
}

describe('ConversationFilters', () => {
  beforeEach(() => {
    replaceMock.mockClear()
    currentParams = new URLSearchParams()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces the search input and replaces ?q= once after the delay', () => {
    vi.useFakeTimers()
    render(<ConversationFilters />)
    fireEvent.change(searchInput(), { target: { value: 'hello' } })
    expect(searchInput().value).toBe('hello')
    expect(replaceMock).not.toHaveBeenCalled()

    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(replaceMock).toHaveBeenCalledTimes(1)
    expect(replaceMock).toHaveBeenCalledWith('/reflections?q=hello')
  })

  it('coalesces rapid keystrokes into a single debounced replace', () => {
    vi.useFakeTimers()
    render(<ConversationFilters />)
    fireEvent.change(searchInput(), { target: { value: 'a' } })
    fireEvent.change(searchInput(), { target: { value: 'ab' } })
    fireEvent.change(searchInput(), { target: { value: 'abc' } })

    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(replaceMock).toHaveBeenCalledTimes(1)
    expect(replaceMock).toHaveBeenCalledWith('/reflections?q=abc')
  })

  it('debounced clear removes the q param', () => {
    vi.useFakeTimers()
    currentParams = new URLSearchParams('q=foo')
    render(<ConversationFilters />)
    fireEvent.change(searchInput(), { target: { value: '' } })

    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(replaceMock).toHaveBeenCalledWith('/reflections')
  })

  it('does not fire the debounced replace if unmounted before the delay', () => {
    vi.useFakeTimers()
    const { unmount } = render(<ConversationFilters />)
    fireEvent.change(searchInput(), { target: { value: 'hello' } })
    unmount()

    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('unmounts cleanly when no search timer is pending', () => {
    vi.useFakeTimers()
    const { unmount } = render(<ConversationFilters />)
    unmount()

    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('replaces ?type= when the type select changes', () => {
    render(<ConversationFilters />)
    fireEvent.change(typeSelect(), { target: { value: 'check_in' } })
    expect(replaceMock).toHaveBeenCalledWith('/reflections?type=check_in')
  })

  it('replaces ?type=general when the general option is chosen', () => {
    render(<ConversationFilters />)
    fireEvent.change(typeSelect(), { target: { value: 'general' } })
    expect(replaceMock).toHaveBeenCalledWith('/reflections?type=general')
  })

  it('preserves existing params when changing one control', () => {
    currentParams = new URLSearchParams('q=foo')
    render(<ConversationFilters />)
    fireEvent.change(typeSelect(), { target: { value: 'general' } })
    expect(replaceMock).toHaveBeenCalledWith('/reflections?q=foo&type=general')
  })

  it('reflects the current params in each control', () => {
    currentParams = new URLSearchParams('type=check_in&q=bar')
    render(<ConversationFilters />)
    expect(typeSelect().value).toBe('check_in')
    expect(searchInput().value).toBe('bar')
  })

  it('selecting the "all" option removes the type param', () => {
    currentParams = new URLSearchParams('type=check_in')
    render(<ConversationFilters />)
    fireEvent.change(typeSelect(), { target: { value: 'all' } })
    expect(replaceMock).toHaveBeenCalledWith('/reflections')
  })
})
