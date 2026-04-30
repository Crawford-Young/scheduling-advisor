import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { http, HttpResponse } from 'msw'
import { server } from '../../../mocks/server'
import {
  ScheduleSuggestion,
  scheduleSuggestionPropsSchema,
} from '@/components/tambo/schedule-suggestion'

const baseProps = {
  taskId: '550e8400-e29b-41d4-a716-446655440000',
  taskTitle: 'Run 5k',
  slots: [
    { start: '2026-05-01T07:00:00Z', end: '2026-05-01T08:00:00Z', label: 'Thu 7:00–8:00 AM' },
    { start: '2026-05-02T07:00:00Z', end: '2026-05-02T08:00:00Z', label: 'Fri 7:00–8:00 AM' },
  ],
}

describe('ScheduleSuggestion', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders task title and slots', () => {
    render(<ScheduleSuggestion {...baseProps} />)
    expect(screen.getByText(/Run 5k/)).toBeInTheDocument()
    expect(screen.getByText('Thu 7:00–8:00 AM')).toBeInTheDocument()
    expect(screen.getByText('Fri 7:00–8:00 AM')).toBeInTheDocument()
  })

  it('removes slot from view when Skip clicked', async () => {
    render(<ScheduleSuggestion {...baseProps} />)
    const skipButtons = screen.getAllByText('Skip')
    await userEvent.click(skipButtons[0]!)
    expect(screen.queryByText('Thu 7:00–8:00 AM')).not.toBeInTheDocument()
    expect(screen.getByText('Fri 7:00–8:00 AM')).toBeInTheDocument()
  })

  it('calls POST /api/calendar/events when Accept clicked', async () => {
    render(<ScheduleSuggestion {...baseProps} />)
    await userEvent.click(screen.getAllByText('Accept')[0]!)
    expect(await screen.findByText(/Scheduled/)).toBeInTheDocument()
  })

  it('shows success message after accepting', async () => {
    render(<ScheduleSuggestion {...baseProps} />)
    await userEvent.click(screen.getAllByText('Accept')[0]!)
    expect(await screen.findByText(/Scheduled/)).toBeInTheDocument()
  })

  it('does not set accepted when fetch fails', async () => {
    server.use(http.post('/api/calendar/events', () => HttpResponse.json({}, { status: 500 })))
    render(<ScheduleSuggestion {...baseProps} />)
    await userEvent.click(screen.getAllByText('Accept')[0]!)
    expect(screen.queryByText(/Scheduled/)).not.toBeInTheDocument()
  })

  it('shows all-slots-skipped message when all slots rejected', async () => {
    render(<ScheduleSuggestion {...baseProps} />)
    const skipButtons = screen.getAllByText('Skip')
    await userEvent.click(skipButtons[0]!)
    await userEvent.click(screen.getByText('Skip'))
    expect(screen.getByText(/All slots skipped/)).toBeInTheDocument()
  })

  it('passes axe accessibility check', async () => {
    const { container } = render(<ScheduleSuggestion {...baseProps} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('scheduleSuggestionPropsSchema', () => {
  it('validates correct props', () => {
    expect(scheduleSuggestionPropsSchema.safeParse(baseProps).success).toBe(true)
  })
})
