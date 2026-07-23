import * as React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { CalendarClient } from './calendar-client'

// ── shared mock functions ──────────────────────────────────────────────────

const refreshMock = vi.fn()
const replaceMock = vi.fn()
const pushMock = vi.fn()
const createEventMock = vi.fn()
const updateEventMock = vi.fn()
const deleteEventMock = vi.fn()
const createActivityMock = vi.fn()
const updateActivityMock = vi.fn()
const toastErrorMock = vi.fn()

let capturedOnOpenChange: ((open: boolean) => void) | undefined
const onOpenChangeSpy = vi.fn<(open: boolean) => void>()

// ── module mocks ───────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, replace: replaceMock, push: pushMock }),
}))

vi.mock('@/server/actions/events', () => ({
  createEvent: (input: unknown) => createEventMock(input),
  updateEvent: (input: unknown) => updateEventMock(input),
  deleteEvent: (input: unknown) => deleteEventMock(input),
}))

vi.mock('@/server/actions/activities', () => ({
  createActivity: (input: unknown) => createActivityMock(input),
  updateActivity: (input: unknown) => updateActivityMock(input),
}))

// ── @/lib/ui mock ──────────────────────────────────────────────────────────

interface MockLibEvent {
  readonly id: string
  readonly title: string
  readonly start: string
  readonly end: string
  readonly color?: string
  readonly location?: string
  readonly description?: string
  readonly allDay?: boolean
  readonly completed?: boolean
  readonly completable?: boolean
  readonly locked?: boolean
  readonly activityId?: string | null
}

interface MockDayWindow {
  readonly wake: number
  readonly sleep: number
}

interface MockCreatePayload {
  readonly title: string
  readonly start: string
  readonly end: string
  readonly allDay?: boolean
  readonly color?: string
  readonly location?: string
  readonly description?: string
  readonly activityId?: string | null
}

interface MockActivityOption {
  readonly id: string
  readonly label: string
  readonly color?: string
  readonly defaultDurationMin?: number
}

interface MockCreateRequest {
  readonly slot: { readonly start: string; readonly end: string }
  readonly activityId?: string | null
  readonly draft?: {
    readonly title?: string
    readonly color?: string
    readonly location?: string
    readonly description?: string
  }
}

interface WeekCalendarViewProps {
  readonly defaultWeekStart?: string
  readonly events?: ReadonlyArray<MockLibEvent>
  readonly onEventMove?: (e: MockLibEvent) => void
  readonly onEventResize?: (e: MockLibEvent) => void
  readonly onEventDelete?: (e: MockLibEvent) => void
  readonly onEventEdit?: (e: MockLibEvent) => void
  readonly onEventEditActivity?: (e: MockLibEvent) => void
  readonly onEventDuplicate?: (e: MockLibEvent) => void
  readonly onEventCreate?: (e: MockCreatePayload) => void
  readonly onEventToggleComplete?: (e: MockLibEvent) => void
  readonly onEventToggleLock?: (e: MockLibEvent) => void
  readonly onCreateRequestDismiss?: () => void
  readonly createRequest?: MockCreateRequest | null
  readonly createActivityOptions?: ReadonlyArray<MockActivityOption>
  readonly onWeekChange?: (weekStart: string) => void
  readonly resyncToken?: string | number
  readonly hourStart?: number
  readonly hourCount?: number
  readonly sleepEnabled?: boolean
  readonly sleepStart?: number
  readonly sleepEnd?: number
  readonly dayWindows?: readonly MockDayWindow[]
  readonly use24h?: boolean
}

interface MockEventFormValues {
  readonly title: string
  readonly startAt?: string | null
  readonly endAt?: string | null
  readonly allDay?: boolean
  readonly color?: string | null
  readonly location?: string | null
  readonly description?: string | null
}

interface MockEventFormDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onSubmit: (values: MockEventFormValues) => void
  readonly initialValues?: Partial<MockEventFormValues>
  readonly use24h?: boolean
  readonly mode?: 'create' | 'edit'
}

interface MockActivityTemplateValues {
  readonly title: string
  readonly color?: string | null
  readonly description?: string | null
  readonly defaultLocation?: string | null
  readonly minDurationMin: number
  readonly maxDurationMin: number
  readonly weeklyTargetSessions: number
  readonly schedule: ReadonlyArray<{ day: number; startMinutes: number; durationMin: number }>
}

interface MockActivityTemplateDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onSubmit: (values: MockActivityTemplateValues) => void
  readonly initialValues?: Partial<MockActivityTemplateValues>
  readonly use24h?: boolean
}

// The library event the popover Edit action delivers; id matches EVENTS[0].
const STUB_EDIT_LIB_EVENT: MockLibEvent = {
  id: 'evt-1',
  title: 'Test event',
  start: '2026-01-06T09:00:00.000Z',
  end: '2026-01-06T10:00:00.000Z',
  color: 'blue',
  location: 'Gym',
  description: 'leg day',
  allDay: true,
}

// The FINISHED edit the app-owned EventFormDialog emits on Save.
const STUB_EDIT_VALUES: MockEventFormValues = {
  title: 'Edited title',
  startAt: '2026-01-06T09:30:00.000Z',
  endAt: '2026-01-06T10:30:00.000Z',
  allDay: false,
  color: 'violet',
  location: 'Office',
  description: 'notes',
}

// A minimal edit (all optional fields omitted) → exercises the ?? fallbacks.
const STUB_EDIT_VALUES_MIN: MockEventFormValues = { title: 'Minimal edit' }

const STUB_TEMPLATE_VALUES: MockActivityTemplateValues = {
  title: 'Running',
  color: 'blue',
  description: 'cardio',
  defaultLocation: 'Park',
  minDurationMin: 30,
  maxDurationMin: 60,
  weeklyTargetSessions: 3,
  schedule: [{ day: 1, startMinutes: 420, durationMin: 45 }],
}

