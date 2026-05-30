import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { CalendarClient } from '@/components/calendar/calendar-client'

vi.mock('@/components/cards/week-calendar-view', () => ({
  WeekCalendarView: ({
    onEventClick,
    events,
  }: {
    onEventClick?: (e: { id: string; title: string; status: string }) => void
    events: Array<{ id: string; title: string; status: string }>
  }) => (
    <div>
      {events.map((e) => (
        <button key={e.id} onClick={() => onEventClick?.(e)}>
          {e.title}
        </button>
      ))}
    </div>
  ),
}))

vi.mock('@/components/calendar/check-in-sheet', () => ({
  CheckInSheet: ({
    item,
    onClose,
    onPerfectWeek,
  }: {
    item: { title: string }
    onClose: () => void
    onPerfectWeek: () => void
  }) => (
    <div data-testid="check-in-sheet">
      <span>{item.title}</span>
      <button onClick={onClose}>Close</button>
      <button onClick={onPerfectWeek}>Perfect week</button>
    </div>
  ),
}))

vi.mock('@/components/calendar/perfect-week-celebration', () => ({
  PerfectWeekCelebration: ({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) =>
    visible ? (
      <div data-testid="perfect-week">
        <button onClick={onDismiss}>Dismiss</button>
      </div>
    ) : null,
}))

const events = [
  {
    id: 'e1',
    title: 'Morning run',
    start: '2026-05-29T07:00:00',
    end: '2026-05-29T08:00:00',
    type: 'habit' as const,
    status: 'pending' as const,
    streak: 3,
    activityType: 'solo',
    visibility: 'only_me',
  },
  {
    id: 'e2',
    title: 'Done event',
    start: '2026-05-29T09:00:00',
    end: '2026-05-29T10:00:00',
    type: 'task' as const,
    status: 'completed' as const,
    streak: 0,
    activityType: 'solo',
    visibility: 'only_me',
  },
]

describe('CalendarClient', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the calendar', () => {
    render(<CalendarClient weekStart="2026-05-25" events={events} />)
    expect(screen.getByText('Morning run')).toBeInTheDocument()
  })

  it('opens CheckInSheet when pending event clicked', async () => {
    render(<CalendarClient weekStart="2026-05-25" events={events} />)
    await userEvent.click(screen.getByText('Morning run'))
    expect(screen.getByTestId('check-in-sheet')).toBeInTheDocument()
  })

  it('does not open CheckInSheet for completed events', async () => {
    render(<CalendarClient weekStart="2026-05-25" events={events} />)
    await userEvent.click(screen.getByText('Done event'))
    expect(screen.queryByTestId('check-in-sheet')).not.toBeInTheDocument()
  })

  it('closes CheckInSheet on onClose', async () => {
    render(<CalendarClient weekStart="2026-05-25" events={events} />)
    await userEvent.click(screen.getByText('Morning run'))
    await userEvent.click(screen.getByText('Close'))
    expect(screen.queryByTestId('check-in-sheet')).not.toBeInTheDocument()
  })

  it('shows PerfectWeekCelebration when onPerfectWeek fires', async () => {
    render(<CalendarClient weekStart="2026-05-25" events={events} />)
    await userEvent.click(screen.getByText('Morning run'))
    await userEvent.click(screen.getByText('Perfect week'))
    expect(screen.getByTestId('perfect-week')).toBeInTheDocument()
  })

  it('passes axe', async () => {
    const { container } = render(<CalendarClient weekStart="2026-05-25" events={events} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
