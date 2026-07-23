import * as React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  useActivityActions,
  useEventActions,
  type ActivityActionsRow,
  type EventActionsRow,
} from './use-activity-actions'

const refreshMock = vi.fn()
const updateActivityMock = vi.fn().mockResolvedValue({ data: {} })
const deleteActivityMock = vi.fn().mockResolvedValue({ data: { success: true } })
const updateEventMock = vi.fn().mockResolvedValue({ data: {} })
const deleteEventMock = vi.fn().mockResolvedValue({ data: { success: true } })
const toastErrorMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

vi.mock('@/server/actions/activities', () => ({
  updateActivity: (input: unknown) => updateActivityMock(input),
  deleteActivity: (input: unknown) => deleteActivityMock(input),
}))

vi.mock('@/server/actions/events', () => ({
  updateEvent: (input: unknown) => updateEventMock(input),
  deleteEvent: (input: unknown) => deleteEventMock(input),
}))

interface MockTemplateValues {
  readonly title: string
  readonly color?: string | null
  readonly description?: string | null
  readonly defaultLocation?: string | null
  readonly minDurationMin: number
  readonly maxDurationMin: number
  readonly weeklyTargetSessions: number
  readonly schedule: ReadonlyArray<{ day: number; startMinutes: number; durationMin: number }>
}

interface MockEventValues {
  readonly title: string
  readonly startAt?: string | null
  readonly endAt?: string | null
  readonly allDay?: boolean
  readonly color?: string | null
  readonly location?: string | null
  readonly description?: string | null
}

const TEMPLATE_SUBMIT: MockTemplateValues = {
  title: 'Edited running',
  color: 'violet',
  description: 'cardio edited',
  defaultLocation: 'Track',
  minDurationMin: 25,
  maxDurationMin: 55,
  weeklyTargetSessions: 4,
  schedule: [{ day: 2, startMinutes: 400, durationMin: 50 }],
}

// Optional fields omitted → exercises the ?? null fallbacks in updateActivity.
const TEMPLATE_SUBMIT_MIN: MockTemplateValues = {
  title: 'Minimal',
  minDurationMin: 20,
  maxDurationMin: 40,
  weeklyTargetSessions: 2,
  schedule: [],
}

const EVENT_SUBMIT: MockEventValues = {
  title: 'Edited event',
  startAt: '2026-07-02T09:30:00.000Z',
  endAt: '2026-07-02T10:30:00.000Z',
  allDay: false,
  color: 'blue',
  location: 'Office',
  description: 'notes',
}

// Minimal edit (all optional fields omitted) → exercises the ?? null fallbacks.
const EVENT_SUBMIT_MIN: MockEventValues = { title: 'Minimal event' }

vi.mock('@/lib/ui', () => ({
  toast: { error: (...args: unknown[]) => toastErrorMock(...args) },
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
  AlertDialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div role="alertdialog">{children}</div> : null,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  AlertDialogAction: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
}))

// Module-level mount counters — a persistent (broken) mount fires the mount
// effect once; a conditional (fixed) render remounts fresh on every reopen.
let templateMountCount = 0
let eventMountCount = 0

vi.mock('@/components/forms/activity-template-dialog', () => ({
  // ActivityTemplateDialog — surfaces data props as text so contract bugs surface.
  ActivityTemplateDialog: ({
    open,
    onOpenChange,
    onSubmit,
    initialValues,
    use24h,
  }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSubmit: (values: MockTemplateValues) => void
    initialValues?: Partial<MockTemplateValues>
    use24h?: boolean
  }) => {
    React.useEffect(() => {
      templateMountCount += 1
    }, [])
    return open ? (
      <div role="dialog" aria-label="activity-template">
        <span data-testid="tpl-title">{initialValues?.title ?? ''}</span>
        <span data-testid="tpl-color">{initialValues?.color ?? ''}</span>
        <span data-testid="tpl-description">{initialValues?.description ?? ''}</span>
        <span data-testid="tpl-default-location">{initialValues?.defaultLocation ?? ''}</span>
        <span data-testid="tpl-min">{String(initialValues?.minDurationMin ?? '')}</span>
        <span data-testid="tpl-max">{String(initialValues?.maxDurationMin ?? '')}</span>
        <span data-testid="tpl-weekly">{String(initialValues?.weeklyTargetSessions ?? '')}</span>
        <span data-testid="tpl-schedule-len">{String(initialValues?.schedule?.length ?? '')}</span>
        <span data-testid="tpl-use24h">{String(use24h ?? '')}</span>
        <button type="button" onClick={() => onSubmit(TEMPLATE_SUBMIT)}>
          template-save
        </button>
        <button type="button" onClick={() => onSubmit(TEMPLATE_SUBMIT_MIN)}>
          template-save-min
        </button>
        <button type="button" onClick={() => onOpenChange(false)}>
          template-close
        </button>
      </div>
    ) : null
  },
}))