// A minimal template (color/description/defaultLocation omitted) → exercises
// the ?? null fallbacks in both createActivity and the drawn-slot createEvent.
const STUB_TEMPLATE_VALUES_MIN: MockActivityTemplateValues = {
  title: 'Reading',
  minDurationMin: 20,
  maxDurationMin: 40,
  weeklyTargetSessions: 2,
  schedule: [],
}

vi.mock('@/lib/ui', () => ({
  WeekCalendarView: (props: WeekCalendarViewProps) => (
    <div
      data-testid="week-calendar-view"
      data-hour-start={props.hourStart !== undefined ? String(props.hourStart) : undefined}
      data-hour-count={props.hourCount !== undefined ? String(props.hourCount) : undefined}
      data-sleep-enabled={props.sleepEnabled !== undefined ? String(props.sleepEnabled) : undefined}
      data-has-event-click={String('onEventClick' in props)}
      // toLibraryEvent mapping assertions (evt-1 = null color → 'default').
      data-evt0-color={props.events?.[0]?.color ?? ''}
      data-evt0-all-day={String(props.events?.[0]?.allDay ?? '')}
      data-evt0-location={props.events?.[0]?.location ?? ''}
      data-evt0-description={props.events?.[0]?.description ?? ''}
      data-evt0-completed={String(props.events?.[0]?.completed ?? '')}
      data-evt0-completable={String(props.events?.[0]?.completable ?? '')}
      data-evt0-activity-id={props.events?.[0]?.activityId ?? ''}
      // evt-done: truthy color passes through; null activityId → undefined.
      data-evt1-color={props.events?.[1]?.color ?? ''}
      data-evt1-completed={String(props.events?.[1]?.completed ?? '')}
      data-evt1-activity-id={String(props.events?.[1]?.activityId ?? '')}
      // evt-locked: persisted lock flag seeded onto the library event.
      data-evt-locked={String(props.events?.find((e) => e.id === 'evt-locked')?.locked ?? '')}
      data-use24h={String(props.use24h ?? '')}
      data-day-windows-length={String(props.dayWindows?.length ?? '')}
      data-day-windows-wake0={String(props.dayWindows?.[0]?.wake ?? '')}
      data-resync-token={String(props.resyncToken ?? '')}
      // createRequest reopen contract (new-activity flow + duplicate).
      data-has-create-request={String(props.createRequest != null)}
      data-cr-start={props.createRequest?.slot.start ?? ''}
      data-cr-end={props.createRequest?.slot.end ?? ''}
      data-cr-activity={props.createRequest?.activityId ?? ''}
      data-cr-draft-title={props.createRequest?.draft?.title ?? ''}
      data-cr-draft-color={props.createRequest?.draft?.color ?? ''}
      data-cr-draft-location={props.createRequest?.draft?.location ?? ''}
      data-cr-draft-description={props.createRequest?.draft?.description ?? ''}
      // createActivityOptions built from the activities prop.
      data-activity-options={(props.createActivityOptions ?? [])
        .map((o) => `${o.id}:${o.label}:${o.color ?? 'none'}:${o.defaultDurationMin ?? ''}`)
        .join('|')}
      data-event-ids={(props.events ?? []).map((e) => e.id).join(',')}
      // A13: drag-create's "New activity…" picker entry is gated (lib 0.26.1) on
      // this prop being provided — the app no longer passes it.
      data-has-create-activity-request={String('onCreateActivityRequest' in props)}
    >
      <button
        type="button"
        onClick={() =>
          props.onEventCreate?.({
            title: 'Drawn',
            start: '2026-01-05T09:00:00.000Z',
            end: '2026-01-06T10:00:00.000Z',
            allDay: true,
            color: 'violet',
            location: 'Gym',
            description: 'leg day',
            activityId: 'act-1',
          })
        }
      >
        trigger-create
      </button>
      {/* Minimal create payload → exercises the ?? fallback branches. */}
      <button
        type="button"
        onClick={() =>
          props.onEventCreate?.({
            title: 'y',
            start: '2026-01-06T09:00:00.000Z',
            end: '2026-01-06T10:00:00.000Z',
          })
        }
      >
        trigger-create-min
      </button>
      <button type="button" onClick={() => props.onEventDelete?.(STUB_EDIT_LIB_EVENT)}>
        trigger-delete
      </button>
      <button type="button" onClick={() => props.onEventMove?.(STUB_EDIT_LIB_EVENT)}>
        trigger-move
      </button>
      <button type="button" onClick={() => props.onEventResize?.(STUB_EDIT_LIB_EVENT)}>
        trigger-resize
      </button>
      <button type="button" onClick={() => props.onEventEdit?.(STUB_EDIT_LIB_EVENT)}>
        trigger-edit
      </button>
      <button
        type="button"
        onClick={() => props.onEventEditActivity?.({ ...STUB_EDIT_LIB_EVENT, activityId: 'act-1' })}
      >
        trigger-edit-activity
      </button>
      <button
        type="button"
        onClick={() => props.onEventEditActivity?.({ ...STUB_EDIT_LIB_EVENT, activityId: 'act-2' })}
      >
        trigger-edit-activity-2
      </button>
      <button
        type="button"
        onClick={() => props.onEventEditActivity?.({ ...STUB_EDIT_LIB_EVENT, activityId: 'nope' })}
      >
        trigger-edit-activity-unknown
      </button>
      <button
        type="button"
        onClick={() => props.onEventToggleComplete?.({ ...STUB_EDIT_LIB_EVENT, completed: true })}
      >
        trigger-toggle-complete
      </button>
      <button
        type="button"
        onClick={() => props.onEventToggleComplete?.({ ...STUB_EDIT_LIB_EVENT, completed: false })}
      >
        trigger-toggle-uncomplete
      </button>
      <button type="button" onClick={() => props.onEventToggleLock?.({ ...STUB_EDIT_LIB_EVENT })}>
        trigger-toggle-lock
      </button>
      <button
        type="button"
        onClick={() => props.onEventToggleLock?.({ ...STUB_EDIT_LIB_EVENT, id: 'evt-locked' })}
      >
        trigger-toggle-unlock
      </button>
      <button type="button" onClick={() => props.onCreateRequestDismiss?.()}>
        trigger-create-request-dismiss
      </button>
      <button
        type="button"
        onClick={() =>
          props.onEventDuplicate?.({
            id: 'evt-dup',
            title: 'Dup title',
            start: '2026-01-07T14:00:00.000Z',
            end: '2026-01-07T15:00:00.000Z',
            color: 'green',
            location: 'Studio',
            description: 'practice',
            activityId: 'act-2',
          })
        }
      >
        trigger-duplicate
      </button>
      <button
        type="button"
        onClick={() =>
          props.onEventDuplicate?.({
            id: 'evt-dup-min',
            title: 'Bare',
            start: '2026-01-08T14:00:00.000Z',
            end: '2026-01-08T15:00:00.000Z',
          })
        }
      >
        trigger-duplicate-min
      </button>
      <button type="button" onClick={() => props.onWeekChange?.('2026-06-07')}>
        trigger-week-change
      </button>
    </div>
  ),
  SleepToggle: ({
    enabled,
    onToggle,
  }: {
    enabled: boolean
    onToggle: (enabled: boolean) => void
    className?: string
  }) => (
    <button type="button" onClick={() => onToggle(!enabled)}>
      sleep-toggle
    </button>
  ),
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
  toast: { error: (...args: unknown[]) => toastErrorMock(...args) },
  AlertDialog: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean
    onOpenChange?: (open: boolean) => void
    children: React.ReactNode
  }) => {
    capturedOnOpenChange = (next: boolean) => {
      onOpenChangeSpy(next)
      onOpenChange?.(next)
    }
    return open ? <div role="alertdialog">{children}</div> : null
  },
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => (
    <button type="button" onClick={() => capturedOnOpenChange?.(false)}>
      {children}
    </button>
  ),
  AlertDialogAction: ({
    children,
    onClick,
  }: {
    children: React.ReactNode
    onClick?: React.MouseEventHandler<HTMLButtonElement>
  }) => (
    <button
      type="button"
      onClick={(e) => {
        onClick?.(e)
        capturedOnOpenChange?.(false)
      }}
    >
      {children}
    </button>
  ),
}))

