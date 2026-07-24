import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import {
  ActivityTable,
  OneOffEventsTable,
  SeriesTable,
  type ActivityRow,
  type OneOffEventRow,
  type StandaloneSeriesRow,
} from './activity-table'
import type { SeriesActionsRow } from './use-activity-actions'

const refreshMock = vi.fn()
const toastErrorMock = vi.fn()

// Pin TZ so next-event/when formatting is deterministic across machines/CI.
const ORIGINAL_TZ = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'America/New_York'
})
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

vi.mock('@/server/actions/activities', () => ({
  updateActivity: vi.fn().mockResolvedValue({ data: {} }),
  deleteActivity: vi.fn().mockResolvedValue({ data: { success: true } }),
}))

vi.mock('@/server/actions/events', () => ({
  updateEvent: vi.fn().mockResolvedValue({ data: {} }),
  deleteEvent: vi.fn().mockResolvedValue({ data: { success: true } }),
}))

const updateSeriesMock = vi.fn().mockResolvedValue({ data: {} })
const deleteSeriesMock = vi.fn().mockResolvedValue({ data: { success: true } })

vi.mock('@/server/actions/series', () => ({
  updateSeries: (input: unknown) => updateSeriesMock(input),
  deleteSeries: (input: unknown) => deleteSeriesMock(input),
}))

// Keep the real @/lib/ui (DataTable, Progress, Badge, Button, Table) but stub
// toast and surface the dialogs' data props so seeding/deep-link contracts show.
vi.mock('@/lib/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ui')>()),
  toast: { error: (...args: unknown[]) => toastErrorMock(...args) },
}))

vi.mock('@/components/forms/activity-template-dialog', () => ({
  ActivityTemplateDialog: ({
    open,
    initialValues,
  }: {
    open: boolean
    initialValues?: { title?: string }
  }) =>
    open ? (
      <div role="dialog" aria-label="activity-template" data-initial-title={initialValues?.title} />
    ) : null,
}))

vi.mock('@/components/forms/event-form-dialog', () => ({
  EventFormDialog: ({
    open,
    initialValues,
    showRecurrence,
  }: {
    open: boolean
    initialValues?: { title?: string }
    showRecurrence?: boolean
  }) =>
    open ? (
      <div
        role="dialog"
        aria-label="event-form"
        data-initial-title={initialValues?.title}
        data-show-recurrence={String(showRecurrence ?? 'default')}
      />
    ) : null,
}))

function makeSeriesActionsRow(over: Partial<SeriesActionsRow> = {}): SeriesActionsRow {
  return {
    id: 'series-1',
    title: 'Stretch',
    description: 'daily notes',
    location: 'Home',
    color: '#22c55e',
    visibility: 'private',
    freq: 'weekly',
    weekdays: [1, 3, 5],
    dayOfMonth: null,
    nthOrdinal: null,
    nthWeekday: null,
    month: null,
    startMinutes: 540,
    durationMin: 30,
    until: null,
    ...over,
  }
}

function makeActivityRow(over: Partial<ActivityRow> = {}): ActivityRow {
  return {
    id: 'act-1',
    title: 'Running',
    color: '#3b82f6',
    description: 'cardio',
    defaultLocation: 'Park',
    minDurationMin: 30,
    maxDurationMin: 60,
    weeklyTargetSessions: 3,
    series: [makeSeriesActionsRow()],
    completedThisWeek: 2,
    nextEventIso: '2026-07-02T20:00:00.000Z',
    ...over,
  }
}

function makeEventRow(over: Partial<OneOffEventRow> = {}): OneOffEventRow {
  return {
    id: 'evt-1',
    title: 'Dentist',
    startAt: '2026-07-02T20:00:00.000Z',
    endAt: '2026-07-02T21:00:00.000Z',
    allDay: false,
    color: '#ef4444',
    location: 'Clinic',
    description: 'checkup',
    status: 'pending',
    visibility: 'private',
    ...over,
  }
}

function makeStandaloneSeriesRow(over: Partial<StandaloneSeriesRow> = {}): StandaloneSeriesRow {
  return {
    ...makeSeriesActionsRow(),
    nextOccurrenceIso: '2026-07-06T13:00:00.000Z',
    ...over,
  }
}

