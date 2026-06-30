import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ActivityFilters } from './activity-filters'

const pushMock = vi.fn()
let currentParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
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

describe('ActivityFilters', () => {
  beforeEach(() => {
    pushMock.mockClear()
    currentParams = new URLSearchParams()
  })

  it('pushes ?q= when the search input changes', () => {
    render(<ActivityFilters />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } })
    expect(pushMock).toHaveBeenCalledWith('/activities?q=hello')
  })

  it('clearing the search input removes the q param', () => {
    currentParams = new URLSearchParams('q=foo')
    render(<ActivityFilters />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } })
    expect(pushMock).toHaveBeenCalledWith('/activities')
  })

  it('pushes ?type= when the type select changes', () => {
    render(<ActivityFilters />)
    fireEvent.change(typeSelect(), { target: { value: 'goal' } })
    expect(pushMock).toHaveBeenCalledWith('/activities?type=goal')
  })

  it('pushes ?status= when the status select changes', () => {
    render(<ActivityFilters />)
    fireEvent.change(statusSelect(), { target: { value: 'in_progress' } })
    expect(pushMock).toHaveBeenCalledWith('/activities?status=in_progress')
  })

  it('pushes ?recurring=1 when the recurring toggle is switched on', () => {
    render(<ActivityFilters />)
    fireEvent.click(screen.getByRole('switch'))
    expect(pushMock).toHaveBeenCalledWith('/activities?recurring=1')
  })

  it('removes the recurring param when the toggle is switched off', () => {
    currentParams = new URLSearchParams('recurring=1')
    render(<ActivityFilters />)
    fireEvent.click(screen.getByRole('switch'))
    expect(pushMock).toHaveBeenCalledWith('/activities')
  })

  it('preserves existing params when changing one control', () => {
    currentParams = new URLSearchParams('q=foo')
    render(<ActivityFilters />)
    fireEvent.change(typeSelect(), { target: { value: 'goal' } })
    expect(pushMock).toHaveBeenCalledWith('/activities?q=foo&type=goal')
  })

  it('reflects the current params in each control', () => {
    currentParams = new URLSearchParams('type=goal&status=completed&q=bar&recurring=1')
    render(<ActivityFilters />)
    expect(typeSelect().value).toBe('goal')
    expect(statusSelect().value).toBe('completed')
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('bar')
    expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(true)
  })

  it('selecting the "all" option removes the type param', () => {
    currentParams = new URLSearchParams('type=goal')
    render(<ActivityFilters />)
    fireEvent.change(typeSelect(), { target: { value: 'all' } })
    expect(pushMock).toHaveBeenCalledWith('/activities')
  })
})