vi.mock('@/components/forms/event-form-dialog', () => ({
  EventFormDialog: (props: MockEventFormDialogProps) =>
    props.open ? (
      <div
        role="dialog"
        aria-label="event-form"
        data-initial-title={props.initialValues?.title ?? ''}
        data-initial-start={props.initialValues?.startAt ?? ''}
        data-initial-end={props.initialValues?.endAt ?? ''}
        data-initial-all-day={String(props.initialValues?.allDay ?? '')}
        data-initial-color={props.initialValues?.color ?? ''}
        data-initial-location={props.initialValues?.location ?? ''}
        data-initial-description={props.initialValues?.description ?? ''}
        data-use24h={String(props.use24h ?? '')}
        data-mode={props.mode ?? ''}
      >
        <button type="button" onClick={() => props.onSubmit(STUB_EDIT_VALUES)}>
          event-form-save
        </button>
        <button type="button" onClick={() => props.onSubmit(STUB_EDIT_VALUES_MIN)}>
          event-form-save-min
        </button>
        <button type="button" onClick={() => props.onOpenChange(false)}>
          event-form-close
        </button>
        <button type="button" onClick={() => props.onOpenChange(true)}>
          event-form-open-noop
        </button>
      </div>
    ) : null,
}))

vi.mock('@/components/forms/activity-template-dialog', () => ({
  ActivityTemplateDialog: (props: MockActivityTemplateDialogProps) =>
    props.open ? (
      <div
        role="dialog"
        aria-label="activity-template"
        data-use24h={String(props.use24h ?? '')}
        data-initial-title={props.initialValues?.title ?? ''}
        data-initial-color={props.initialValues?.color ?? ''}
        data-initial-description={props.initialValues?.description ?? ''}
        data-initial-location={props.initialValues?.defaultLocation ?? ''}
        data-initial-min={String(props.initialValues?.minDurationMin ?? '')}
        data-initial-max={String(props.initialValues?.maxDurationMin ?? '')}
        data-initial-weekly={String(props.initialValues?.weeklyTargetSessions ?? '')}
        data-initial-schedule-length={String(props.initialValues?.schedule?.length ?? '')}
      >
        <button type="button" onClick={() => props.onSubmit(STUB_TEMPLATE_VALUES)}>
          template-save
        </button>
        <button type="button" onClick={() => props.onSubmit(STUB_TEMPLATE_VALUES_MIN)}>
          template-save-min
        </button>
        <button type="button" onClick={() => props.onOpenChange(true)}>
          template-open-noop
        </button>
        <button type="button" onClick={() => props.onOpenChange(false)}>
          template-close
        </button>
      </div>
    ) : null,
}))

// ── test fixtures ──────────────────────────────────────────────────────────

const WEEK_START = '2026-01-06'
const DAY_WINDOWS = Array.from({ length: 7 }, () => ({ wake: 9, sleep: 17 }))

const EVENTS = [
  {
    id: 'evt-1',
    title: 'Test event',
    start: '2026-01-06T09:00:00.000Z',
    end: '2026-01-06T10:00:00.000Z',
    // Persisted null color must map to the library's 'default' variant.
    color: null,
    allDay: true,
    location: 'Gym',
    description: 'leg day',
    status: 'pending' as const,
    activityId: 'act-1',
  },
  {
    id: 'evt-done',
    title: 'Done event',
    start: '2026-01-06T09:00:00.000Z',
    end: '2026-01-06T10:00:00.000Z',
    color: 'violet',
    status: 'completed' as const,
    activityId: null,
  },
  {
    id: 'evt-locked',
    title: 'Locked event',
    start: '2026-01-06T20:00:00.000Z',
    end: '2026-01-06T21:00:00.000Z',
    status: 'pending' as const,
    locked: true,
    activityId: null,
  },
]

