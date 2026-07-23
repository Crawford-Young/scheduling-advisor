import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ActivityTemplateDialog } from '@/components/forms/activity-template-dialog'
import type {
  ActivityTemplateDialogProps,
  ActivityTemplateValues,
} from '@/components/forms/activity-template-dialog'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProps(
  overrides: Partial<ActivityTemplateDialogProps> = {},
): ActivityTemplateDialogProps {
  return {
    open: true,
    onOpenChange: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  }
}

function getSubmitButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /save|saving/i }) as HTMLButtonElement
}

// ═══════════════════════════════════════════════════════════════════════════════
// Open / close + header
// ═══════════════════════════════════════════════════════════════════════════════

describe('open / close + header', () => {
  it('renders the dialog when open=true', () => {
    render(<ActivityTemplateDialog {...makeProps()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('does not render the dialog when open=false', () => {
    render(<ActivityTemplateDialog {...makeProps({ open: false })} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the "New activity template" heading without initialValues', () => {
    render(<ActivityTemplateDialog {...makeProps()} />)
    expect(screen.getByRole('heading', { name: /new activity template/i })).toBeInTheDocument()
  })

  it('shows the "Edit activity template" heading with initialValues', () => {
    render(<ActivityTemplateDialog {...makeProps({ initialValues: { title: 'Yoga' } })} />)
    expect(screen.getByRole('heading', { name: /edit activity template/i })).toBeInTheDocument()
  })

  it('fires onOpenChange(false) when Cancel is clicked', async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(<ActivityTemplateDialog {...makeProps({ onOpenChange })} />)
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Sections render
// ═══════════════════════════════════════════════════════════════════════════════

describe('sections render', () => {
  it('renders every section control', () => {
    render(<ActivityTemplateDialog {...makeProps()} />)
    expect(screen.getByLabelText('Title')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Color' })).toBeInTheDocument()
    expect(screen.getByLabelText('Description')).toBeInTheDocument()
    expect(screen.getByLabelText('Default location')).toBeInTheDocument()
    expect(screen.getByLabelText('Min duration')).toBeInTheDocument()
    expect(screen.getByLabelText('Max duration')).toBeInTheDocument()
    expect(screen.getByLabelText('Weekly target')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Schedule days' })).toBeInTheDocument()
  })

  it('renders all seven weekday toggle buttons', () => {
    render(<ActivityTemplateDialog {...makeProps()} />)
    for (const day of [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ]) {
      expect(screen.getByRole('button', { name: day })).toBeInTheDocument()
    }
  })

  it('renders no schedule slot rows until a day is toggled on', () => {
    render(<ActivityTemplateDialog {...makeProps()} />)
    expect(screen.queryByLabelText('Monday start hour')).not.toBeInTheDocument()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Schedule builder — day toggle add / remove
// ═══════════════════════════════════════════════════════════════════════════════

describe('schedule builder', () => {
  it('adds a slot row when a day toggle is activated', async () => {
    const user = userEvent.setup()
    render(<ActivityTemplateDialog {...makeProps()} />)
    const monday = screen.getByRole('button', { name: 'Monday' })
    expect(monday).toHaveAttribute('aria-pressed', 'false')

    await user.click(monday)

    expect(monday).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Monday start hour')).toBeInTheDocument()
    expect(screen.getByLabelText('Monday duration')).toBeInTheDocument()
  })

  it('removes the slot row when the day toggle is deactivated', async () => {
    const user = userEvent.setup()
    render(<ActivityTemplateDialog {...makeProps()} />)
    const monday = screen.getByRole('button', { name: 'Monday' })
    await user.click(monday)
    expect(screen.getByLabelText('Monday start hour')).toBeInTheDocument()

    await user.click(monday)

    expect(screen.queryByLabelText('Monday start hour')).not.toBeInTheDocument()
  })

  it('updates a slot start time and emits the new startMinutes', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<ActivityTemplateDialog {...makeProps({ onSubmit })} />)
    await user.type(screen.getByLabelText('Title'), 'Yoga')
    await user.click(screen.getByRole('button', { name: 'Monday' }))

    // Default start is 09:00 (540). Increment hour once → 10:00 (600).
    await user.click(screen.getByLabelText('Increment hour'))
    await user.click(getSubmitButton())

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const values = onSubmit.mock.calls[0]![0] as ActivityTemplateValues
    expect(values.schedule).toEqual([{ day: 1, startMinutes: 600, durationMin: 30 }])
  })

  it('keeps other slots untouched when one slot is edited, sorted by day', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<ActivityTemplateDialog {...makeProps({ onSubmit })} />)
    await user.type(screen.getByLabelText('Title'), 'Yoga')
    // Toggle Wednesday first, then Monday — the schedule must sort to Mon, Wed.
    await user.click(screen.getByRole('button', { name: 'Wednesday' }))
    await user.click(screen.getByRole('button', { name: 'Monday' }))

    fireEvent.change(screen.getByLabelText('Monday duration'), { target: { value: '50' } })
    await user.click(getSubmitButton())

    const values = onSubmit.mock.calls[0]![0] as ActivityTemplateValues
    expect(values.schedule).toEqual([
      { day: 1, startMinutes: 540, durationMin: 50 },
      { day: 3, startMinutes: 540, durationMin: 30 },
    ])
  })

  it('updates a slot duration and emits the new durationMin', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<ActivityTemplateDialog {...makeProps({ onSubmit })} />)
    await user.type(screen.getByLabelText('Title'), 'Yoga')
    await user.click(screen.getByRole('button', { name: 'Monday' }))

    fireEvent.change(screen.getByLabelText('Monday duration'), { target: { value: '45' } })
    await user.click(getSubmitButton())

    const values = onSubmit.mock.calls[0]![0] as ActivityTemplateValues
    expect(values.schedule).toEqual([{ day: 1, startMinutes: 540, durationMin: 45 }])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Validation matrix
// ═══════════════════════════════════════════════════════════════════════════════

describe('validation', () => {
  it('blocks submit and shows an error when the title is empty', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<ActivityTemplateDialog {...makeProps({ onSubmit })} />)

    await user.click(getSubmitButton())

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText(/title is required/i)).toBeInTheDocument()
  })

  it('blocks submit and shows an error when min duration exceeds max', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<ActivityTemplateDialog {...makeProps({ onSubmit })} />)
    await user.type(screen.getByLabelText('Title'), 'Yoga')
    // Default min 15, max 60. Drop max below min.
    fireEvent.change(screen.getByLabelText('Max duration'), { target: { value: '10' } })

    await user.click(getSubmitButton())

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText(/minimum duration must be/i)).toBeInTheDocument()
  })

  it('blocks submit when a slot duration is below the minimum', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <ActivityTemplateDialog
        {...makeProps({
          onSubmit,
          initialValues: {
            title: 'Yoga',
            minDurationMin: 60,
            maxDurationMin: 120,
            schedule: [{ day: 1, startMinutes: 540, durationMin: 30 }],
          },
        })}
      />,
    )

    await user.click(getSubmitButton())

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText(/within the min and max/i)).toBeInTheDocument()
  })

  it('blocks submit when a slot duration exceeds the maximum', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <ActivityTemplateDialog
        {...makeProps({
          onSubmit,
          initialValues: {
            title: 'Yoga',
            minDurationMin: 15,
            maxDurationMin: 60,
            schedule: [{ day: 1, startMinutes: 540, durationMin: 90 }],
          },
        })}
      />,
    )

    await user.click(getSubmitButton())

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText(/within the min and max/i)).toBeInTheDocument()
  })

  it('blocks submit and shows an error when the weekly target is below one', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <ActivityTemplateDialog
        {...makeProps({ onSubmit, initialValues: { title: 'Yoga', weeklyTargetSessions: 0 } })}
      />,
    )

    await user.click(getSubmitButton())

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText(/weekly target must be at least/i)).toBeInTheDocument()
  })

  it('clears the error and submits once the invalid field is fixed', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<ActivityTemplateDialog {...makeProps({ onSubmit })} />)

    // First attempt: empty title → error shown.
    await user.click(getSubmitButton())
    expect(screen.getByText(/title is required/i)).toBeInTheDocument()

    // Fix and resubmit.
    await user.type(screen.getByLabelText('Title'), 'Yoga')
    await user.click(getSubmitButton())

    expect(screen.queryByText(/title is required/i)).not.toBeInTheDocument()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Submit payload shape
