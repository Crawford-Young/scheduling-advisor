import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventFormDialog } from './event-form-dialog'
import type { EventFormDialogProps, EventFormValues } from './event-form-dialog'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProps(overrides: Partial<EventFormDialogProps> = {}): EventFormDialogProps {
  return {
    open: true,
    onOpenChange: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Open / close + header
// ═══════════════════════════════════════════════════════════════════════════════

describe('open / close + header', () => {
  it('renders the dialog when open=true', () => {
    render(<EventFormDialog {...makeProps()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('does not render the dialog when open=false', () => {
    render(<EventFormDialog {...makeProps({ open: false })} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows "New event" heading when no initialValues', () => {
    render(<EventFormDialog {...makeProps()} />)
    expect(screen.getByRole('heading', { name: /new event/i })).toBeInTheDocument()
  })

  it('shows "Edit event" heading when initialValues are provided', () => {
    render(<EventFormDialog {...makeProps({ initialValues: { title: 'X' } })} />)
    expect(screen.getByRole('heading', { name: /edit event/i })).toBeInTheDocument()
  })

  it('renders a DialogDescription for a11y', () => {
    render(<EventFormDialog {...makeProps()} />)
    expect(screen.getByText(/create or edit an event/i)).toBeInTheDocument()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// No type / social / recurrence surfaces
// ═══════════════════════════════════════════════════════════════════════════════

describe('surfaces that no longer exist', () => {
  it('renders no type picker (radiogroup)', () => {
    render(<EventFormDialog {...makeProps()} />)
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
  })

  it('renders no goal target date field', () => {
    render(<EventFormDialog {...makeProps()} />)
    // Only one "pick a date" affordance (the task date), no separate goal date.
    expect(screen.getAllByRole('button', { name: /pick a date/i })).toHaveLength(1)
  })

  it('renders no social section', () => {
    render(<EventFormDialog {...makeProps()} />)
    expect(screen.queryByText(/social/i)).not.toBeInTheDocument()
  })

  it('renders no recurrence controls', () => {
    render(<EventFormDialog {...makeProps()} />)
    const recurrenceTrigger = screen
      .queryAllByRole('combobox')
      .find((c) => c.getAttribute('aria-label') === 'Recurrence')
    expect(recurrenceTrigger).toBeUndefined()
    expect(screen.queryByRole('group', { name: 'Recurrence days' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/repeat count/i)).not.toBeInTheDocument()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Title
// ═══════════════════════════════════════════════════════════════════════════════

describe('title field', () => {
  it('renders the title input', () => {
    render(<EventFormDialog {...makeProps()} />)
    expect(screen.getByRole('textbox', { name: /title/i })).toBeInTheDocument()
  })

  it('seeds the title from initialValues', () => {
    render(<EventFormDialog {...makeProps({ initialValues: { title: 'My event' } })} />)
    expect(screen.getByRole('textbox', { name: /title/i })).toHaveValue('My event')
  })

  it('updates the title as the user types', async () => {
    const user = userEvent.setup()
    render(<EventFormDialog {...makeProps()} />)
    await user.type(screen.getByRole('textbox', { name: /title/i }), 'Standup')
    expect(screen.getByRole('textbox', { name: /title/i })).toHaveValue('Standup')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// All-day + time fields + color + location + description
// ═══════════════════════════════════════════════════════════════════════════════

describe('field set', () => {
  it('shows the all-day switch and time fields by default', () => {
    render(<EventFormDialog {...makeProps()} />)
    expect(screen.getByRole('switch')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Start time hour' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pick a date/i })).toBeInTheDocument()
  })

  it('renders a color swatch group, location input and description textarea', () => {
    render(<EventFormDialog {...makeProps()} />)
    expect(screen.getByRole('group', { name: 'Color' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/location/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/description/i)).toBeInTheDocument()
  })

  it('renders event times in 24-hour mode when use24h is set', () => {
    render(<EventFormDialog {...makeProps({ use24h: true })} />)
    expect(screen.getByRole('spinbutton', { name: 'Start time hour' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'AM' })).not.toBeInTheDocument()
  })

  it('all-day switch hides the time fields', async () => {
    const user = userEvent.setup()
    render(<EventFormDialog {...makeProps()} />)
    expect(screen.getByRole('spinbutton', { name: 'Start time hour' })).toBeInTheDocument()
    await user.click(screen.getByRole('switch'))
    expect(screen.queryByRole('spinbutton', { name: 'Start time hour' })).not.toBeInTheDocument()
  })

  it('hydrates allDay=true and hides time fields', () => {
    render(<EventFormDialog {...makeProps({ initialValues: { allDay: true, title: 'X' } })} />)
    expect(screen.getByRole('switch')).toBeChecked()
    expect(screen.queryByRole('spinbutton', { name: 'Start time hour' })).not.toBeInTheDocument()
  })

  it('typing in location and description updates their values', async () => {
    const user = userEvent.setup()
    render(<EventFormDialog {...makeProps()} />)
    await user.type(screen.getByPlaceholderText(/location/i), 'Park')
    await user.type(screen.getByPlaceholderText(/description/i), 'Notes')
    expect(screen.getByPlaceholderText(/location/i)).toHaveValue('Park')
    expect(screen.getByPlaceholderText(/description/i)).toHaveValue('Notes')
  })

  it('selecting a color swatch marks it pressed', async () => {
    const user = userEvent.setup()
    render(<EventFormDialog {...makeProps()} />)
    const blue = screen.getByRole('button', { name: 'Color: blue' })
    await user.click(blue)
    expect(blue).toHaveAttribute('aria-pressed', 'true')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Submit — payload
// ═══════════════════════════════════════════════════════════════════════════════

describe('submit', () => {
  it('assembles startAt / endAt ISO strings via buildIso', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <EventFormDialog
        {...makeProps({
          onSubmit,
          initialValues: {
            title: 'Morning run',
            startAt: '2025-06-15T09:00:00.000Z',
            endAt: '2025-06-15T10:00:00.000Z',
          },
        })}
      />,
    )
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const payload = onSubmit.mock.calls[0][0] as EventFormValues
    expect(payload.title).toBe('Morning run')
    expect(payload.startAt).toBe('2025-06-15T09:00:00.000Z')
    expect(payload.endAt).toBe('2025-06-15T10:00:00.000Z')
  })

  it('emits null color/location/description at defaults', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <EventFormDialog
        {...makeProps({
          onSubmit,
          initialValues: {
            title: 'Plain event',
            startAt: '2025-06-15T09:00:00.000Z',
            endAt: '2025-06-15T10:00:00.000Z',
          },
        })}
      />,
    )
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const payload = onSubmit.mock.calls[0][0] as EventFormValues
    expect(payload.color).toBeNull()
    expect(payload.location).toBeNull()
    expect(payload.description).toBeNull()
    expect(payload.allDay).toBe(false)
  })

  it('carries a chosen color, trimmed location and description into the payload', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <EventFormDialog
        {...makeProps({
          onSubmit,
          initialValues: {
            title: 'Coloured event',
            startAt: '2025-06-15T09:00:00.000Z',
            endAt: '2025-06-15T10:00:00.000Z',
          },
        })}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Color: blue' }))
    await user.type(screen.getByPlaceholderText(/location/i), '  Park  ')
    await user.type(screen.getByPlaceholderText(/description/i), '  Notes  ')
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const payload = onSubmit.mock.calls[0][0] as EventFormValues
    expect(payload.color).toBe('blue')
    expect(payload.location).toBe('Park')
    expect(payload.description).toBe('Notes')
  })

  it('all-day event submits null startAt / endAt', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <EventFormDialog
        {...makeProps({ onSubmit, initialValues: { allDay: true, title: 'All day event' } })}
      />,
    )
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const payload = onSubmit.mock.calls[0][0] as EventFormValues
    expect(payload.allDay).toBe(true)
    expect(payload.startAt).toBeNull()
    expect(payload.endAt).toBeNull()
  })

  it('does nothing when a timed event has no date (direct form submit)', () => {
    const onSubmit = vi.fn()
    render(<EventFormDialog {...makeProps({ onSubmit, initialValues: { title: 'Run' } })} />)
    const form = screen.getByRole('dialog').querySelector('form')
    expect(form).not.toBeNull()
    fireEvent.submit(form!)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Timezone correctness — local wall-clock round-trip
// ═══════════════════════════════════════════════════════════════════════════════

describe('timezone correctness — local wall-clock round-trip', () => {
  const ORIGINAL_TZ = process.env['TZ']

  afterEach(() => {
    if (ORIGINAL_TZ === undefined) {
      delete process.env['TZ']
    } else {
      process.env['TZ'] = ORIGINAL_TZ
    }
  })

  it('resubmits an unmodified edit with the exact original startAt/endAt (TZ=America/New_York, UTC-4)', async () => {
    process.env['TZ'] = 'America/New_York'
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <EventFormDialog
        {...makeProps({
          onSubmit,
          initialValues: {
            title: 'Mid-morning run',
            startAt: '2025-06-15T14:00:00.000Z',
            endAt: '2025-06-15T14:30:00.000Z',
          },
        })}
      />,
    )
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const payload = onSubmit.mock.calls[0][0] as EventFormValues
    expect(payload.startAt).toBe('2025-06-15T14:00:00.000Z')
    expect(payload.endAt).toBe('2025-06-15T14:30:00.000Z')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Save enable/disable + isPending + Cancel
// ═══════════════════════════════════════════════════════════════════════════════

describe('save button + cancel', () => {
  it('disables save when the title is empty', () => {
    render(
      <EventFormDialog
        {...makeProps({
          initialValues: { startAt: '2025-06-15T09:00:00.000Z', endAt: '2025-06-15T10:00:00.000Z' },
        })}
      />,
    )
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('disables save when a timed event has no date', () => {
    render(<EventFormDialog {...makeProps({ initialValues: { title: 'Run' } })} />)
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('enables save when title + date are present', () => {
    render(
      <EventFormDialog
        {...makeProps({
          initialValues: {
            title: 'Run',
            startAt: '2025-06-15T09:00:00.000Z',
            endAt: '2025-06-15T10:00:00.000Z',
          },
        })}
      />,
    )
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled()
  })

  it('shows "Saving…" and disables save when isPending', () => {
    render(
      <EventFormDialog
        {...makeProps({
          isPending: true,
          initialValues: {
            title: 'Run',
            startAt: '2025-06-15T09:00:00.000Z',
            endAt: '2025-06-15T10:00:00.000Z',
          },
        })}
      />,
    )
    const save = screen.getByRole('button', { name: /saving/i })
    expect(save).toBeDisabled()
  })

  it('fires onOpenChange(false) when Cancel is clicked', async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(<EventFormDialog {...makeProps({ onOpenChange })} />)
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// initialValues hydration
// ═══════════════════════════════════════════════════════════════════════════════

describe('initialValues hydration', () => {
  it('seeds title, color, location, description and time fields', () => {
    render(
      <EventFormDialog
        {...makeProps({
          initialValues: {
            title: 'Seeded event',
            startAt: '2025-06-15T09:00:00.000Z',
            endAt: '2025-06-15T10:00:00.000Z',
            color: 'violet',
            location: 'Gym',
            description: 'Leg day',
            allDay: false,
          },
        })}
      />,
    )
    expect(screen.getByRole('textbox', { name: /title/i })).toHaveValue('Seeded event')
    expect(screen.getByPlaceholderText(/location/i)).toHaveValue('Gym')
    expect(screen.getByPlaceholderText(/description/i)).toHaveValue('Leg day')
    expect(screen.getByRole('button', { name: 'Color: violet' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})

// ─── displayName ────────────────────────────────────────────────────────────

describe('displayName', () => {
  it('has the correct displayName', () => {
    expect(EventFormDialog.displayName).toBe('EventFormDialog')
  })
})
