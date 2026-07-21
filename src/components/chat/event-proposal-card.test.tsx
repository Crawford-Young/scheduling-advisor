import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { EventProposalCard } from './event-proposal-card'
import { createEvent } from '@/server/actions/events'
import { createEvents } from '@/server/actions/chat-mutations'

vi.mock('@/lib/ui', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...rest}>{children}</button>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

vi.mock('@/server/actions/events', () => ({ createEvent: vi.fn() }))
vi.mock('@/server/actions/chat-mutations', () => ({ createEvents: vi.fn() }))

const createEventMock = vi.mocked(createEvent)
const createEventsMock = vi.mocked(createEvents)

// Local-wall-clock ISO — constructed the SAME way the component does so the
// assertion holds in any host TZ (CI is UTC, dev is Eastern). Never a literal.
const EXPECTED_START = new Date(2026, 5, 2, 9, 0).toISOString()
const EXPECTED_END = new Date(2026, 5, 2, 10, 0).toISOString()

function baseProps() {
  return {
    title: 'Standup',
    date: '2026-06-02',
    start: '09:00',
    end: '10:00',
    onConfirmed: vi.fn(),
    onDenied: vi.fn(),
  }
}

type CreateEventResult = Awaited<ReturnType<typeof createEvent>>
type CreateEventsResult = Awaited<ReturnType<typeof createEvents>>