vi.mock('@/components/forms/event-form-dialog', () => ({
  // EventFormDialog — surfaces data props as text.
  EventFormDialog: ({
    open,
    onOpenChange,
    onSubmit,
    initialValues,
    use24h,
    mode,
  }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSubmit: (values: MockEventValues) => void
    initialValues?: Partial<MockEventValues>
    use24h?: boolean
    mode?: 'create' | 'edit'
  }) => {
    React.useEffect(() => {
      eventMountCount += 1
    }, [])
    return open ? (
      <div role="dialog" aria-label="event-form">
        <span data-testid="evt-title">{initialValues?.title ?? ''}</span>
        <span data-testid="evt-start">{initialValues?.startAt ?? ''}</span>
        <span data-testid="evt-end">{initialValues?.endAt ?? ''}</span>
        <span data-testid="evt-all-day">{String(initialValues?.allDay ?? '')}</span>
        <span data-testid="evt-color">{initialValues?.color ?? ''}</span>
        <span data-testid="evt-location">{initialValues?.location ?? ''}</span>
        <span data-testid="evt-description">{initialValues?.description ?? ''}</span>
        <span data-testid="evt-use24h">{String(use24h ?? '')}</span>
        <span data-testid="evt-mode">{mode ?? ''}</span>
        <button type="button" onClick={() => onSubmit(EVENT_SUBMIT)}>
          event-save
        </button>
        <button type="button" onClick={() => onSubmit(EVENT_SUBMIT_MIN)}>
          event-save-min
        </button>
        <button type="button" onClick={() => onOpenChange(false)}>
          event-close
        </button>
      </div>
    ) : null
  },
}))

const BROWSER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

function makeActivity(over: Partial<ActivityActionsRow> = {}): ActivityActionsRow {
  return {
    id: 'act-1',
    title: 'Running',
    color: 'blue',
    description: 'cardio',
    defaultLocation: 'Park',
    minDurationMin: 30,
    maxDurationMin: 60,
    weeklyTargetSessions: 3,
    schedule: [{ day: 1, startMinutes: 420, durationMin: 45 }],
    timeZone: 'America/New_York',
    ...over,
  }
}

function makeEvent(over: Partial<EventActionsRow> = {}): EventActionsRow {
  return {
    id: 'evt-1',
    title: 'Dentist',
    startAt: '2026-07-02T09:00:00.000Z',
    endAt: '2026-07-02T10:00:00.000Z',
    allDay: false,
    color: 'red',
    location: 'Clinic',
    description: 'checkup',
    status: 'pending',
    ...over,
  }
}

/** Host exposing the activity hook's controls as buttons. */
function ActivityHarness(props: {
  activity: ActivityActionsRow
  use24h?: boolean
  initialEditOpen?: boolean
}): React.JSX.Element {
  const { isPending, openEdit, openDelete, dialogs } = useActivityActions(props)
  return (
    <>
      <button onClick={openEdit} disabled={isPending}>
        edit-activity
      </button>
      <button onClick={openDelete}>delete-activity</button>
      {dialogs}
    </>
  )
}

/** Host exposing the one-off-event hook's controls as buttons. */
function EventHarness(props: { event: EventActionsRow; use24h?: boolean }): React.JSX.Element {
  const { isComplete, completeLabel, isPending, handleComplete, openEdit, openDelete, dialogs } =
    useEventActions(props)
  return (
    <>
      <span data-testid="is-complete">{String(isComplete)}</span>
      <button onClick={handleComplete} disabled={isPending}>
        {completeLabel}
      </button>
      <button onClick={openEdit}>edit-event</button>
      <button onClick={openDelete}>delete-event</button>
      {dialogs}
    </>
  )
}

const DELETE_ACTIVITY_TITLE = 'Delete this activity?'
// Intended wording, written independently of the component (repo copy rule).
const DELETE_ACTIVITY_DESCRIPTION = 'Deletes future pending events; past events are kept'