const ACTIVITIES = [
  {
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
  },
  {
    id: 'act-2',
    title: 'Reading',
    color: null,
    description: null,
    defaultLocation: null,
    minDurationMin: 45,
    maxDurationMin: 90,
    weeklyTargetSessions: 2,
    schedule: [],
    timeZone: null,
  },
]

function renderClient(): void {
  render(
    <CalendarClient
      weekStart={WEEK_START}
      events={EVENTS}
      activities={ACTIVITIES}
      wakeHour={9}
      sleepHour={17}
      dayWindows={DAY_WINDOWS}
      use24h={false}
    />,
  )
}

function resetMocks(): void {
  refreshMock.mockClear()
  replaceMock.mockClear()
  pushMock.mockClear()
  createEventMock.mockClear()
  createEventMock.mockResolvedValue({ data: { id: 'new-evt' } })
  updateEventMock.mockClear()
  updateEventMock.mockResolvedValue({ data: { id: 'evt-1' } })
  deleteEventMock.mockClear()
  deleteEventMock.mockResolvedValue({ data: { success: true } })
  createActivityMock.mockClear()
  createActivityMock.mockResolvedValue({ data: { id: 'act-new' } })
  updateActivityMock.mockClear()
  updateActivityMock.mockResolvedValue({ data: { id: 'act-1' } })
  toastErrorMock.mockClear()
  onOpenChangeSpy.mockClear()
  capturedOnOpenChange = undefined
}

// ── toLibraryEvent mapping ───────────────────────────────────────────────────

describe('CalendarClient — event mapping', () => {
  beforeEach(resetMocks)

  it('maps status, color, activityId, and passthrough fields onto library events', () => {
    renderClient()
    const view = screen.getByTestId('week-calendar-view')
    // evt-1: null color → 'default'; activityId threaded; passthrough fields.
    expect(view.dataset.evt0Color).toBe('default')
    expect(view.dataset.evt0AllDay).toBe('true')
    expect(view.dataset.evt0Location).toBe('Gym')
    expect(view.dataset.evt0Description).toBe('leg day')
    expect(view.dataset.evt0Completed).toBe('false')
    expect(view.dataset.evt0Completable).toBe('true')
    expect(view.dataset.evt0ActivityId).toBe('act-1')
    // evt-done: truthy color passes through; completed true; null activityId.
    expect(view.dataset.evt1Color).toBe('violet')
    expect(view.dataset.evt1Completed).toBe('true')
    expect(view.dataset.evt1ActivityId).toBe('')
    // evt-locked: persisted lock flag seeded.
    expect(view.dataset.evtLocked).toBe('true')
  })

  it('threads window/format props and never wires onEventClick', () => {
    renderClient()
    const view = screen.getByTestId('week-calendar-view')
    expect(view.dataset.hourStart).toBe('9')
    expect(view.dataset.hourCount).toBe('8')
    expect(view.dataset.use24h).toBe('false')
    expect(view.dataset.dayWindowsLength).toBe('7')
    expect(view.dataset.dayWindowsWake0).toBe('9')
    expect(view.dataset.hasEventClick).toBe('false')
  })

  it('builds createActivityOptions from the activities prop', () => {
    renderClient()
    const view = screen.getByTestId('week-calendar-view')
    // act-1: color 'blue', min 30; act-2: null color → none, min 45.
    expect(view.dataset.activityOptions).toBe('act-1:Running:blue:30|act-2:Reading:none:45')
  })
})

// ── create ───────────────────────────────────────────────────────────────────

describe('CalendarClient — create', () => {
  beforeEach(resetMocks)

  it('persists exactly one event via createEvent, threading activityId', async () => {
    const user = userEvent.setup()
    renderClient()

    await user.click(screen.getByRole('button', { name: 'trigger-create' }))

    await waitFor(() => expect(createEventMock).toHaveBeenCalledTimes(1))
    expect(createEventMock).toHaveBeenCalledWith({
      title: 'Drawn',
      startAt: '2026-01-05T09:00:00.000Z',
      endAt: '2026-01-06T10:00:00.000Z',
      allDay: true,
      color: 'violet',
      location: 'Gym',
      description: 'leg day',
      activityId: 'act-1',
    })
    expect(refreshMock).toHaveBeenCalled()
  })

  it('maps missing optional create fields to null / allDay:false / activityId:null', async () => {
    const user = userEvent.setup()
    renderClient()

    await user.click(screen.getByRole('button', { name: 'trigger-create-min' }))

    await waitFor(() =>
      expect(createEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'y',
          allDay: false,
          color: null,
          location: null,
          description: null,
          activityId: null,
        }),
      ),
    )
  })

  it('toasts on create error and still resyncs', async () => {
    createEventMock.mockResolvedValueOnce({ error: 'Too many requests' })
    const user = userEvent.setup()
    renderClient()

    await user.click(screen.getByRole('button', { name: 'trigger-create' }))

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Could not create event — calendar restored'),
    )
    expect(refreshMock).toHaveBeenCalled()
  })
})

// ── edit (app-owned EventFormDialog) ──────────────────────────────────────────