// ═══════════════════════════════════════════════════════════════════════════════

describe('submit payload', () => {
  it('emits the exact values shape with defaults and nulls for empty optionals', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<ActivityTemplateDialog {...makeProps({ onSubmit })} />)
    await user.type(screen.getByLabelText('Title'), 'Yoga')
    await user.click(screen.getByRole('button', { name: 'Monday' }))

    await user.click(getSubmitButton())

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Yoga',
      color: null,
      description: null,
      defaultLocation: null,
      minDurationMin: 15,
      maxDurationMin: 60,
      weeklyTargetSessions: 1,
      schedule: [{ day: 1, startMinutes: 540, durationMin: 30 }],
    } satisfies ActivityTemplateValues)
  })

  it('emits filled optional fields and the selected color', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<ActivityTemplateDialog {...makeProps({ onSubmit })} />)
    await user.type(screen.getByLabelText('Title'), 'Yoga')
    await user.type(screen.getByLabelText('Description'), 'Morning flow')
    await user.type(screen.getByLabelText('Default location'), 'Studio')
    await user.click(screen.getByRole('button', { name: 'Color: blue' }))

    await user.click(getSubmitButton())

    const values = onSubmit.mock.calls[0]![0] as ActivityTemplateValues
    expect(values.color).toBe('blue')
    expect(values.description).toBe('Morning flow')
    expect(values.defaultLocation).toBe('Studio')
    expect(values.title).toBe('Yoga')
    expect(values.schedule).toEqual([])
  })

  it('trims whitespace-only optionals to null and trims the title', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<ActivityTemplateDialog {...makeProps({ onSubmit })} />)
    await user.type(screen.getByLabelText('Title'), '  Yoga  ')
    await user.type(screen.getByLabelText('Description'), '   ')

    await user.click(getSubmitButton())

    const values = onSubmit.mock.calls[0]![0] as ActivityTemplateValues
    expect(values.title).toBe('Yoga')
    expect(values.description).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// initialValues seeding
