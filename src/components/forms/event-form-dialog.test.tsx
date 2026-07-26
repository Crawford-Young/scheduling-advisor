import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventFormDialog } from './event-form-dialog'
import type { EventFormDialogProps, EventFormValues } from './event-form-dialog'

// Radix Select relies on pointer-capture + scrollIntoView DOM APIs happy-dom
// does not implement; stub them so the Repeat select can be driven in tests.
beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
  Element.prototype.scrollIntoView = vi.fn()
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProps(overrides: Partial<EventFormDialogProps> = {}): EventFormDialogProps {
  return {
    open: true,
    onOpenChange: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  }
}

/** Opens a Radix Select combobox and clicks the option with the given text. */
async function selectComboboxOption(
  user: ReturnType<typeof userEvent.setup>,
  comboboxName: string,
  optionText: string,
): Promise<void> {
  await user.click(screen.getByRole('combobox', { name: comboboxName }))
  const listbox = await screen.findByRole('listbox')
  await user.click(within(listbox).getByText(optionText))
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

  it('shows "New event" when mode="create" despite seeded initialValues (create defaults)', () => {
    render(
      <EventFormDialog
        {...makeProps({
          mode: 'create',
          initialValues: {
            startAt: '2025-06-15T09:00:00.000Z',
            endAt: '2025-06-15T10:00:00.000Z',
            allDay: false,
          },
        })}
      />,
    )
    expect(screen.getByRole('heading', { name: /new event/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /edit event/i })).not.toBeInTheDocument()
  })

  it('shows "Edit event" when mode="edit"', () => {
    render(<EventFormDialog {...makeProps({ mode: 'edit', initialValues: { title: 'X' } })} />)
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
    const payload = onSubmit.mock.calls[0]![0] as EventFormValues
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
    const payload = onSubmit.mock.calls[0]![0] as EventFormValues
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
    const payload = onSubmit.mock.calls[0]![0] as EventFormValues
    expect(payload.color).toBe('blue')
    expect(payload.location).toBe('Park')
    expect(payload.description).toBe('Notes')
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
// All-day mode — date picker + real-instant submit
// ═══════════════════════════════════════════════════════════════════════════════

describe('all-day mode', () => {
  const ORIGINAL_TZ = process.env['TZ']

  afterEach(() => {
    if (ORIGINAL_TZ === undefined) {
      delete process.env['TZ']
    } else {
      process.env['TZ'] = ORIGINAL_TZ
    }
  })

  it('renders a Date field (not time fields) when all-day is on', () => {
    render(<EventFormDialog {...makeProps({ initialValues: { allDay: true, title: 'X' } })} />)
    expect(screen.getByText('Date')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pick a date/i })).toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: 'Start time hour' })).not.toBeInTheDocument()
  })

  it('keeps a Date field after toggling all-day on from timed mode', async () => {
    const user = userEvent.setup()
    render(<EventFormDialog {...makeProps()} />)
    await user.click(screen.getByRole('switch'))
    expect(screen.getByText('Date')).toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: 'Start time hour' })).not.toBeInTheDocument()
  })

  it('disables save in all-day mode until a date is picked', () => {
    render(
      <EventFormDialog {...makeProps({ initialValues: { allDay: true, title: 'Holiday' } })} />,
    )
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('enables save in all-day mode when title + a seeded date are present', () => {
    render(
      <EventFormDialog
        {...makeProps({
          initialValues: {
            allDay: true,
            title: 'Holiday',
            startAt: '2025-06-15T09:00:00.000Z',
            endAt: '2025-06-15T10:00:00.000Z',
          },
        })}
      />,
    )
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled()
  })

  it('submits real 00:00–23:59 instants for the picked local day (TZ=UTC)', async () => {
    process.env['TZ'] = 'UTC'
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <EventFormDialog
        {...makeProps({
          onSubmit,
          initialValues: {
            allDay: true,
            title: 'Holiday',
            startAt: '2025-06-15T09:00:00.000Z',
            endAt: '2025-06-15T10:00:00.000Z',
          },
        })}
      />,
    )
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const payload = onSubmit.mock.calls[0]![0] as EventFormValues
    expect(payload.allDay).toBe(true)
    expect(payload.startAt).toBe('2025-06-15T00:00:00.000Z')
    expect(payload.endAt).toBe('2025-06-15T23:59:00.000Z')
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
    const payload = onSubmit.mock.calls[0]![0] as EventFormValues
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

// ═══════════════════════════════════════════════════════════════════════════════
// Repeat (recurrence)
// ═══════════════════════════════════════════════════════════════════════════════

describe('repeat / recurrence', () => {
  // Anchor pinned to UTC so getDate/getDay/getMonth are deterministic across
  // hosts. 2025-06-18 (UTC) is a Wednesday (getDay 3), the 3rd Wednesday of the
  // month (dayOfMonth 18), in June (month 6).
  const START_AT = '2025-06-18T14:00:00.000Z'
  const END_AT = '2025-06-18T15:00:00.000Z'
  const ANCHOR_WEEKDAY = 3 // Wednesday
  const ANCHOR_DAY_OF_MONTH = 18
  const ANCHOR_MONTH = 6

  const ORIGINAL_TZ = process.env['TZ']

  beforeEach(() => {
    process.env['TZ'] = 'UTC'
  })

  afterEach(() => {
    if (ORIGINAL_TZ === undefined) {
      delete process.env['TZ']
    } else {
      process.env['TZ'] = ORIGINAL_TZ
    }
  })

  function timedProps(overrides: Partial<EventFormDialogProps> = {}): EventFormDialogProps {
    return makeProps({
      initialValues: { title: 'Standup', startAt: START_AT, endAt: END_AT },
      ...overrides,
    })
  }

  async function saveAndReadPayload(
    onSubmit: ReturnType<typeof vi.fn>,
    call = 0,
  ): Promise<EventFormValues> {
    await userEvent.setup().click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(call + 1))
    return onSubmit.mock.calls[call]![0] as EventFormValues
  }

  it('renders the Repeat select defaulting to "Does not repeat"', () => {
    render(<EventFormDialog {...timedProps()} />)
    expect(screen.getByRole('combobox', { name: 'Repeat' })).toHaveTextContent(/does not repeat/i)
  })

  it('omits the recurrence key from the payload when freq stays none', async () => {
    const onSubmit = vi.fn()
    render(<EventFormDialog {...timedProps({ onSubmit })} />)
    const payload = await saveAndReadPayload(onSubmit)
    expect('recurrence' in payload).toBe(false)
  })

  it('emits daily recurrence (no extra fields) when selected via the Repeat control', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<EventFormDialog {...timedProps({ onSubmit })} />)
    await selectComboboxOption(user, 'Repeat', 'Daily')
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const payload = onSubmit.mock.calls[0]![0] as EventFormValues
    expect(payload.recurrence).toEqual({ freq: 'daily' })
  })

  it('weekly via the Repeat control defaults the weekday to the anchor date', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<EventFormDialog {...timedProps({ onSubmit })} />)
    await selectComboboxOption(user, 'Repeat', 'Weekly')
    expect(
      within(screen.getByRole('group', { name: 'Repeat days' })).getByRole('button', {
        name: 'Wednesday',
      }),
    ).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const payload = onSubmit.mock.calls[0]![0] as EventFormValues
    expect(payload.recurrence).toEqual({ freq: 'weekly', weekdays: [ANCHOR_WEEKDAY] })
  })

  it('lets the user override the nth ordinal and weekday selects', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<EventFormDialog {...timedProps({ onSubmit })} />)
    await selectComboboxOption(user, 'Repeat', 'Monthly')
    await selectComboboxOption(user, 'Monthly mode', 'On the Nth weekday')
    // Anchor defaults are 3rd (ordinal) / Wednesday (weekday); pick different
    // values so Radix fires onValueChange for both selects.
    await selectComboboxOption(user, 'Ordinal', 'Second')
    await selectComboboxOption(user, 'Weekday', 'Friday')
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const payload = onSubmit.mock.calls[0]![0] as EventFormValues
    expect(payload.recurrence).toEqual({ freq: 'monthly', nthOrdinal: 2, nthWeekday: 5 })
  })

  it('seeds weekly weekdays from initialValues and toggles day buttons into the payload', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <EventFormDialog
        {...timedProps({
          onSubmit,
          initialValues: {
            title: 'X',
            startAt: START_AT,
            endAt: END_AT,
            recurrence: { freq: 'weekly', weekdays: [ANCHOR_WEEKDAY] },
          },
        })}
      />,
    )
    const group = screen.getByRole('group', { name: 'Repeat days' })
    expect(within(group).getByRole('button', { name: 'Wednesday' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // Add Monday (1) → payload weekdays sorted [1, 3].
    await user.click(within(group).getByRole('button', { name: 'Monday' }))
    const payload = await saveAndReadPayload(onSubmit)
    expect(payload.recurrence).toEqual({ freq: 'weekly', weekdays: [1, ANCHOR_WEEKDAY] })
  })

  it('disables Save when weekly has zero selected weekdays', async () => {
    const user = userEvent.setup()
    render(
      <EventFormDialog
        {...timedProps({
          initialValues: {
            title: 'X',
            startAt: START_AT,
            endAt: END_AT,
            recurrence: { freq: 'weekly', weekdays: [ANCHOR_WEEKDAY] },
          },
        })}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Wednesday' }))
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('emits monthly day-mode dayOfMonth derived from the anchor date', async () => {
    const onSubmit = vi.fn()
    render(
      <EventFormDialog
        {...timedProps({
          onSubmit,
          initialValues: {
            title: 'X',
            startAt: START_AT,
            endAt: END_AT,
            recurrence: { freq: 'monthly', dayOfMonth: ANCHOR_DAY_OF_MONTH },
          },
        })}
      />,
    )
    const payload = await saveAndReadPayload(onSubmit)
    expect(payload.recurrence).toEqual({ freq: 'monthly', dayOfMonth: ANCHOR_DAY_OF_MONTH })
  })

  it('emits monthly nth-weekday mode from seeded ordinal + weekday', async () => {
    const onSubmit = vi.fn()
    render(
      <EventFormDialog
        {...timedProps({
          onSubmit,
          initialValues: {
            title: 'X',
            startAt: START_AT,
            endAt: END_AT,
            recurrence: { freq: 'monthly', nthOrdinal: 2, nthWeekday: 4 },
          },
        })}
      />,
    )
    const payload = await saveAndReadPayload(onSubmit)
    expect(payload.recurrence).toEqual({ freq: 'monthly', nthOrdinal: 2, nthWeekday: 4 })
  })

  it('emits yearly month + dayOfMonth derived from the anchor date', async () => {
    const onSubmit = vi.fn()
    render(
      <EventFormDialog
        {...timedProps({
          onSubmit,
          initialValues: {
            title: 'X',
            startAt: START_AT,
            endAt: END_AT,
            recurrence: { freq: 'yearly', month: ANCHOR_MONTH, dayOfMonth: ANCHOR_DAY_OF_MONTH },
          },
        })}
      />,
    )
    const payload = await saveAndReadPayload(onSubmit)
    expect(payload.recurrence).toEqual({
      freq: 'yearly',
      month: ANCHOR_MONTH,
      dayOfMonth: ANCHOR_DAY_OF_MONTH,
    })
  })

  it('defaults the nth ordinal to "Last" for a 5th-occurrence anchor', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    // 2025-06-29 (UTC) is the 5th Sunday → ordinal caps to -1 ("Last").
    render(
      <EventFormDialog
        {...timedProps({
          onSubmit,
          initialValues: {
            title: 'X',
            startAt: '2025-06-29T14:00:00.000Z',
            endAt: '2025-06-29T15:00:00.000Z',
          },
        })}
      />,
    )
    await selectComboboxOption(user, 'Repeat', 'Monthly')
    await selectComboboxOption(user, 'Monthly mode', 'On the Nth weekday')
    expect(screen.getByRole('combobox', { name: 'Ordinal' })).toHaveTextContent(/last/i)
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const payload = onSubmit.mock.calls[0]![0] as EventFormValues
    expect(payload.recurrence).toEqual({ freq: 'monthly', nthOrdinal: -1, nthWeekday: 0 })
  })

  it('composes all-day with recurrence — emits real day-boundary instants and the rule', async () => {
    const onSubmit = vi.fn()
    render(
      <EventFormDialog
        {...timedProps({
          onSubmit,
          initialValues: {
            title: 'Holiday',
            allDay: true,
            startAt: START_AT,
            endAt: END_AT,
            recurrence: { freq: 'daily' },
          },
        })}
      />,
    )
    const payload = await saveAndReadPayload(onSubmit)
    expect(payload.allDay).toBe(true)
    expect(payload.startAt).toBe('2025-06-18T00:00:00.000Z')
    expect(payload.endAt).toBe('2025-06-18T23:59:00.000Z')
    expect(payload.recurrence).toEqual({ freq: 'daily' })
  })

  it('carries the "Ends on" until date (YYYY-MM-DD) into the payload', async () => {
    const onSubmit = vi.fn()
    render(
      <EventFormDialog
        {...timedProps({
          onSubmit,
          initialValues: {
            title: 'X',
            startAt: START_AT,
            endAt: END_AT,
            recurrence: { freq: 'daily', until: '2025-12-31' },
          },
        })}
      />,
    )
    const payload = await saveAndReadPayload(onSubmit)
    expect(payload.recurrence).toEqual({ freq: 'daily', until: '2025-12-31' })
  })

  it('resets the previous freq’s rule fields when the frequency is switched', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    // Seeded weekly with two weekdays; switching to Daily must drop weekdays.
    render(
      <EventFormDialog
        {...timedProps({
          onSubmit,
          initialValues: {
            title: 'X',
            startAt: START_AT,
            endAt: END_AT,
            recurrence: { freq: 'weekly', weekdays: [1, ANCHOR_WEEKDAY] },
          },
        })}
      />,
    )
    expect(screen.getByRole('group', { name: 'Repeat days' })).toBeInTheDocument()
    await selectComboboxOption(user, 'Repeat', 'Daily')
    expect(screen.queryByRole('group', { name: 'Repeat days' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const payload = onSubmit.mock.calls[0]![0] as EventFormValues
    expect(payload.recurrence).toEqual({ freq: 'daily' })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// showRecurrence prop — hides Repeat at consumers whose submit path drops it
// ═══════════════════════════════════════════════════════════════════════════════

describe('showRecurrence prop', () => {
  it('renders no Repeat control and omits the recurrence key when showRecurrence={false}', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <EventFormDialog
        {...makeProps({
          onSubmit,
          showRecurrence: false,
          initialValues: {
            title: 'Plain edit',
            startAt: '2025-06-15T09:00:00.000Z',
            endAt: '2025-06-15T10:00:00.000Z',
          },
        })}
      />,
    )
    expect(screen.queryByRole('combobox', { name: 'Repeat' })).not.toBeInTheDocument()
    expect(screen.queryByText('Repeat')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const payload = onSubmit.mock.calls[0]![0] as EventFormValues
    expect('recurrence' in payload).toBe(false)
  })

  it('still renders the Repeat control when showRecurrence is omitted (default true)', () => {
    render(<EventFormDialog {...makeProps({ initialValues: { title: 'X' } })} />)
    expect(screen.getByRole('combobox', { name: 'Repeat' })).toBeInTheDocument()
  })

  it('still renders the Repeat control for mode="edit" when showRecurrence is omitted', () => {
    render(<EventFormDialog {...makeProps({ mode: 'edit', initialValues: { title: 'X' } })} />)
    expect(screen.getByRole('combobox', { name: 'Repeat' })).toBeInTheDocument()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Visibility — renders in every mode, seeded from initialValues / defaultVisibility,
// always emitted explicitly in the submit payload.
// ═══════════════════════════════════════════════════════════════════════════════

describe('visibility', () => {
  it('defaults to Private when neither initialValues.visibility nor defaultVisibility is given', () => {
    render(<EventFormDialog {...makeProps()} />)
    expect(screen.getByRole('combobox', { name: 'Visibility' })).toHaveTextContent(/^private$/i)
  })

  it('seeds from the defaultVisibility prop in create mode when initialValues carries no visibility', () => {
    render(
      <EventFormDialog
        {...makeProps({
          mode: 'create',
          defaultVisibility: 'public',
          initialValues: { title: 'X' },
        })}
      />,
    )
    expect(screen.getByRole('combobox', { name: 'Visibility' })).toHaveTextContent(/^public$/i)
  })

  it('seeds from initialValues.visibility in edit mode, overriding a defaultVisibility prop', () => {
    render(
      <EventFormDialog
        {...makeProps({
          mode: 'edit',
          defaultVisibility: 'public',
          initialValues: { title: 'X', visibility: 'busy' },
        })}
      />,
    )
    expect(screen.getByRole('combobox', { name: 'Visibility' })).toHaveTextContent(
      /^busy \(time only\)$/i,
    )
  })

  it('renders the Visibility select even when showRecurrence={false} (plain-event edit sites)', () => {
    render(<EventFormDialog {...makeProps({ showRecurrence: false })} />)
    expect(screen.getByRole('combobox', { name: 'Visibility' })).toBeInTheDocument()
  })

  it('renders all four visibility options', async () => {
    const user = userEvent.setup()
    render(<EventFormDialog {...makeProps()} />)
    await user.click(screen.getByRole('combobox', { name: 'Visibility' }))
    const listbox = await screen.findByRole('listbox')
    expect(within(listbox).getByText('Public')).toBeInTheDocument()
    expect(within(listbox).getByText('Friends')).toBeInTheDocument()
    expect(within(listbox).getByText('Busy (time only)')).toBeInTheDocument()
    expect(within(listbox).getByText('Private')).toBeInTheDocument()
  })

  it('emits the default (unseeded) visibility explicitly in the submit payload', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <EventFormDialog
        {...makeProps({
          onSubmit,
          initialValues: {
            title: 'X',
            startAt: '2025-06-15T09:00:00.000Z',
            endAt: '2025-06-15T10:00:00.000Z',
          },
        })}
      />,
    )
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const payload = onSubmit.mock.calls[0]![0] as EventFormValues
    expect(payload.visibility).toBe('private')
  })

  it('carries a user-selected visibility into the submit payload', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <EventFormDialog
        {...makeProps({
          onSubmit,
          initialValues: {
            title: 'X',
            startAt: '2025-06-15T09:00:00.000Z',
            endAt: '2025-06-15T10:00:00.000Z',
          },
        })}
      />,
    )
    await selectComboboxOption(user, 'Visibility', 'Public')
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const payload = onSubmit.mock.calls[0]![0] as EventFormValues
    expect(payload.visibility).toBe('public')
  })

  it('carries a user-selected Friends visibility into the submit payload', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <EventFormDialog
        {...makeProps({
          onSubmit,
          initialValues: {
            title: 'X',
            startAt: '2025-06-15T09:00:00.000Z',
            endAt: '2025-06-15T10:00:00.000Z',
          },
        })}
      />,
    )
    await selectComboboxOption(user, 'Visibility', 'Friends')
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const payload = onSubmit.mock.calls[0]![0] as EventFormValues
    expect(payload.visibility).toBe('friends')
  })

  it('reseeds the default visibility on a fresh mount after a prior edit dialog carried a different value (create-after-edit reseed)', () => {
    const { unmount } = render(
      <EventFormDialog
        {...makeProps({ mode: 'edit', initialValues: { title: 'X', visibility: 'public' } })}
      />,
    )
    expect(screen.getByRole('combobox', { name: 'Visibility' })).toHaveTextContent(/^public$/i)
    unmount()

    render(
      <EventFormDialog
        {...makeProps({ mode: 'create', defaultVisibility: 'private', initialValues: undefined })}
      />,
    )
    expect(screen.getByRole('combobox', { name: 'Visibility' })).toHaveTextContent(/^private$/i)
  })
})

// ─── displayName ────────────────────────────────────────────────────────────

describe('displayName', () => {
  it('has the correct displayName', () => {
    expect(EventFormDialog.displayName).toBe('EventFormDialog')
  })
})