describe('ActivityTable', () => {
  beforeEach(() => {
    refreshMock.mockClear()
    toastErrorMock.mockClear()
  })

  it('renders the activity title and color dot', () => {
    render(<ActivityTable items={[makeActivityRow()]} />)
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(document.querySelector('[data-color="#3b82f6"]')).toBeInTheDocument()
  })

  it('renders the series label(s) for an activity with series', () => {
    render(<ActivityTable items={[makeActivityRow()]} />)
    expect(screen.getByText('Mon/Wed/Fri · 9:00 AM · 30m')).toBeInTheDocument()
  })

  it('renders one label line per series for an activity with multiple series', () => {
    render(
      <ActivityTable
        items={[
          makeActivityRow({
            series: [
              makeSeriesActionsRow({ id: 's1', title: 'Morning stretch', startMinutes: 480 }),
              makeSeriesActionsRow({ id: 's2', title: 'Evening stretch', startMinutes: 1200 }),
            ],
          }),
        ]}
      />,
    )
    expect(screen.getByText('Mon/Wed/Fri · 8:00 AM · 30m')).toBeInTheDocument()
    expect(screen.getByText('Mon/Wed/Fri · 8:00 PM · 30m')).toBeInTheDocument()
  })

  it('renders "No series" for an activity with no series', () => {
    render(<ActivityTable items={[makeActivityRow({ series: [] })]} />)
    expect(screen.getByText('No series')).toBeInTheDocument()
  })

  it('appends the "ends" suffix when a series has an until date', () => {
    render(
      <ActivityTable
        items={[
          makeActivityRow({
            series: [makeSeriesActionsRow({ until: '2026-12-31T18:00:00.000Z' })],
          }),
        ]}
      />,
    )
    expect(screen.getByText(/ends 12\/31\/2026/)).toBeInTheDocument()
  })

  it('renders edit/delete series controls inline per series, scoped to that series title', async () => {
    const user = userEvent.setup()
    render(<ActivityTable items={[makeActivityRow()]} />)
    await user.click(screen.getByRole('button', { name: 'Edit series: Stretch' }))
    const dialog = screen.getByRole('dialog', { name: 'event-form' })
    expect(dialog).toBeInTheDocument()
    // Series edit site — showRecurrence is left at its default (Repeat stays on).
    expect(dialog).toHaveAttribute('data-show-recurrence', 'default')
  })

  it('opens the two-mode series delete confirm from the inline delete control', async () => {
    const user = userEvent.setup()
    render(<ActivityTable items={[makeActivityRow()]} />)
    await user.click(screen.getByRole('button', { name: 'Delete series: Stretch' }))
    expect(screen.getByText('Delete this series?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep events' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete future events too' })).toBeInTheDocument()
  })

  it('renders the weekly-fit count and a progress bar', () => {
    render(
      <ActivityTable
        items={[makeActivityRow({ completedThisWeek: 2, weeklyTargetSessions: 3 })]}
      />,
    )
    expect(screen.getByText('2 of 3')).toBeInTheDocument()
    // 2/3 → 67%.
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '67')
  })

  it('clamps the progress bar at 100% when over target', () => {
    render(
      <ActivityTable
        items={[makeActivityRow({ completedThisWeek: 5, weeklyTargetSessions: 3 })]}
      />,
    )
    expect(screen.getByText('5 of 3')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })

  it('formats the next event time (12-hour by default)', () => {
    render(<ActivityTable items={[makeActivityRow()]} />)
    // 2026-07-02T20:00Z → 4:00 PM in America/New_York.
    expect(screen.getByText(/Jul 2/)).toHaveTextContent('4:00 PM')
  })

  it('formats the next event time as 24-hour when use24h is set', () => {
    render(<ActivityTable items={[makeActivityRow()]} use24h />)
    expect(screen.getByText(/Jul 2/)).toHaveTextContent('16:00')
  })

  it('renders an em dash when the activity has no next event', () => {
    render(<ActivityTable items={[makeActivityRow({ nextEventIso: null })]} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders edit and delete action controls per row', () => {
    render(<ActivityTable items={[makeActivityRow()]} />)
    expect(screen.getByRole('button', { name: 'Edit activity' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete activity' })).toBeInTheDocument()
  })

  it('does not auto-open any dialog without a matching initialEditId', () => {
    render(<ActivityTable items={[makeActivityRow()]} />)
    expect(screen.queryByRole('dialog', { name: 'activity-template' })).not.toBeInTheDocument()
  })

  it('auto-opens the template dialog for the row matching initialEditId, seeded from that row', () => {
    render(
      <ActivityTable
        items={[
          makeActivityRow({ id: 'a', title: 'Running' }),
          makeActivityRow({ id: 'b', title: 'Swimming' }),
        ]}
        initialEditId="b"
      />,
    )
    const dialog = screen.getByRole('dialog', { name: 'activity-template' })
    expect(dialog).toHaveAttribute('data-initial-title', 'Swimming')
  })

  it('does not auto-open when initialEditId matches no row', () => {
    render(<ActivityTable items={[makeActivityRow({ id: 'a' })]} initialEditId="missing" />)
    expect(screen.queryByRole('dialog', { name: 'activity-template' })).not.toBeInTheDocument()
  })

  it('renders one row per activity', () => {
    render(
      <ActivityTable
        items={[
          makeActivityRow({ id: 'a', title: 'Running' }),
          makeActivityRow({ id: 'b', title: 'Swimming' }),
        ]}
      />,
    )
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText('Swimming')).toBeInTheDocument()
  })

  // Sorting invokes each column's accessorFn (derived sort keys).
  it('sorts by the derived pattern, weekly-fit, and next-event columns', async () => {
    const user = userEvent.setup()
    render(
      <ActivityTable
        items={[
          makeActivityRow({
            id: 'a',
            title: 'Running',
            completedThisWeek: 1,
            series: [],
            nextEventIso: null,
          }),
          makeActivityRow({
            id: 'b',
            title: 'Swimming',
            completedThisWeek: 3,
            nextEventIso: '2026-07-05T20:00:00.000Z',
          }),
        ]}
      />,
    )
    await user.click(screen.getByRole('columnheader', { name: /Pattern/ }))
    await user.click(screen.getByRole('columnheader', { name: /This week/ }))
    await user.click(screen.getByRole('columnheader', { name: /Next event/ }))
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText('Swimming')).toBeInTheDocument()
  })
})

describe('OneOffEventsTable', () => {
  beforeEach(() => {
    refreshMock.mockClear()
    toastErrorMock.mockClear()
  })

  it('renders the event title, when, and status', () => {
    render(<OneOffEventsTable items={[makeEventRow()]} />)
    expect(screen.getByText('Dentist')).toBeInTheDocument()
    expect(screen.getByText(/Jul 2/)).toHaveTextContent('4:00 PM')
    expect(screen.getByText('pending')).toBeInTheDocument()
  })

  it('formats when as 24-hour and shows completed status', () => {
    render(<OneOffEventsTable items={[makeEventRow({ status: 'completed' })]} use24h />)
    expect(screen.getByText(/Jul 2/)).toHaveTextContent('16:00')
    expect(screen.getByText('completed')).toBeInTheDocument()
  })

  it('shows "No time set" when the event has no start time', () => {
    render(<OneOffEventsTable items={[makeEventRow({ startAt: null })]} />)
    expect(screen.getByText('No time set')).toBeInTheDocument()
  })

  it('labels the complete toggle "Mark complete" for a pending event', () => {
    render(<OneOffEventsTable items={[makeEventRow({ status: 'pending' })]} />)
    expect(screen.getByRole('button', { name: 'Mark complete' })).toBeInTheDocument()
  })

  it('labels the complete toggle "Mark pending" for a completed event', () => {
    render(<OneOffEventsTable items={[makeEventRow({ status: 'completed' })]} />)
    expect(screen.getByRole('button', { name: 'Mark pending' })).toBeInTheDocument()
  })

  it('renders edit and delete controls per event row', () => {
    render(<OneOffEventsTable items={[makeEventRow()]} />)
    expect(screen.getByRole('button', { name: 'Edit event' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete event' })).toBeInTheDocument()
  })

  it('renders one row per event', () => {
    render(
      <OneOffEventsTable
        items={[
          makeEventRow({ id: 'a', title: 'Dentist' }),
          makeEventRow({ id: 'b', title: 'Haircut' }),
        ]}
      />,
    )
    const rows = screen.getAllByRole('button', { name: 'Edit event' })
    expect(rows).toHaveLength(2)
    expect(screen.getByText('Dentist')).toBeInTheDocument()
    expect(screen.getByText('Haircut')).toBeInTheDocument()
  })

  it('sorts by the one-off "When" column (accessorFn)', async () => {
    const user = userEvent.setup()
    render(
      <OneOffEventsTable
        items={[
          makeEventRow({ id: 'a', title: 'Dentist' }),
          makeEventRow({ id: 'b', title: 'Haircut', startAt: null }),
        ]}
      />,
    )
    await user.click(screen.getByRole('columnheader', { name: /When/ }))
    expect(screen.getByText('Dentist')).toBeInTheDocument()
    expect(screen.getByText('Haircut')).toBeInTheDocument()
  })

  it('renders a color dot when the event carries a color', () => {
    render(<OneOffEventsTable items={[makeEventRow()]} />)
    expect(document.querySelector('[data-color="#ef4444"]')).toBeInTheDocument()
  })

  it('omits the color dot when the event has no color', () => {
    render(<OneOffEventsTable items={[makeEventRow({ color: null })]} />)
    expect(screen.getByText('Dentist')).toBeInTheDocument()
    expect(document.querySelector('[data-color]')).toBeNull()
  })
})

describe('SeriesTable', () => {
  beforeEach(() => {
    refreshMock.mockClear()
    toastErrorMock.mockClear()
    updateSeriesMock.mockClear().mockResolvedValue({ data: {} })
    deleteSeriesMock.mockClear().mockResolvedValue({ data: { success: true } })
  })

  it('renders the series title, pattern label, and next occurrence', () => {
    render(<SeriesTable items={[makeStandaloneSeriesRow()]} />)
    expect(screen.getByText('Stretch')).toBeInTheDocument()
    expect(screen.getByText('Mon/Wed/Fri · 9:00 AM · 30m')).toBeInTheDocument()
    // 2026-07-06T13:00Z → 9:00 AM in America/New_York (EDT, UTC-4 in July).
    expect(screen.getByText(/Jul 6/)).toHaveTextContent('9:00 AM')
  })

  it('formats the next occurrence as 24-hour when use24h is set', () => {
    render(<SeriesTable items={[makeStandaloneSeriesRow()]} use24h />)
    expect(screen.getByText(/Jul 6/)).toHaveTextContent('9:00')
  })

  it('renders an em dash when the series has no next occurrence', () => {
    render(<SeriesTable items={[makeStandaloneSeriesRow({ nextOccurrenceIso: null })]} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders a color dot when the series carries a color', () => {
    render(<SeriesTable items={[makeStandaloneSeriesRow({ color: '#22c55e' })]} />)
    expect(document.querySelector('[data-color="#22c55e"]')).toBeInTheDocument()
  })

  it('omits the color dot when the series has no color', () => {
    render(<SeriesTable items={[makeStandaloneSeriesRow({ color: null })]} />)
    expect(document.querySelector('[data-color]')).toBeNull()
  })

  it('renders edit and delete controls per series row', () => {
    render(<SeriesTable items={[makeStandaloneSeriesRow()]} />)
    expect(screen.getByRole('button', { name: 'Edit series' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete series' })).toBeInTheDocument()
  })

  it('renders one row per series', () => {
    render(
      <SeriesTable
        items={[
          makeStandaloneSeriesRow({ id: 'a', title: 'Stretch' }),
          makeStandaloneSeriesRow({ id: 'b', title: 'Journal' }),
        ]}
      />,
    )
    expect(screen.getByText('Stretch')).toBeInTheDocument()
    expect(screen.getByText('Journal')).toBeInTheDocument()
  })

  it('opens the edit dialog for a series row', async () => {
    const user = userEvent.setup()
    render(<SeriesTable items={[makeStandaloneSeriesRow()]} />)
    await user.click(screen.getByRole('button', { name: 'Edit series' }))
    const dialog = screen.getByRole('dialog', { name: 'event-form' })
    expect(dialog).toBeInTheDocument()
    // Series edit site — showRecurrence is left at its default (Repeat stays on).
    expect(dialog).toHaveAttribute('data-show-recurrence', 'default')
  })

  it('opens the two-mode delete confirm and calls deleteSeries with the picked mode', async () => {
    const user = userEvent.setup()
    render(<SeriesTable items={[makeStandaloneSeriesRow()]} />)
    await user.click(screen.getByRole('button', { name: 'Delete series' }))
    await user.click(screen.getByRole('button', { name: 'Delete future events too' }))
    expect(deleteSeriesMock).toHaveBeenCalledWith({ id: 'series-1', mode: 'deleteFuture' })
  })

  it('sorts by the derived pattern and next-occurrence columns (accessorFn)', async () => {
    const user = userEvent.setup()
    render(
      <SeriesTable
        items={[
          makeStandaloneSeriesRow({ id: 'a', title: 'Stretch', nextOccurrenceIso: null }),
          makeStandaloneSeriesRow({ id: 'b', title: 'Journal' }),
        ]}
      />,
    )
    await user.click(screen.getByRole('columnheader', { name: /Pattern/ }))
    await user.click(screen.getByRole('columnheader', { name: /Next occurrence/ }))
    expect(screen.getByText('Stretch')).toBeInTheDocument()
    expect(screen.getByText('Journal')).toBeInTheDocument()
  })
})
