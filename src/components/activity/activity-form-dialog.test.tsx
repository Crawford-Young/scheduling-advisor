import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ActivityFormDialog } from './activity-form-dialog'

// Module-level state for RadioGroup (single instance per render)
let radioGroupValue = ''
let radioGroupOnChange: ((v: string) => void) | undefined

vi.mock('@/lib/ui', () => ({
  // ── Dialog primitives ──────────────────────────────────────────────────────
  Dialog: ({ open, children }: { open?: boolean; children?: React.ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,

  // ── RadioGroup ─────────────────────────────────────────────────────────────
  // Uses module-level state so RadioGroupItem can read the current group value
  RadioGroup: ({
    value,
    onValueChange,
    children,
  }: {
    value?: string
    onValueChange?: (v: string) => void
    children?: React.ReactNode
  }) => {
    radioGroupValue = value ?? ''
    radioGroupOnChange = onValueChange
    return <div role="radiogroup">{children}</div>
  },
  RadioGroupItem: ({ value, id }: { value: string; id?: string }) => (
    <input
      type="radio"
      id={id}
      value={value}
      checked={radioGroupValue === value}
      onChange={() => radioGroupOnChange?.(value)}
    />
  ),

  // ── Select ─────────────────────────────────────────────────────────────────
  // Renders options as visible spans; tests use initialValues to pre-seed state
  // rather than clicking options, so onValueChange wiring is intentionally omitted.
  Select: ({
    children,
  }: {
    value?: string
    onValueChange?: (v: string) => void
    children?: React.ReactNode
  }) => <div>{children}</div>,
  SelectTrigger: () => null,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => (
    <span role="option" data-value={value}>
      {children}
    </span>
  ),
  SelectValue: () => null,
  SelectLabel: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  SelectGroup: ({ children }: { children?: React.ReactNode }) => <>{children}</>,

  // ── Form primitives ────────────────────────────────────────────────────────
  Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
  Label: (props: React.ComponentProps<'label'>) => <label {...props} />,
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
  Textarea: (props: React.ComponentProps<'textarea'>) => <textarea {...props} />,

  // ── Switch ─────────────────────────────────────────────────────────────────
  Switch: ({
    checked,
    onCheckedChange,
    id,
  }: {
    checked?: boolean
    onCheckedChange?: (v: boolean) => void
    id?: string
  }) => (
    <input
      type="checkbox"
      role="switch"
      id={id}
      checked={checked ?? false}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
    />
  ),

  // ── TaskTimeFields ─────────────────────────────────────────────────────────
  // Renders data attributes so tests can assert on passed props
  TaskTimeFields: ({
    date,
    startTime,
    endTime,
    recurrence,
    repeatMin,
    repeatMax,
  }: {
    date?: Date
    startTime?: string
    endTime?: string
    recurrence?: string
    repeatMin?: number
    repeatMax?: number
  }) => (
    <div
      data-testid="task-time-fields"
      data-date={date?.toISOString()}
      data-start={startTime}
      data-end={endTime}
      data-recurrence={recurrence}
      data-repeat-min={repeatMin}
      data-repeat-max={repeatMax}
    />
  ),

  // ── DatePicker ─────────────────────────────────────────────────────────────
  // Clicking the button selects 2026-09-15 (local noon to avoid timezone off-by-one)
  DatePicker: ({
    value,
    onValueChange,
  }: {
    value?: Date
    onValueChange?: (d: Date | undefined) => void
  }) => (
    <button
      type="button"
      data-testid="date-picker"
      onClick={() => onValueChange?.(new Date('2026-09-15T12:00:00'))}
    >
      {value
        ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
        : 'pick-date'}
    </button>
  ),

  // ── Utilities ──────────────────────────────────────────────────────────────
  buildIso: (d: Date, time: string) => `${d.toISOString().split('T')[0]}T${time}:00.000Z`,
  toTimeSlot: (iso: string) => iso.substring(11, 16),
}))

// ═════════════════════════════════════════════════════════════════════════════
// B.1 — Skeleton + type picker + DialogDescription
// ═════════════════════════════════════════════════════════════════════════════

describe('B.1 — skeleton + type picker', () => {
  beforeEach(() => {
    radioGroupValue = ''
    radioGroupOnChange = undefined
  })

  it('renders a DialogDescription for a11y (create or edit text)', () => {
    render(<ActivityFormDialog open onOpenChange={() => {}} onSubmit={() => {}} />)
    expect(screen.getByText(/create or edit/i)).toBeInTheDocument()
  })

  it('shows a task|goal radio picker with task selected by default', () => {
    render(<ActivityFormDialog open onOpenChange={() => {}} onSubmit={() => {}} />)
    expect(screen.getByRole('radiogroup')).toBeInTheDocument()
    const radios = screen.getAllByRole('radio') as HTMLInputElement[]
    const taskRadio = radios.find((r) => r.value === 'task')
    expect(taskRadio?.checked).toBe(true)
    const goalRadio = radios.find((r) => r.value === 'goal')
    expect(goalRadio?.checked).toBe(false)
  })

  it('hides the type picker when lockType is true', () => {
    render(
      <ActivityFormDialog
        open
        onOpenChange={() => {}}
        onSubmit={() => {}}
        lockType
        initialType="goal"
      />,
    )
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// B.2 — Task field set (time + all-day + recurrence + color + location + description)
// ═════════════════════════════════════════════════════════════════════════════

describe('B.2 — task field set', () => {
  it('renders location Input and description Textarea', () => {
    render(<ActivityFormDialog open onOpenChange={() => {}} onSubmit={() => {}} />)
    expect(screen.getByPlaceholderText(/location/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/description/i)).toBeInTheDocument()
  })

  it('renders color Select options for the task color palette', () => {
    render(<ActivityFormDialog open onOpenChange={() => {}} onSubmit={() => {}} />)
    // At least the Blue option should be visible (SelectItem renders as span[role=option])
    expect(screen.getByRole('option', { name: 'Blue' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Violet' })).toBeInTheDocument()
  })

  it('TaskTimeFields is shown by default for task type and receives date/start/end', () => {
    render(
      <ActivityFormDialog
        open
        onOpenChange={() => {}}
        onSubmit={() => {}}
        initialValues={{
          startAt: '2026-09-15T09:00:00.000Z',
          endAt: '2026-09-15T10:00:00.000Z',
        }}
      />,
    )
    const ttf = screen.getByTestId('task-time-fields')
    expect(ttf).toHaveAttribute('data-start', '09:00')
    expect(ttf).toHaveAttribute('data-end', '10:00')
    expect(ttf).toHaveAttribute('data-repeat-min', '2')
    expect(ttf).toHaveAttribute('data-repeat-max', '52')
  })

  it('all-day toggle hides TaskTimeFields', async () => {
    const user = userEvent.setup()
    render(<ActivityFormDialog open onOpenChange={() => {}} onSubmit={() => {}} />)
    // TaskTimeFields present initially (default task, not all-day)
    expect(screen.getByTestId('task-time-fields')).toBeInTheDocument()
    // Click the all-day switch
    await user.click(screen.getByRole('switch'))
    // TaskTimeFields should be gone
    expect(screen.queryByTestId('task-time-fields')).not.toBeInTheDocument()
  })
})