describe('CalendarClient — edit persistence', () => {
  beforeEach(resetMocks)

  it('opens the EventFormDialog seeded from the event and persists Save via updateEvent', async () => {
    const user = userEvent.setup()
    renderClient()

    await user.click(screen.getByRole('button', { name: 'trigger-edit' }))

    const dialog = await screen.findByRole('dialog', { name: 'event-form' })
    // Seeded from the event the popover Edit action delivered.
    expect(dialog.dataset.initialTitle).toBe('Test event')
    expect(dialog.dataset.initialStart).toBe('2026-01-06T09:00:00.000Z')
    expect(dialog.dataset.initialLocation).toBe('Gym')
    expect(dialog.dataset.mode).toBe('edit')

    await user.click(screen.getByRole('button', { name: 'event-form-save' }))

    await waitFor(() =>
      expect(updateEventMock).toHaveBeenCalledWith({
        id: 'evt-1',
        title: 'Edited title',
        startAt: '2026-01-06T09:30:00.000Z',
        endAt: '2026-01-06T10:30:00.000Z',
        allDay: false,
        color: 'violet',
        location: 'Office',
        description: 'notes',
      }),
    )
    expect(refreshMock).toHaveBeenCalled()
    // Dialog closes after submit.
    expect(screen.queryByRole('dialog', { name: 'event-form' })).not.toBeInTheDocument()
  })

  it('toasts and resyncs when the edit fails to persist', async () => {
    updateEventMock.mockResolvedValueOnce({ error: 'Not found' })
    const user = userEvent.setup()
    renderClient()

    const beforeNode = screen.getByTestId('week-calendar-view')
    await user.click(screen.getByRole('button', { name: 'trigger-edit' }))
    await user.click(screen.getByRole('button', { name: 'event-form-save' }))

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Could not save event — calendar restored'),
    )
    await waitFor(() => expect(beforeNode.dataset.resyncToken).toBe('1'))
    expect(refreshMock).toHaveBeenCalled()
  })

  it('maps omitted optional edit fields to null / allDay:false on Save', async () => {
    const user = userEvent.setup()
    renderClient()

    await user.click(screen.getByRole('button', { name: 'trigger-edit' }))
    await user.click(screen.getByRole('button', { name: 'event-form-save-min' }))

    await waitFor(() =>
      expect(updateEventMock).toHaveBeenCalledWith({
        id: 'evt-1',
        title: 'Minimal edit',
        startAt: null,
        endAt: null,
        allDay: false,
        color: null,
        location: null,
        description: null,
      }),
    )
  })

  it('closing the edit dialog clears it without persisting', async () => {
    const user = userEvent.setup()
    renderClient()

    await user.click(screen.getByRole('button', { name: 'trigger-edit' }))
    // The open-noop path (onOpenChange(true)) leaves the dialog open.
    await user.click(screen.getByRole('button', { name: 'event-form-open-noop' }))
    expect(screen.getByRole('dialog', { name: 'event-form' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'event-form-close' }))
    expect(screen.queryByRole('dialog', { name: 'event-form' })).not.toBeInTheDocument()
    expect(updateEventMock).not.toHaveBeenCalled()
  })
})

// ── move / resize ─────────────────────────────────────────────────────────────

describe('CalendarClient — move and resize', () => {
  beforeEach(resetMocks)

  it('persists a move via updateEvent with UTC ISO bounds', async () => {
    const user = userEvent.setup()
    renderClient()

    await user.click(screen.getByRole('button', { name: 'trigger-move' }))

    await waitFor(() =>
      expect(updateEventMock).toHaveBeenCalledWith({
        id: 'evt-1',
        startAt: '2026-01-06T09:00:00.000Z',
        endAt: '2026-01-06T10:00:00.000Z',
      }),
    )
    expect(refreshMock).toHaveBeenCalled()
  })

  it('wires resize to the same updateEvent path', async () => {
    const user = userEvent.setup()
    renderClient()
    await user.click(screen.getByRole('button', { name: 'trigger-resize' }))
    await waitFor(() => expect(updateEventMock).toHaveBeenCalled())
  })

  it('toasts and bumps the token in place on reschedule error (no remount)', async () => {
    updateEventMock.mockResolvedValueOnce({ error: 'Unauthorized' })
    const user = userEvent.setup()
    renderClient()

    const beforeNode = screen.getByTestId('week-calendar-view')
    await user.click(screen.getByRole('button', { name: 'trigger-move' }))

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Could not reschedule — calendar restored'),
    )
    await waitFor(() => expect(beforeNode.dataset.resyncToken).toBe('1'))
    expect(screen.getByTestId('week-calendar-view')).toBe(beforeNode)
    expect(refreshMock).toHaveBeenCalled()
  })
})

// ── complete toggle ───────────────────────────────────────────────────────────

describe('CalendarClient — complete toggle', () => {
  beforeEach(resetMocks)

  it('marks complete via updateEvent status completed (toggled-value direction)', async () => {
    const user = userEvent.setup()
    renderClient()
    await user.click(screen.getByRole('button', { name: 'trigger-toggle-complete' }))
    await waitFor(() =>
      expect(updateEventMock).toHaveBeenCalledWith({ id: 'evt-1', status: 'completed' }),
    )
    expect(refreshMock).toHaveBeenCalled()
  })

  it('marks incomplete via updateEvent status pending', async () => {
    const user = userEvent.setup()
    renderClient()
    await user.click(screen.getByRole('button', { name: 'trigger-toggle-uncomplete' }))
    await waitFor(() =>
      expect(updateEventMock).toHaveBeenCalledWith({ id: 'evt-1', status: 'pending' }),
    )
  })

  it('toasts the complete-direction message on failure', async () => {
    updateEventMock.mockResolvedValueOnce({ error: 'Not found' })
    const user = userEvent.setup()
    renderClient()
    await user.click(screen.getByRole('button', { name: 'trigger-toggle-complete' }))
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Could not mark complete'))
  })

  it('toasts the incomplete-direction message on failure', async () => {
    updateEventMock.mockResolvedValueOnce({ error: 'Not found' })
    const user = userEvent.setup()
    renderClient()
    await user.click(screen.getByRole('button', { name: 'trigger-toggle-uncomplete' }))
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Could not mark incomplete'))
  })
})

// ── lock toggle (server-truth flip) ──────────────────────────────────────────

