import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import {
  ActivityTable,
  OneOffEventsTable,
  type ActivityRow,
  type OneOffEventRow,
} from './activity-table'

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

// Keep the real @/lib/ui (DataTable, Progress, Badge, Button, Table) but stub
// toast and surface the dialogs' data props so seeding/deep-link contracts show.
vi.mock('@/lib/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ui')>()),
  toast: { error: (...args: unknown[]) => toastErrorMock(...args) },
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
  EventFormDialog: ({
    open,
    initialValues,
  }: {
    open: boolean
    initialValues?: { title?: string }
  }) =>
    open ? (
      <div role="dialog" aria-label="event-form" data-initial-title={initialValues?.title} />
    ) : null,
}))

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
    schedule: [
      { day: 1, startMinutes: 420, durationMin: 45 },
      { day: 3, startMinutes: 420, durationMin: 45 },
      { day: 5, startMinutes: 420, durationMin: 45 },
    ],
    timeZone: 'America/New_York',
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

  it('renders the pattern label for a scheduled activity', () => {
    render(<ActivityTable items={[makeActivityRow()]} />)
    expect(screen.getByText('Mon/Wed/Fri · 3×/wk')).toBeInTheDocument()
  })

  it('renders "No schedule" for an activity with an empty schedule', () => {
    render(<ActivityTable items={[makeActivityRow({ schedule: [] })]} />)
    expect(screen.getByText('No schedule')).toBeInTheDocument()
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
            schedule: [],
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
