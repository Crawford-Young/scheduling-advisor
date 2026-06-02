import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import { WeekCalendarView } from '@/lib/ui'

const WEEK_START = '2026-05-04'

const baseProps = {
  defaultWeekStart: WEEK_START,
  events: [
    {
      id: 'evt-1',
      title: 'Team standup',
      start: '2026-05-04T09:00:00',
      end: '2026-05-04T09:30:00',
      color: 'default' as const,
    },
    {
      id: 'evt-2',
      title: 'Run 5k',
      start: '2026-05-05T07:00:00',
      end: '2026-05-05T08:00:00',
      color: 'blue' as const,
    },
  ],
}

describe('WeekCalendarView (library)', () => {
  it('renders week day headers', () => {
    render(<WeekCalendarView {...baseProps} />)
    expect(screen.getByRole('button', { name: /Mon 4/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sun 10/i })).toBeInTheDocument()
  })

  it('renders calendar events', () => {
    render(<WeekCalendarView {...baseProps} />)
    expect(screen.getByRole('button', { name: /team standup/i })).toBeInTheDocument()
  })

  it('renders task events', () => {
    render(<WeekCalendarView {...baseProps} />)
    expect(screen.getByRole('button', { name: /run 5k/i })).toBeInTheDocument()
  })

  it('passes axe accessibility check', async () => {
    const { container } = render(<WeekCalendarView {...baseProps} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
