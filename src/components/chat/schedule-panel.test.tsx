import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SchedulePanel } from './schedule-panel'
import type { ScheduleState } from './schedule-panel'

vi.mock('@/lib/ui', () => ({
  WeekCalendarView: ({ events }: { events: unknown[] }) => (
    <div data-testid="week-calendar" data-event-count={events.length} />
  ),
}))

const baseState: ScheduleState = {
  visible: true,
  weekStart: '2026-06-02',
  events: [],
}

describe('SchedulePanel', () => {
  it('renders WeekCalendarView when visible', () => {
    render(<SchedulePanel state={baseState} />)
    expect(screen.getByTestId('week-calendar')).toBeInTheDocument()
  })

  it('renders an explanatory empty state when not visible', () => {
    render(<SchedulePanel state={{ ...baseState, visible: false }} />)
    expect(screen.queryByTestId('week-calendar')).not.toBeInTheDocument()
    expect(screen.getByText('Schedule preview')).toBeInTheDocument()
    expect(
      screen.getByText('When Cy proposes times or shows your week, it appears here.'),
    ).toBeInTheDocument()
  })

  it('passes events to WeekCalendarView', () => {
    const events = [
      {
        id: '1',
        title: 'Event',
        start: '2026-06-02T09:00:00',
        end: '2026-06-02T10:00:00',
        color: 'blue' as const,
      },
    ]
    render(<SchedulePanel state={{ ...baseState, events }} />)
    expect(screen.getByTestId('week-calendar')).toHaveAttribute('data-event-count', '1')
  })
})