describe('EventProposalCard', () => {
  beforeEach(() => {
    createEventMock.mockReset()
    createEventsMock.mockReset()
    createEventMock.mockResolvedValue({
      data: { id: 'event-1', title: 'Standup' },
    } as CreateEventResult)
    createEventsMock.mockResolvedValue({
      data: [{ id: 'event-1', title: 'Standup' }],
    } as CreateEventsResult)
  })

  it('renders the title and a deterministic time label', () => {
    render(<EventProposalCard {...baseProps()} />)
    expect(screen.getByText('Standup')).toBeInTheDocument()
    expect(screen.getByText('2026-06-02 · 09:00–10:00')).toBeInTheDocument()
  })

  it('renders a description when provided', () => {
    render(<EventProposalCard {...baseProps()} description="Daily sync" />)
    expect(screen.getByText('Daily sync')).toBeInTheDocument()
  })

  it('renders a preview slot when provided', () => {
    render(<EventProposalCard {...baseProps()} preview={<div data-testid="preview" />} />)
    expect(screen.getByTestId('preview')).toBeInTheDocument()
  })

  it('renders a weekly recurrence summary collapsing contiguous weekdays to a range', () => {
    render(
      <EventProposalCard
        {...baseProps()}
        recurrence="weekly"
        recurrenceDays={['Mon', 'Tue', 'Wed', 'Thu', 'Fri']}
        recurrenceCount={8}
      />,
    )
    expect(screen.getByText('Repeats weekly · Mon–Fri · 8 weeks')).toBeInTheDocument()
  })

  it('joins non-contiguous weekdays with a middot', () => {
    render(
      <EventProposalCard
        {...baseProps()}
        recurrence="weekly"
        recurrenceDays={['Mon', 'Fri']}
        recurrenceCount={4}
      />,
    )
    expect(screen.getByText('Repeats weekly · Mon · Fri · 4 weeks')).toBeInTheDocument()
  })

  it('renders a daily recurrence summary with a day count', () => {
    render(<EventProposalCard {...baseProps()} recurrence="daily" recurrenceCount={4} />)
    expect(screen.getByText('Repeats daily · 4 days')).toBeInTheDocument()
  })

  it('renders a monthly recurrence summary with a month count', () => {
    render(<EventProposalCard {...baseProps()} recurrence="monthly" recurrenceCount={6} />)
    expect(screen.getByText('Repeats monthly · 6 months')).toBeInTheDocument()
  })

  it('renders a recurrence summary without a count segment when count is omitted', () => {
    render(<EventProposalCard {...baseProps()} recurrence="daily" />)
    expect(screen.getByText('Repeats daily')).toBeInTheDocument()
  })

  it('renders no recurrence summary for a single event', () => {
    render(<EventProposalCard {...baseProps()} />)
    expect(screen.queryByText(/^Repeats/)).not.toBeInTheDocument()
  })

  it('fans a weekly series into independent events via createEvents on confirm', async () => {
    render(
      <EventProposalCard
        {...baseProps()}
        recurrence="weekly"
        recurrenceDays={['Mon', 'Fri']}
        recurrenceCount={8}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    await waitFor(() => expect(createEventsMock).toHaveBeenCalled())
    // 2 weekdays × 8 weeks = 16 standalone events, no series linkage.
    const arg = createEventsMock.mock.calls[0]![0] as { events: readonly unknown[] }
    expect(arg.events).toHaveLength(16)
    arg.events.forEach((e) => expect(e).toMatchObject({ title: 'Standup' }))
    expect(createEventMock).not.toHaveBeenCalled()
  })

  it('fans a daily count into that many events via createEvents', async () => {
    render(<EventProposalCard {...baseProps()} recurrence="daily" recurrenceCount={4} />)
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    await waitFor(() => expect(createEventsMock).toHaveBeenCalled())
    const arg = createEventsMock.mock.calls[0]![0] as {
      events: readonly { startAt: string }[]
    }
    expect(arg.events).toHaveLength(4)
    // First occurrence is the anchor's local-wall-clock instant.
    expect(arg.events[0]!.startAt).toBe(EXPECTED_START)
  })

  it('creates a single event via createEvent (not createEvents) for a non-recurring proposal', async () => {
    render(<EventProposalCard {...baseProps()} />)
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    await waitFor(() => expect(createEventMock).toHaveBeenCalled())
    expect(createEventMock).toHaveBeenCalledWith({
      title: 'Standup',
      startAt: EXPECTED_START,
      endAt: EXPECTED_END,
    })
    expect(createEventsMock).not.toHaveBeenCalled()
  })

  it('marks the confirmed transcript line as recurring for a series', async () => {
    const append = vi.fn()
    render(
      <EventProposalCard {...baseProps()} append={append} recurrence="daily" recurrenceCount={4} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    await waitFor(() =>
      expect(append).toHaveBeenCalledWith({
        role: 'user',
        content: '[CONFIRMED] Standup — 2026-06-02 09:00–10:00 (recurring)',
      }),
    )
  })

  it('passes the typed description through as-is on confirm', async () => {
    render(<EventProposalCard {...baseProps()} description="Daily sync" />)
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    await waitFor(() =>
      expect(createEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Daily sync' }),
      ),
    )
  })

  it('appends the confirmed transcript line and fires onConfirmed on success', async () => {
    const props = baseProps()
    const append = vi.fn()
    render(<EventProposalCard {...props} append={append} />)
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    await waitFor(() =>
      expect(append).toHaveBeenCalledWith({
        role: 'user',
        content: '[CONFIRMED] Standup — 2026-06-02 09:00–10:00',
      }),
    )
    expect(props.onConfirmed).toHaveBeenCalledWith({
      id: 'event-1',
      title: 'Standup',
      start: EXPECTED_START,
      end: EXPECTED_END,
    })
  })

  it('shows the added state and hides the action buttons after a successful confirm', async () => {
    render(<EventProposalCard {...baseProps()} />)
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    await waitFor(() => expect(screen.getByText(/added/i)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /confirm/i })).not.toBeInTheDocument()
  })

  it('does not throw on success when no append prop is supplied', async () => {
    const props = baseProps()
    render(<EventProposalCard {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    await waitFor(() => expect(props.onConfirmed).toHaveBeenCalled())
  })

  it('disables the confirm button while the create is in flight (no duplicate submit)', async () => {
    let resolveCreate!: (value: CreateEventResult) => void
    createEventMock.mockImplementation(() => new Promise((resolve) => (resolveCreate = resolve)))
    render(<EventProposalCard {...baseProps()} />)
    const confirm = screen.getByRole('button', { name: /confirm/i })
    fireEvent.click(confirm)
    await waitFor(() => expect(confirm).toBeDisabled())
    fireEvent.click(confirm)
    expect(createEventMock).toHaveBeenCalledTimes(1)
    resolveCreate({ data: { id: 'event-1', title: 'Standup' } } as CreateEventResult)
    await waitFor(() => expect(screen.getByText(/added/i)).toBeInTheDocument())
  })

  it('enters the error state with a Retry button when the create fails', async () => {
    createEventMock.mockResolvedValue({ error: 'boom' } as CreateEventResult)
    const props = baseProps()
    render(<EventProposalCard {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument())
    expect(props.onConfirmed).not.toHaveBeenCalled()
  })

  it('enters the error state when a batch create succeeds but returns no rows', async () => {
    createEventsMock.mockResolvedValue({ data: [] } as CreateEventsResult)
    const props = baseProps()
    render(<EventProposalCard {...props} recurrence="daily" recurrenceCount={4} />)
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument())
    expect(props.onConfirmed).not.toHaveBeenCalled()
  })

  it('retries a failed create and succeeds', async () => {
    createEventMock.mockResolvedValueOnce({ error: 'boom' } as CreateEventResult)
    createEventMock.mockResolvedValueOnce({
      data: { id: 'event-1', title: 'Standup' },
    } as CreateEventResult)
    const props = baseProps()
    render(<EventProposalCard {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    const retry = await screen.findByRole('button', { name: /retry/i })
    fireEvent.click(retry)
    await waitFor(() => expect(screen.getByText(/added/i)).toBeInTheDocument())
    expect(props.onConfirmed).toHaveBeenCalledTimes(1)
  })

  it('reveals the reason input when the deny button is clicked', () => {
    render(<EventProposalCard {...baseProps()} />)
    fireEvent.click(screen.getByRole('button', { name: /deny/i }))
    expect(screen.getByPlaceholderText(/why not/i)).toBeInTheDocument()
  })

  it('cancel hides the reason input without denying', () => {
    const props = baseProps()
    render(<EventProposalCard {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /deny/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByPlaceholderText(/why not/i)).not.toBeInTheDocument()
    expect(props.onDenied).not.toHaveBeenCalled()
  })

  it('sends a reasoned denial: appends [DENY] reason and fires onDenied', () => {
    const props = baseProps()
    const append = vi.fn()
    render(<EventProposalCard {...props} append={append} />)
    fireEvent.click(screen.getByRole('button', { name: /deny/i }))
    fireEvent.change(screen.getByPlaceholderText(/why not/i), {
      target: { value: 'wrong slot' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(append).toHaveBeenCalledWith({ role: 'user', content: '[DENY] reason: wrong slot' })
    expect(props.onDenied).toHaveBeenCalledWith('wrong slot')
    expect(screen.getByText(/declined/i)).toBeInTheDocument()
  })

  it('sends a bare [DENY] when no reason is given', () => {
    const props = baseProps()
    const append = vi.fn()
    render(<EventProposalCard {...props} append={append} />)
    fireEvent.click(screen.getByRole('button', { name: /deny/i }))
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(append).toHaveBeenCalledWith({ role: 'user', content: '[DENY]' })
    expect(props.onDenied).toHaveBeenCalledWith('')
  })

  it('does not throw denying without an append prop', () => {
    const props = baseProps()
    render(<EventProposalCard {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /deny/i }))
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(props.onDenied).toHaveBeenCalledWith('')
  })
})