describe('CalendarClient — lock toggle', () => {
  beforeEach(resetMocks)

  it('locks an unlocked row via updateEvent { id, locked: true }', async () => {
    const user = userEvent.setup()
    renderClient()
    await user.click(screen.getByRole('button', { name: 'trigger-toggle-lock' }))
    await waitFor(() => expect(updateEventMock).toHaveBeenCalledWith({ id: 'evt-1', locked: true }))
    expect(refreshMock).toHaveBeenCalled()
  })

  it('unlocks a locked row via updateEvent { id, locked: false }', async () => {
    const user = userEvent.setup()
    renderClient()
    await user.click(screen.getByRole('button', { name: 'trigger-toggle-unlock' }))
    await waitFor(() =>
      expect(updateEventMock).toHaveBeenCalledWith({ id: 'evt-locked', locked: false }),
    )
  })

  it('toasts and resyncs when the lock update fails', async () => {
    updateEventMock.mockResolvedValueOnce({ error: 'Not found' })
    const user = userEvent.setup()
    renderClient()
    const beforeNode = screen.getByTestId('week-calendar-view')
    await user.click(screen.getByRole('button', { name: 'trigger-toggle-lock' }))
    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Could not update lock — calendar restored'),
    )
    await waitFor(() => expect(beforeNode.dataset.resyncToken).toBe('1'))
  })
})

// ── delete ────────────────────────────────────────────────────────────────────

describe('CalendarClient — delete', () => {
  beforeEach(resetMocks)

  it('deletes via deleteEvent on confirm and bumps the token exactly once', async () => {
    const user = userEvent.setup()
    renderClient()
    const beforeNode = screen.getByTestId('week-calendar-view')

    await user.click(screen.getByRole('button', { name: 'trigger-delete' }))
    expect(await screen.findByText(/delete "Test event"/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(deleteEventMock).toHaveBeenCalledWith({ id: 'evt-1' }))
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
    await waitFor(() => expect(beforeNode.dataset.resyncToken).toBe('1'))
    // The confirmed close must NOT add a second immediate bump.
    expect(onOpenChangeSpy).toHaveBeenCalledWith(false)
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it('cancelling bumps the token immediately with no refresh', async () => {
    const user = userEvent.setup()
    renderClient()
    const beforeNode = screen.getByTestId('week-calendar-view')

    await user.click(screen.getByRole('button', { name: 'trigger-delete' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(beforeNode.dataset.resyncToken).toBe('1'))
    expect(refreshMock).not.toHaveBeenCalled()
    expect(deleteEventMock).not.toHaveBeenCalled()
  })

  it('toasts on delete error', async () => {
    deleteEventMock.mockResolvedValueOnce({ error: 'Not found' })
    const user = userEvent.setup()
    renderClient()

    await user.click(screen.getByRole('button', { name: 'trigger-delete' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Could not delete event'))
  })
})

// ── header "New activity" button ────────────────────────────────────────────

describe('CalendarClient — header New activity button', () => {
  beforeEach(resetMocks)

  it('does not pass onCreateActivityRequest to WeekCalendarView (drag-create picker entry dropped)', () => {
    renderClient()
    const view = screen.getByTestId('week-calendar-view')
    expect(view.dataset.hasCreateActivityRequest).toBe('false')
  })

  it('opens an empty ActivityTemplateDialog, creates via createActivity, and resyncs with no createRequest', async () => {
    const user = userEvent.setup()
    renderClient()
    const view = screen.getByTestId('week-calendar-view')

    await user.click(screen.getByRole('button', { name: 'New activity' }))
    const dialog = await screen.findByRole('dialog', { name: 'activity-template' })
    expect(dialog.dataset.initialTitle).toBe('')

    await user.click(screen.getByRole('button', { name: 'template-save' }))

    await waitFor(() =>
      expect(createActivityMock).toHaveBeenCalledWith({
        title: 'Running',
        color: 'blue',
        description: 'cardio',
        defaultLocation: 'Park',
        minDurationMin: 30,
        maxDurationMin: 60,
        weeklyTargetSessions: 3,
        schedule: [{ day: 1, startMinutes: 420, durationMin: 45 }],
        timeZone: expect.any(String),
      }),
    )
    // No follow-up event popover — the template dialog just closes.
    expect(screen.queryByRole('dialog', { name: 'activity-template' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'event-form' })).not.toBeInTheDocument()
    expect(view.dataset.hasCreateRequest).toBe('false')
    expect(refreshMock).toHaveBeenCalled()
  })

  it('toasts and still resyncs when the activity creation fails', async () => {
    createActivityMock.mockResolvedValueOnce({ error: 'Too many requests' })
    const user = userEvent.setup()
    renderClient()

    await user.click(screen.getByRole('button', { name: 'New activity' }))
    await user.click(screen.getByRole('button', { name: 'template-save' }))

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Could not create activity — calendar restored'),
    )
    expect(refreshMock).toHaveBeenCalled()
  })

  it('maps a minimal template submit to null optional fields', async () => {
    const user = userEvent.setup()
    renderClient()

    await user.click(screen.getByRole('button', { name: 'New activity' }))
    await user.click(screen.getByRole('button', { name: 'template-save-min' }))

    await waitFor(() =>
      expect(createActivityMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Reading',
          color: null,
          description: null,
          defaultLocation: null,
        }),
      ),
    )
  })

  it('closing the dialog clears it without creating anything', async () => {
    const user = userEvent.setup()
    renderClient()

    await user.click(screen.getByRole('button', { name: 'New activity' }))
    await user.click(screen.getByRole('button', { name: 'template-close' }))

    expect(screen.queryByRole('dialog', { name: 'activity-template' })).not.toBeInTheDocument()
    expect(createActivityMock).not.toHaveBeenCalled()
  })
})

// ── header "New event" button ───────────────────────────────────────────────

describe('CalendarClient — header New event button', () => {
  beforeEach(resetMocks)
  afterEach(() => vi.useRealTimers())

  it('seeds the dialog with today, the next full hour, and a 1h duration', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-06T14:22:00.000Z'))
    renderClient()

    fireEvent.click(screen.getByRole('button', { name: 'New event' }))

    const dialog = screen.getByRole('dialog', { name: 'event-form' })
    expect(dialog.dataset.initialStart).toBe('2026-01-06T15:00:00.000Z')
    expect(dialog.dataset.initialEnd).toBe('2026-01-06T16:00:00.000Z')
    expect(dialog.dataset.initialAllDay).toBe('false')
    expect(dialog.dataset.mode).toBe('create')
  })

  it('creates a standalone event (activityId null) via createEvent and resyncs on submit', async () => {
    const user = userEvent.setup()
    renderClient()

    await user.click(screen.getByRole('button', { name: 'New event' }))
    await user.click(screen.getByRole('button', { name: 'event-form-save' }))

    await waitFor(() =>
      expect(createEventMock).toHaveBeenCalledWith({
        title: 'Edited title',
        startAt: '2026-01-06T09:30:00.000Z',
        endAt: '2026-01-06T10:30:00.000Z',
        allDay: false,
        color: 'violet',
        location: 'Office',
        description: 'notes',
        activityId: null,
      }),
    )
    expect(screen.queryByRole('dialog', { name: 'event-form' })).not.toBeInTheDocument()
    expect(refreshMock).toHaveBeenCalled()
  })

  it('maps omitted optional fields to null / allDay:false with activityId null on a minimal submit', async () => {
    const user = userEvent.setup()
    renderClient()

    await user.click(screen.getByRole('button', { name: 'New event' }))
    await user.click(screen.getByRole('button', { name: 'event-form-save-min' }))

    await waitFor(() =>
      expect(createEventMock).toHaveBeenCalledWith({
        title: 'Minimal edit',
        startAt: null,
        endAt: null,
        allDay: false,
        color: null,
        location: null,
        description: null,
        activityId: null,
      }),
    )
  })

  it('toasts and still resyncs when the event creation fails', async () => {
    createEventMock.mockResolvedValueOnce({ error: 'Too many requests' })
    const user = userEvent.setup()
    renderClient()

    await user.click(screen.getByRole('button', { name: 'New event' }))
    await user.click(screen.getByRole('button', { name: 'event-form-save' }))

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Could not create event — calendar restored'),
    )
    expect(refreshMock).toHaveBeenCalled()
  })

  it('closing the dialog clears it without creating anything', async () => {
    const user = userEvent.setup()
    renderClient()

    await user.click(screen.getByRole('button', { name: 'New event' }))
    // The open-noop path (onOpenChange(true)) leaves the dialog open.
    await user.click(screen.getByRole('button', { name: 'event-form-open-noop' }))
    expect(screen.getByRole('dialog', { name: 'event-form' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'event-form-close' }))
    expect(screen.queryByRole('dialog', { name: 'event-form' })).not.toBeInTheDocument()
    expect(createEventMock).not.toHaveBeenCalled()
  })
})

// ── create-request dismiss (still reachable via Duplicate) ──────────────────

describe('CalendarClient — create-request dismiss', () => {
  beforeEach(resetMocks)

  it('clears createRequest and resyncs to reveal generated events on dismiss', async () => {
    const user = userEvent.setup()
    renderClient()
    const view = screen.getByTestId('week-calendar-view')

    // Open a createRequest via Duplicate — the only remaining path in
    // (createRequest STAYS for Duplicate; the new-activity path was dropped).
    await user.click(screen.getByRole('button', { name: 'trigger-duplicate' }))
    await waitFor(() => expect(view.dataset.hasCreateRequest).toBe('true'))
    expect(refreshMock).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'trigger-create-request-dismiss' }))

    await waitFor(() => expect(view.dataset.hasCreateRequest).toBe('false'))
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
    expect(createEventMock).not.toHaveBeenCalled()
  })
})

