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
  Label: ({ children, ...rest }: React.ComponentProps<'label'>) => (
    <label {...rest}>{children}</label>
  ),
  Switch: ({
    checked,
    onCheckedChange,
    ...rest
  }: {
    checked: boolean
    onCheckedChange: (checked: boolean) => void
  } & React.ComponentProps<'input'>) => (
    <input
      type="checkbox"
      role="switch"
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      {...rest}
    />
  ),
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

function statusSelect(): HTMLSelectElement {
  return screen.getByRole('option', { name: 'All statuses' }).closest('select') as HTMLSelectElement
}

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

  it('replaces ?type= when the type select changes', () => {
    render(<ActivityFilters />)
    fireEvent.change(typeSelect(), { target: { value: 'goal' } })
    expect(replaceMock).toHaveBeenCalledWith('/activities?type=goal')
  })

  it('replaces ?status= when the status select changes', () => {
    render(<ActivityFilters />)
    fireEvent.change(statusSelect(), { target: { value: 'in_progress' } })
    expect(replaceMock).toHaveBeenCalledWith('/activities?status=in_progress')
  })

  it('replaces ?recurring=1 when the recurring toggle is switched on', () => {
    render(<ActivityFilters />)
    fireEvent.click(screen.getByRole('switch'))
    expect(replaceMock).toHaveBeenCalledWith('/activities?recurring=1')
  })

  it('removes the recurring param when the toggle is switched off', () => {
    currentParams = new URLSearchParams('recurring=1')
    render(<ActivityFilters />)
    fireEvent.click(screen.getByRole('switch'))
    expect(replaceMock).toHaveBeenCalledWith('/activities')
  })

  it('preserves existing params when changing one control', () => {
    currentParams = new URLSearchParams('q=foo')
    render(<ActivityFilters />)
    fireEvent.change(typeSelect(), { target: { value: 'goal' } })
    expect(replaceMock).toHaveBeenCalledWith('/activities?q=foo&type=goal')
  })

  it('reflects the current params in each control', () => {
    currentParams = new URLSearchParams('type=goal&status=completed&q=bar&recurring=1')
    render(<ActivityFilters />)
    expect(typeSelect().value).toBe('goal')
    expect(statusSelect().value).toBe('completed')
    expect(searchInput().value).toBe('bar')
    expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(true)
  })

  it('selecting the "all" option removes the type param', () => {
    currentParams = new URLSearchParams('type=goal')
    render(<ActivityFilters />)
    fireEvent.change(typeSelect(), { target: { value: 'all' } })
    expect(replaceMock).toHaveBeenCalledWith('/activities')
  })
})