describe('useActivityActions (activity templates)', () => {
  beforeEach(() => {
    refreshMock.mockClear()
    updateActivityMock.mockClear().mockResolvedValue({ data: {} })
    deleteActivityMock.mockClear().mockResolvedValue({ data: { success: true } })
    toastErrorMock.mockClear()
    templateMountCount = 0
    eventMountCount = 0
  })

  it('opens the template dialog seeded from the current activity row', async () => {
    const user = userEvent.setup()
    render(<ActivityHarness activity={makeActivity()} use24h />)
    await user.click(screen.getByRole('button', { name: 'edit-activity' }))

    expect(screen.getByTestId('tpl-title')).toHaveTextContent('Running')
    expect(screen.getByTestId('tpl-color')).toHaveTextContent('blue')
    expect(screen.getByTestId('tpl-description')).toHaveTextContent('cardio')
    expect(screen.getByTestId('tpl-default-location')).toHaveTextContent('Park')
    expect(screen.getByTestId('tpl-min')).toHaveTextContent('30')
    expect(screen.getByTestId('tpl-max')).toHaveTextContent('60')
    expect(screen.getByTestId('tpl-weekly')).toHaveTextContent('3')
    expect(screen.getByTestId('tpl-schedule-len')).toHaveTextContent('1')
    expect(screen.getByTestId('tpl-use24h')).toHaveTextContent('true')
  })

  it('auto-opens the dialog when initialEditOpen is set (deep-link path)', () => {
    render(<ActivityHarness activity={makeActivity()} initialEditOpen />)
    expect(screen.getByRole('dialog', { name: 'activity-template' })).toBeInTheDocument()
    expect(screen.getByTestId('tpl-title')).toHaveTextContent('Running')
  })

  it('saves an edit via updateActivity with the mapped payload and browser time zone', async () => {
    const user = userEvent.setup()
    render(<ActivityHarness activity={makeActivity()} />)
    await user.click(screen.getByRole('button', { name: 'edit-activity' }))
    await user.click(screen.getByRole('button', { name: 'template-save' }))

    await waitFor(() =>
      expect(updateActivityMock).toHaveBeenCalledWith({
        id: 'act-1',
        title: 'Edited running',
        color: 'violet',
        description: 'cardio edited',
        defaultLocation: 'Track',
        minDurationMin: 25,
        maxDurationMin: 55,
        weeklyTargetSessions: 4,
        schedule: [{ day: 2, startMinutes: 400, durationMin: 50 }],
        timeZone: BROWSER_TZ,
      }),
    )
    expect(refreshMock).toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'activity-template' })).not.toBeInTheDocument()
  })

  it('maps omitted optional template fields to null on save', async () => {
    const user = userEvent.setup()
    render(<ActivityHarness activity={makeActivity()} />)
    await user.click(screen.getByRole('button', { name: 'edit-activity' }))
    await user.click(screen.getByRole('button', { name: 'template-save-min' }))

    await waitFor(() =>
      expect(updateActivityMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'act-1',
          title: 'Minimal',
          color: null,
          description: null,
          defaultLocation: null,
          schedule: [],
        }),
      ),
    )
  })

  it('shows a toast and does not refresh when the edit save fails', async () => {
    updateActivityMock.mockResolvedValueOnce({ error: 'Not found' })
    const user = userEvent.setup()
    render(<ActivityHarness activity={makeActivity()} />)
    await user.click(screen.getByRole('button', { name: 'edit-activity' }))
    await user.click(screen.getByRole('button', { name: 'template-save' }))

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Could not save activity'))
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('re-seeds the dialog from the current row on close then reopen (freshness)', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<ActivityHarness activity={makeActivity()} />)
    await user.click(screen.getByRole('button', { name: 'edit-activity' }))
    expect(screen.getByTestId('tpl-title')).toHaveTextContent('Running')
    await user.click(screen.getByRole('button', { name: 'template-close' }))
    expect(screen.queryByRole('dialog', { name: 'activity-template' })).not.toBeInTheDocument()

    // Row changes underneath (e.g. a refresh landed new data), then reopen.
    rerender(<ActivityHarness activity={makeActivity({ title: 'Swimming', minDurationMin: 45 })} />)
    await user.click(screen.getByRole('button', { name: 'edit-activity' }))
    expect(screen.getByTestId('tpl-title')).toHaveTextContent('Swimming')
    expect(screen.getByTestId('tpl-min')).toHaveTextContent('45')
  })

  it('remounts the template dialog fresh on each open (no stale draft on reopen)', async () => {
    const user = userEvent.setup()
    render(<ActivityHarness activity={makeActivity()} />)
    await user.click(screen.getByRole('button', { name: 'edit-activity' }))
    expect(templateMountCount).toBe(1)
    await user.click(screen.getByRole('button', { name: 'template-close' }))
    expect(screen.queryByRole('dialog', { name: 'activity-template' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'edit-activity' }))
    expect(templateMountCount).toBe(2)
  })

  it('re-seeds a deep-linked auto-open dialog from the current row (freshness)', () => {
    const { rerender } = render(<ActivityHarness activity={makeActivity()} initialEditOpen />)
    expect(screen.getByTestId('tpl-title')).toHaveTextContent('Running')
    rerender(<ActivityHarness activity={makeActivity({ title: 'Cycling' })} initialEditOpen />)
    expect(screen.getByTestId('tpl-title')).toHaveTextContent('Cycling')
  })

  it('seeds empty optional fields when the activity has null color/description/location', async () => {
    const user = userEvent.setup()
    render(
      <ActivityHarness
        activity={makeActivity({ color: null, description: null, defaultLocation: null })}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'edit-activity' }))
    expect(screen.getByTestId('tpl-color')).toHaveTextContent('')
    expect(screen.getByTestId('tpl-description')).toHaveTextContent('')
    expect(screen.getByTestId('tpl-default-location')).toHaveTextContent('')
  })

  it('opens the delete dialog with the child-event-semantics copy', async () => {
    const user = userEvent.setup()
    render(<ActivityHarness activity={makeActivity()} />)
    await user.click(screen.getByRole('button', { name: 'delete-activity' }))
    expect(screen.getByText(DELETE_ACTIVITY_TITLE)).toBeInTheDocument()
    expect(screen.getByText(DELETE_ACTIVITY_DESCRIPTION)).toBeInTheDocument()
  })

  it('confirms delete via deleteActivity and refreshes', async () => {
    const user = userEvent.setup()
    render(<ActivityHarness activity={makeActivity()} />)
    await user.click(screen.getByRole('button', { name: 'delete-activity' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))
    await waitFor(() => expect(deleteActivityMock).toHaveBeenCalledWith({ id: 'act-1' }))
    expect(refreshMock).toHaveBeenCalled()
  })

  it('shows a toast and does not refresh when delete fails', async () => {
    deleteActivityMock.mockResolvedValueOnce({ error: 'Not found' })
    const user = userEvent.setup()
    render(<ActivityHarness activity={makeActivity()} />)
    await user.click(screen.getByRole('button', { name: 'delete-activity' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Could not delete activity'))
    expect(refreshMock).not.toHaveBeenCalled()
  })
})

describe('useEventActions (one-off events)', () => {
  beforeEach(() => {
    refreshMock.mockClear()
    updateEventMock.mockClear().mockResolvedValue({ data: {} })
    deleteEventMock.mockClear().mockResolvedValue({ data: { success: true } })
    toastErrorMock.mockClear()
    templateMountCount = 0
    eventMountCount = 0
  })

  it('opens the event dialog seeded from the current event row in edit mode', async () => {
    const user = userEvent.setup()
    render(<EventHarness event={makeEvent()} use24h />)
    await user.click(screen.getByRole('button', { name: 'edit-event' }))
    expect(screen.getByTestId('evt-title')).toHaveTextContent('Dentist')
    expect(screen.getByTestId('evt-start')).toHaveTextContent('2026-07-02T09:00:00.000Z')
    expect(screen.getByTestId('evt-end')).toHaveTextContent('2026-07-02T10:00:00.000Z')
    expect(screen.getByTestId('evt-location')).toHaveTextContent('Clinic')
    expect(screen.getByTestId('evt-use24h')).toHaveTextContent('true')
    expect(screen.getByTestId('evt-mode')).toHaveTextContent('edit')
  })

  it('remounts the event dialog fresh on each open (no stale draft on reopen)', async () => {
    const user = userEvent.setup()
    render(<EventHarness event={makeEvent()} />)
    await user.click(screen.getByRole('button', { name: 'edit-event' }))
    expect(eventMountCount).toBe(1)
    await user.click(screen.getByRole('button', { name: 'event-close' }))
    expect(screen.queryByRole('dialog', { name: 'event-form' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'edit-event' }))
    expect(eventMountCount).toBe(2)
  })

  it('seeds empty optional fields when the event has null start/end/color/location/description', async () => {
    const user = userEvent.setup()
    render(
      <EventHarness
        event={makeEvent({
          startAt: null,
          endAt: null,
          color: null,
          location: null,
          description: null,
        })}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'edit-event' }))
    expect(screen.getByTestId('evt-start')).toHaveTextContent('')
    expect(screen.getByTestId('evt-end')).toHaveTextContent('')
    expect(screen.getByTestId('evt-color')).toHaveTextContent('')
    expect(screen.getByTestId('evt-location')).toHaveTextContent('')
    expect(screen.getByTestId('evt-description')).toHaveTextContent('')
  })

  it('saves an event edit via updateEvent with the mapped payload', async () => {
    const user = userEvent.setup()
    render(<EventHarness event={makeEvent()} />)
    await user.click(screen.getByRole('button', { name: 'edit-event' }))
    await user.click(screen.getByRole('button', { name: 'event-save' }))
    await waitFor(() =>
      expect(updateEventMock).toHaveBeenCalledWith({
        id: 'evt-1',
        title: 'Edited event',
        startAt: '2026-07-02T09:30:00.000Z',
        endAt: '2026-07-02T10:30:00.000Z',
        allDay: false,
        color: 'blue',
        location: 'Office',
        description: 'notes',
      }),
    )
    expect(refreshMock).toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'event-form' })).not.toBeInTheDocument()
  })

  it('maps omitted optional event fields to null/false on save', async () => {
    const user = userEvent.setup()
    render(<EventHarness event={makeEvent()} />)
    await user.click(screen.getByRole('button', { name: 'edit-event' }))
    await user.click(screen.getByRole('button', { name: 'event-save-min' }))
    await waitFor(() =>
      expect(updateEventMock).toHaveBeenCalledWith({
        id: 'evt-1',
        title: 'Minimal event',
        startAt: null,
        endAt: null,
        allDay: false,
        color: null,
        location: null,
        description: null,
      }),
    )
  })

  it('shows a toast and does not refresh when the event edit fails', async () => {
    updateEventMock.mockResolvedValueOnce({ error: 'Not found' })
    const user = userEvent.setup()
    render(<EventHarness event={makeEvent()} />)
    await user.click(screen.getByRole('button', { name: 'edit-event' }))
    await user.click(screen.getByRole('button', { name: 'event-save' }))
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Could not save event'))
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('marks a pending event complete via updateEvent({ status: completed })', async () => {
    const user = userEvent.setup()
    render(<EventHarness event={makeEvent({ status: 'pending' })} />)
    expect(screen.getByTestId('is-complete')).toHaveTextContent('false')
    await user.click(screen.getByRole('button', { name: 'Mark complete' }))
    await waitFor(() =>
      expect(updateEventMock).toHaveBeenCalledWith({ id: 'evt-1', status: 'completed' }),
    )
    expect(refreshMock).toHaveBeenCalled()
  })

  it('marks a completed event pending via updateEvent({ status: pending })', async () => {
    const user = userEvent.setup()
    render(<EventHarness event={makeEvent({ status: 'completed' })} />)
    expect(screen.getByTestId('is-complete')).toHaveTextContent('true')
    await user.click(screen.getByRole('button', { name: 'Mark pending' }))
    await waitFor(() =>
      expect(updateEventMock).toHaveBeenCalledWith({ id: 'evt-1', status: 'pending' }),
    )
  })

  it('shows a toast and does not refresh when the complete toggle fails', async () => {
    updateEventMock.mockResolvedValueOnce({ error: 'Unauthorized' })
    const user = userEvent.setup()
    render(<EventHarness event={makeEvent()} />)
    await user.click(screen.getByRole('button', { name: 'Mark complete' }))
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Could not update event'))
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('deletes a one-off event via deleteEvent and refreshes', async () => {
    const user = userEvent.setup()
    render(<EventHarness event={makeEvent()} />)
    await user.click(screen.getByRole('button', { name: 'delete-event' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))
    await waitFor(() => expect(deleteEventMock).toHaveBeenCalledWith({ id: 'evt-1' }))
    expect(refreshMock).toHaveBeenCalled()
  })

  it('shows a toast and does not refresh when the event delete fails', async () => {
    deleteEventMock.mockResolvedValueOnce({ error: 'Not found' })
    const user = userEvent.setup()
    render(<EventHarness event={makeEvent()} />)
    await user.click(screen.getByRole('button', { name: 'delete-event' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Could not delete event'))
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