// ── duplicate event ───────────────────────────────────────────────────────────

describe('CalendarClient — duplicate event', () => {
  beforeEach(resetMocks)

  it('sets createRequest from the source event bounds, activity, and draft fields', async () => {
    const user = userEvent.setup()
    renderClient()
    const view = screen.getByTestId('week-calendar-view')

    await user.click(screen.getByRole('button', { name: 'trigger-duplicate' }))

    await waitFor(() => expect(view.dataset.hasCreateRequest).toBe('true'))
    expect(view.dataset.crStart).toBe('2026-01-07T14:00:00.000Z')
    expect(view.dataset.crEnd).toBe('2026-01-07T15:00:00.000Z')
    expect(view.dataset.crActivity).toBe('act-2')
    expect(view.dataset.crDraftTitle).toBe('Dup title')
    expect(view.dataset.crDraftColor).toBe('green')
    expect(view.dataset.crDraftLocation).toBe('Studio')
    expect(view.dataset.crDraftDescription).toBe('practice')
    // Duplicate is inert beyond the reopen — no server write, no refresh.
    expect(createEventMock).not.toHaveBeenCalled()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('maps a standalone event with no optional fields to a null activity and empty draft', async () => {
    const user = userEvent.setup()
    renderClient()
    const view = screen.getByTestId('week-calendar-view')

    await user.click(screen.getByRole('button', { name: 'trigger-duplicate-min' }))

    await waitFor(() => expect(view.dataset.hasCreateRequest).toBe('true'))
    // activityId undefined → null → renders empty.
    expect(view.dataset.crActivity).toBe('')
    expect(view.dataset.crDraftTitle).toBe('Bare')
    expect(view.dataset.crDraftColor).toBe('')
    expect(view.dataset.crDraftLocation).toBe('')
    expect(view.dataset.crDraftDescription).toBe('')
  })

  it('re-seeds createRequest to the second source when duplicated again with no dismiss', async () => {
    const user = userEvent.setup()
    renderClient()
    const view = screen.getByTestId('week-calendar-view')

    // Duplicate A, then B with NO intervening dismiss — each setCreateRequest is
    // a fresh object literal, so state re-seeds to B (the library's identity
    // check reopens on the new value).
    await user.click(screen.getByRole('button', { name: 'trigger-duplicate' }))
    await waitFor(() => expect(view.dataset.crDraftTitle).toBe('Dup title'))
    expect(view.dataset.crStart).toBe('2026-01-07T14:00:00.000Z')

    await user.click(screen.getByRole('button', { name: 'trigger-duplicate-min' }))
    await waitFor(() => expect(view.dataset.crDraftTitle).toBe('Bare'))
    expect(view.dataset.crStart).toBe('2026-01-08T14:00:00.000Z')
    expect(view.dataset.crActivity).toBe('')
    expect(view.dataset.hasCreateRequest).toBe('true')
  })
})

// ── in-calendar activity edit ─────────────────────────────────────────────────

describe('CalendarClient — edit activity (in-calendar)', () => {
  beforeEach(resetMocks)

  it('opens the ActivityTemplateDialog seeded from the event activity, without navigating', async () => {
    const user = userEvent.setup()
    renderClient()

    await user.click(screen.getByRole('button', { name: 'trigger-edit-activity' }))

    const dialog = await screen.findByRole('dialog', { name: 'activity-template' })
    // Seeded from act-1 (threaded via the activities prop).
    expect(dialog.dataset.initialTitle).toBe('Running')
    expect(dialog.dataset.initialColor).toBe('blue')
    expect(dialog.dataset.initialDescription).toBe('cardio')
    expect(dialog.dataset.initialLocation).toBe('Park')
    expect(dialog.dataset.initialMin).toBe('30')
    expect(dialog.dataset.initialMax).toBe('60')
    expect(dialog.dataset.initialWeekly).toBe('3')
    expect(dialog.dataset.initialScheduleLength).toBe('1')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('persists the edited activity via updateActivity and resyncs', async () => {
    const user = userEvent.setup()
    renderClient()

    await user.click(screen.getByRole('button', { name: 'trigger-edit-activity' }))
    await user.click(screen.getByRole('button', { name: 'template-save' }))

    await waitFor(() =>
      expect(updateActivityMock).toHaveBeenCalledWith({
        id: 'act-1',
        title: 'Running',
        color: 'blue',
        description: 'cardio',
        defaultLocation: 'Park',
        minDurationMin: 30,
        maxDurationMin: 60,
        weeklyTargetSessions: 3,
        schedule: [{ day: 1, startMinutes: 420, durationMin: 45 }],
        timeZone: expect.any(String),
      }),
    )
    expect(refreshMock).toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'activity-template' })).not.toBeInTheDocument()
  })

  it('toasts and resyncs when the activity update fails', async () => {
    updateActivityMock.mockResolvedValueOnce({ error: 'Not found' })
    const user = userEvent.setup()
    renderClient()

    const beforeNode = screen.getByTestId('week-calendar-view')
    await user.click(screen.getByRole('button', { name: 'trigger-edit-activity' }))
    await user.click(screen.getByRole('button', { name: 'template-save' }))

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Could not save activity — calendar restored'),
    )
    await waitFor(() => expect(beforeNode.dataset.resyncToken).toBe('1'))
    expect(refreshMock).toHaveBeenCalled()
  })

  it('closing the edit-activity dialog clears it without persisting', async () => {
    const user = userEvent.setup()
    renderClient()

    await user.click(screen.getByRole('button', { name: 'trigger-edit-activity' }))
    // open-noop leaves it open.
    await user.click(screen.getByRole('button', { name: 'template-open-noop' }))
    expect(screen.getByRole('dialog', { name: 'activity-template' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'template-close' }))
    expect(screen.queryByRole('dialog', { name: 'activity-template' })).not.toBeInTheDocument()
    expect(updateActivityMock).not.toHaveBeenCalled()
  })

  it('ignores an edit-activity request for an unknown activity id', async () => {
    const user = userEvent.setup()
    renderClient()

    await user.click(screen.getByRole('button', { name: 'trigger-edit-activity-unknown' }))
    expect(screen.queryByRole('dialog', { name: 'activity-template' })).not.toBeInTheDocument()
    expect(updateActivityMock).not.toHaveBeenCalled()
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('seeds null activity fields as empty and maps omitted edit fields to null on save', async () => {
    const user = userEvent.setup()
    renderClient()

    // act-2 has null color/description/defaultLocation → empty seed attrs.
    await user.click(screen.getByRole('button', { name: 'trigger-edit-activity-2' }))
    const dialog = await screen.findByRole('dialog', { name: 'activity-template' })
    expect(dialog.dataset.initialTitle).toBe('Reading')
    expect(dialog.dataset.initialColor).toBe('')
    expect(dialog.dataset.initialDescription).toBe('')
    expect(dialog.dataset.initialLocation).toBe('')

    // A min template submit → the ?? null fallbacks in updateActivity fire.
    await user.click(screen.getByRole('button', { name: 'template-save-min' }))
    await waitFor(() =>
      expect(updateActivityMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'act-2',
          color: null,
          description: null,
          defaultLocation: null,
        }),
      ),
    )
  })
})

