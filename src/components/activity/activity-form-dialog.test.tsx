import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ActivityFormDialog } from './activity-form-dialog'

// Context used by the RadioGroup mock so each group instance is isolated.
// Each RadioGroup provides its own context scope; RadioGroupItems read from
// the nearest ancestor RadioGroup — exactly like the real Radix primitive.
const RadioGroupContext = React.createContext<{
  value: string
  onChange?: (v: string) => void
}>({ value: '' })

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
  // Each RadioGroup provides its own context scope so multiple groups can
  // coexist in the same render without trampling each other's state.
  RadioGroup: ({
    value,
    onValueChange,
    children,
  }: {
    value?: string
    onValueChange?: (v: string) => void
    children?: React.ReactNode
  }) => (
    <RadioGroupContext.Provider value={{ value: value ?? '', onChange: onValueChange }}>
      <div role="radiogroup">{children}</div>
    </RadioGroupContext.Provider>
  ),
  RadioGroupItem: ({ value, id }: { value: string; id?: string }) => {
    const ctx = React.useContext(RadioGroupContext)
    return (
      <input
        type="radio"
        id={id}
        value={value}
        checked={ctx.value === value}
        onChange={() => ctx.onChange?.(value)}
      />
    )
  },

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
  it('renders a DialogDescription for a11y (create or edit text)', () => {
    render(<ActivityFormDialog open onOpenChange={() => {}} onSubmit={() => {}} />)
    expect(screen.getByText(/create or edit/i)).toBeInTheDocument()
  })

  it('shows a task|goal radio picker with task selected by default', () => {
    render(<ActivityFormDialog open onOpenChange={() => {}} onSubmit={() => {}} />)
    // Type picker + social radiogroup → at least 2 present
    expect(screen.getAllByRole('radiogroup').length).toBeGreaterThanOrEqual(2)
    // Type picker radios: task selected, goal not
    expect((screen.getByLabelText('Task') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Goal') as HTMLInputElement).checked).toBe(false)
  })

  it('hides the type picker when lockType is true, leaving only social radiogroup', () => {
    render(
      <ActivityFormDialog
        open
        onOpenChange={() => {}}
        onSubmit={() => {}}
        lockType
        initialType="goal"
      />,
    )
    // Only the social activityType radiogroup remains (type picker is hidden)
    expect(screen.getAllByRole('radiogroup')).toHaveLength(1)
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

// ═════════════════════════════════════════════════════════════════════════════
// B.3 — Goal field set (DatePicker + date-only targetDate + location + description)
// ═════════════════════════════════════════════════════════════════════════════

describe('B.3 — goal field set', () => {
  it('shows DatePicker and hides TaskTimeFields when type is goal', async () => {
    const user = userEvent.setup()
    render(<ActivityFormDialog open onOpenChange={() => {}} onSubmit={() => {}} />)
    await user.click(screen.getByLabelText('Goal'))
    expect(screen.getByTestId('date-picker')).toBeInTheDocument()
    expect(screen.queryByTestId('task-time-fields')).not.toBeInTheDocument()
  })

  it('goal submit emits targetDate as date-only YYYY-MM-DD', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ActivityFormDialog open onOpenChange={() => {}} onSubmit={onSubmit} />)
    await user.click(screen.getByLabelText('Goal'))
    await user.type(screen.getByPlaceholderText(/activity title/i), 'Run a marathon')
    // DatePicker mock fires onValueChange with new Date('2026-09-15T12:00:00') when clicked
    await user.click(screen.getByTestId('date-picker'))
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'goal',
        title: 'Run a marathon',
        targetDate: '2026-09-15',
      }),
    )
  })

  it('renders location and description fields for goal type', async () => {
    const user = userEvent.setup()
    render(<ActivityFormDialog open onOpenChange={() => {}} onSubmit={() => {}} />)
    await user.click(screen.getByLabelText('Goal'))
    expect(screen.getByPlaceholderText(/location/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/description/i)).toBeInTheDocument()
  })

  it('save is disabled when goal type has no targetDate selected', async () => {
    const user = userEvent.setup()
    render(<ActivityFormDialog open onOpenChange={() => {}} onSubmit={() => {}} />)
    await user.click(screen.getByLabelText('Goal'))
    await user.type(screen.getByPlaceholderText(/activity title/i), 'Run a marathon')
    // No date selected yet
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// B.4 — Social section + submit payload assembly
// ═════════════════════════════════════════════════════════════════════════════

describe('B.4 — social section + submit payload assembly', () => {
  it('renders social activityType radio group alongside the type picker for task', () => {
    render(<ActivityFormDialog open onOpenChange={() => {}} onSubmit={() => {}} />)
    // Type picker + social → two radio groups
    expect(screen.getAllByRole('radiogroup')).toHaveLength(2)
    expect(screen.getByLabelText('Solo')).toBeInTheDocument()
  })

  it('renders social activityType radio group for goal type', async () => {
    const user = userEvent.setup()
    render(<ActivityFormDialog open onOpenChange={() => {}} onSubmit={() => {}} />)
    await user.click(screen.getByLabelText('Goal'))
    expect(screen.getByLabelText('Solo')).toBeInTheDocument()
  })

  it('task submit payload includes default solo social values', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ActivityFormDialog
        open
        onOpenChange={() => {}}
        onSubmit={onSubmit}
        initialValues={{
          startAt: '2026-09-15T09:00:00.000Z',
          endAt: '2026-09-15T10:00:00.000Z',
        }}
      />,
    )
    await user.type(screen.getByPlaceholderText(/activity title/i), 'Morning run')
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        social: { activityType: 'solo', visibility: 'only_me' },
      }),
    )
  })

  it('goal submit payload includes default solo social values', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ActivityFormDialog open onOpenChange={() => {}} onSubmit={onSubmit} />)
    await user.click(screen.getByLabelText('Goal'))
    await user.type(screen.getByPlaceholderText(/activity title/i), 'Run a marathon')
    await user.click(screen.getByTestId('date-picker'))
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        social: { activityType: 'solo', visibility: 'only_me' },
      }),
    )
  })

  it('shows group-only fields when initialValues.social.activityType is group', () => {
    render(
      <ActivityFormDialog
        open
        onOpenChange={() => {}}
        onSubmit={() => {}}
        initialValues={{
          social: { activityType: 'group', visibility: 'everyone' },
        }}
      />,
    )
    // Joinability Select options visible
    expect(screen.getByRole('option', { name: /^open$/i })).toBeInTheDocument()
    // Max participants Input present
    expect(screen.getByLabelText(/max participants/i)).toBeInTheDocument()
  })
})