// ═══════════════════════════════════════════════════════════════════════════════

describe('initialValues seeding', () => {
  it('seeds every field from initialValues', () => {
    render(
      <ActivityTemplateDialog
        {...makeProps({
          initialValues: {
            title: 'Running',
            color: 'red',
            description: 'Morning jog',
            defaultLocation: 'Park',
            minDurationMin: 20,
            maxDurationMin: 90,
            weeklyTargetSessions: 3,
            schedule: [{ day: 2, startMinutes: 480, durationMin: 45 }],
          },
        })}
      />,
    )

    expect(screen.getByLabelText('Title')).toHaveValue('Running')
    expect(screen.getByLabelText('Description')).toHaveValue('Morning jog')
    expect(screen.getByLabelText('Default location')).toHaveValue('Park')
    expect(screen.getByLabelText('Min duration')).toHaveValue(20)
    expect(screen.getByLabelText('Max duration')).toHaveValue(90)
    expect(screen.getByLabelText('Weekly target')).toHaveValue(3)
    expect(screen.getByRole('button', { name: 'Color: red' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Tuesday' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Tuesday duration')).toHaveValue(45)
  })

  it('treats a null color in initialValues as the default (no color pressed)', () => {
    render(
      <ActivityTemplateDialog {...makeProps({ initialValues: { title: 'X', color: null } })} />,
    )
    expect(screen.getByRole('button', { name: 'Color: default' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Pending state
// ═══════════════════════════════════════════════════════════════════════════════

describe('pending state', () => {
  it('disables the submit button and shows the pending label when isPending', () => {
    render(<ActivityTemplateDialog {...makeProps({ isPending: true })} />)
    const submit = getSubmitButton()
    expect(submit).toBeDisabled()
    expect(submit).toHaveTextContent(/saving/i)
  })

  it('enables the submit button with the default label when not pending', () => {
    render(<ActivityTemplateDialog {...makeProps()} />)
    const submit = getSubmitButton()
    expect(submit).toBeEnabled()
    expect(submit).toHaveTextContent(/^save$/i)
  })
})