// ── week URL sync ─────────────────────────────────────────────────────────────

describe('CalendarClient — navigation', () => {
  beforeEach(resetMocks)

  it('writes ?week= via router.replace on week change, preserving other params', async () => {
    window.history.replaceState({}, '', '/calendar?q=gym')
    const user = userEvent.setup()
    renderClient()
    await user.click(screen.getByRole('button', { name: 'trigger-week-change' }))
    expect(replaceMock).toHaveBeenCalledWith('?q=gym&week=2026-06-07', { scroll: false })
    expect(refreshMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('week-calendar-view').dataset.resyncToken).toBe('0')
  })
})

// ── sleep toggle ──────────────────────────────────────────────────────────────

describe('CalendarClient — sleep toggle', () => {
  beforeEach(resetMocks)

  it('switches to a full-day grid when the sleep toggle is turned off', async () => {
    const user = userEvent.setup()
    renderClient()
    const view = screen.getByTestId('week-calendar-view')
    expect(view.dataset.sleepEnabled).toBe('false')
    expect(view.dataset.hourStart).toBe('9')

    await user.click(screen.getByRole('button', { name: 'sleep-toggle' }))

    expect(view.dataset.sleepEnabled).toBe('true')
    expect(view.dataset.hourStart).toBe('0')
    expect(view.dataset.hourCount).toBe('24')
  })
})
