import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import {
  WeekCalendarView,
  weekCalendarViewPropsSchema,
} from '@/components/tambo/week-calendar-view'

const baseProps = {
  weekStart: '2026-05-04T00:00:00Z',
  events: [
    {
      id: 'evt-1',
      title: 'Team standup',
      start: '2026-05-04T09:00:00Z',
      end: '2026-05-04T09:30:00Z',
      type: 'calendar' as const,
    },
    {
      id: 'evt-2',
      title: 'Run 5k',
      start: '2026-05-05T07:00:00Z',
      end: '2026-05-05T08:00:00Z',
      type: 'task' as const,
    },
  ],
}

describe('WeekCalendarView', () => {
  it('renders week day headers', () => {
    render(<WeekCalendarView {...baseProps} />)
    expect(screen.getByText('Mon')).toBeInTheDocument()
    expect(screen.getByText('Sun')).toBeInTheDocument()
  })

  it('renders calendar events', () => {
    render(<WeekCalendarView {...baseProps} />)
    expect(screen.getByText('Team standup')).toBeInTheDocument()
  })

  it('renders task events', () => {
    render(<WeekCalendarView {...baseProps} />)
    expect(screen.getByText('Run 5k')).toBeInTheDocument()
  })

  it('passes axe accessibility check', async () => {
    const { container } = render(<WeekCalendarView {...baseProps} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('weekCalendarViewPropsSchema', () => {
  it('validates correct props', () => {
    expect(weekCalendarViewPropsSchema.safeParse(baseProps).success).toBe(true)
  })

  it('accepts empty events', () => {
    expect(weekCalendarViewPropsSchema.safeParse({ ...baseProps, events: [] }).success).toBe(true)
  })
})
