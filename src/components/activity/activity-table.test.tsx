import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ActivityTable, type ActivityRow } from './activity-table'

const refreshMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

vi.mock('@/server/actions/tasks', () => ({
  updateTask: vi.fn().mockResolvedValue({ data: {} }),
  deleteTask: vi.fn().mockResolvedValue({ data: { success: true } }),
}))

vi.mock('@/server/actions/consistency', () => ({
  recordCompletion: vi.fn().mockResolvedValue({ data: {} }),
}))

function makeRow(over: Partial<ActivityRow> = {}): ActivityRow {
  return {
    id: 'r1',
    title: 'Row title',
    type: 'task',
    status: 'pending',
    dateIso: '2026-06-20T09:00:00.000Z',
    dateLabel: 'Jun 20, 5:00 AM',
    recurrence: null,
    location: null,
    description: null,
    color: null,
    allDay: false,
    streak: 0,
    startAt: '2026-06-20T09:00:00.000Z',
    endAt: null,
    targetDate: null,
    activityType: 'solo',
    visibility: 'only_me',
    joinability: null,
    maxParticipants: null,
    ...over,
  }
}

describe('ActivityTable', () => {
  beforeEach(() => {
    refreshMock.mockClear()
  })

  it('renders one data row per item with visible field data', () => {
    render(
      <ActivityTable
        items={[
          makeRow({
            id: 'g1',
            title: 'My goal',
            type: 'goal',
            status: 'in_progress',
            dateLabel: 'Target: 2026-07-15',
            dateIso: '2026-07-15',
            recurrence: null,
            location: 'Park',
            activityType: 'solo',
            visibility: 'friends',
          }),
          makeRow({
            id: 't1',
            title: 'My task',
            type: 'task',
            status: 'pending',
            dateLabel: 'Jun 20, 5:00 AM',
            recurrence: 'weekly',
            location: 'Gym',
            activityType: 'group',
            visibility: 'everyone',
          }),
        ]}
      />,
    )

    // one header row + two data rows
    expect(screen.getAllByRole('row')).toHaveLength(3)
    expect(screen.getByText('My goal')).toBeInTheDocument()
    expect(screen.getByText('My task')).toBeInTheDocument()
    expect(screen.getByText('goal')).toBeInTheDocument()
    expect(screen.getByText('in_progress')).toBeInTheDocument()
    expect(screen.getByText('pending')).toBeInTheDocument()
    expect(screen.getByText('Target: 2026-07-15')).toBeInTheDocument()
    expect(screen.getByText('weekly')).toBeInTheDocument()
    expect(screen.getByText('Park')).toBeInTheDocument()
    expect(screen.getByText('Gym')).toBeInTheDocument()
    expect(screen.getByText('solo · friends')).toBeInTheDocument()
    expect(screen.getByText('group · everyone')).toBeInTheDocument()
  })

  it('renders the color as a swatch dot carrying data-color, aria-hidden', () => {
    const { container } = render(<ActivityTable items={[makeRow({ color: 'blue' })]} />)
    const swatch = container.querySelector('[data-color="blue"]')
    expect(swatch).not.toBeNull()
    expect(swatch).toHaveAttribute('aria-hidden')
    expect(swatch).toHaveStyle({ backgroundColor: 'blue' })
  })

  it('appends a 🔥 streak suffix in the status column for recurring rows', () => {
    render(<ActivityTable items={[makeRow({ type: 'task', recurrence: 'daily', streak: 3 })]} />)
    expect(screen.getByText('🔥 3')).toBeInTheDocument()
  })

  it('does not show a streak suffix for non-recurring rows', () => {
    render(<ActivityTable items={[makeRow({ recurrence: null, streak: 5 })]} />)
    expect(screen.queryByText(/🔥/)).not.toBeInTheDocument()
  })

  it('sorts rows when the Title header is clicked', async () => {
    const user = userEvent.setup()
    render(
      <ActivityTable
        items={[makeRow({ id: 'b', title: 'B task' }), makeRow({ id: 'a', title: 'A task' })]}
      />,
    )
    expect(within(screen.getAllByRole('row')[1]!).getByText('B task')).toBeInTheDocument()
    await user.click(screen.getByText('Title'))
    expect(within(screen.getAllByRole('row')[1]!).getByText('A task')).toBeInTheDocument()
  })

  it('sorts the Date column with null dates last', async () => {
    const user = userEvent.setup()
    render(
      <ActivityTable
        items={[
          makeRow({ id: 'early', title: 'Early', dateIso: '2026-01-01', dateLabel: 'Early label' }),
          makeRow({ id: 'none', title: 'No date', dateIso: null, dateLabel: 'No date label' }),
          makeRow({ id: 'late', title: 'Late', dateIso: '2026-12-01', dateLabel: 'Late label' }),
        ]}
      />,
    )
    await user.click(screen.getByText('Date'))
    const rows = screen.getAllByRole('row')
    // header + 3 data rows; null-date row must be last
    expect(within(rows[rows.length - 1]!).getByText('No date')).toBeInTheDocument()
  })

  it('exposes edit/delete/complete controls in the actions cell', () => {
    render(
      <ActivityTable
        items={[
          makeRow({
            type: 'task',
            status: 'pending',
            recurrence: null,
            joinability: 'open',
            maxParticipants: 5,
          }),
        ]}
      />,
    )
    expect(screen.getByRole('button', { name: 'Edit task' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete task' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /mark complete/i })).toBeInTheDocument()
  })

  it('hides the complete control when the row is already completed', () => {
    render(<ActivityTable items={[makeRow({ status: 'completed' })]} />)
    expect(screen.queryByRole('button', { name: /mark complete/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit task' })).toBeInTheDocument()
  })
})
