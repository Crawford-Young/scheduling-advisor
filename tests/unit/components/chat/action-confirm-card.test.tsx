import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActionConfirmCard } from '@/components/chat/action-confirm-card'

describe('ActionConfirmCard', () => {
  const baseProps = {
    action: "Mark 'Morning Run' complete",
    entityType: 'habit' as const,
    date: 'June 1st',
    time: '7:00 AM',
    onConfirm: vi.fn(),
    onDeny: vi.fn(),
  }

  it('renders action text', () => {
    render(<ActionConfirmCard {...baseProps} />)
    expect(screen.getByText("Mark 'Morning Run' complete")).toBeInTheDocument()
  })

  it('renders date and time', () => {
    render(<ActionConfirmCard {...baseProps} />)
    expect(screen.getByText(/June 1st/)).toBeInTheDocument()
    expect(screen.getByText(/7:00 AM/)).toBeInTheDocument()
  })

  it('renders entity type badge', () => {
    render(<ActionConfirmCard {...baseProps} />)
    expect(screen.getByText('habit')).toBeInTheDocument()
  })

  it('calls onConfirm when checkmark clicked', () => {
    const onConfirm = vi.fn()
    render(<ActionConfirmCard {...baseProps} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('reveals reason input when X clicked', () => {
    render(<ActionConfirmCard {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /deny/i }))
    expect(screen.getByPlaceholderText(/why not/i)).toBeInTheDocument()
  })

  it('cancel hides reason input', () => {
    render(<ActionConfirmCard {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /deny/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByPlaceholderText(/why not/i)).not.toBeInTheDocument()
  })

  it('calls onDeny with reason when Send clicked', () => {
    const onDeny = vi.fn()
    render(<ActionConfirmCard {...baseProps} onDeny={onDeny} />)
    fireEvent.click(screen.getByRole('button', { name: /deny/i }))
    fireEvent.change(screen.getByPlaceholderText(/why not/i), {
      target: { value: 'wrong date' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(onDeny).toHaveBeenCalledWith('wrong date')
  })

  it('calls onDeny with empty string when Send clicked without reason', () => {
    const onDeny = vi.fn()
    render(<ActionConfirmCard {...baseProps} onDeny={onDeny} />)
    fireEvent.click(screen.getByRole('button', { name: /deny/i }))
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(onDeny).toHaveBeenCalledWith('')
  })

  it('shows confirmed state after confirm', () => {
    render(<ActionConfirmCard {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(screen.getByText(/confirmed/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /confirm/i })).not.toBeInTheDocument()
  })

  it('shows denied state after deny + send', () => {
    render(<ActionConfirmCard {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /deny/i }))
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(screen.getByText(/declined/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /deny/i })).not.toBeInTheDocument()
  })

  it('renders without time for goal entity type', () => {
    render(
      <ActionConfirmCard
        action="Create goal 'Write book'"
        entityType="goal"
        date="December 31st"
        onConfirm={vi.fn()}
        onDeny={vi.fn()}
      />,
    )
    expect(screen.getByText('December 31st')).toBeInTheDocument()
    expect(screen.queryByText(/7:00 AM/)).not.toBeInTheDocument()
  })

  it('renders without date or time (no dateTime block shown)', () => {
    render(
      <ActionConfirmCard
        action="Create event"
        entityType="event"
        onConfirm={vi.fn()}
        onDeny={vi.fn()}
      />,
    )
    expect(screen.getByText('Create event')).toBeInTheDocument()
    expect(screen.queryByText('event')).not.toBeInTheDocument()
  })

  it('renders detail when provided', () => {
    render(
      <ActionConfirmCard
        action="Create event"
        entityType="event"
        date="June 1st"
        detail="Retroactive — originally June 1st"
        onConfirm={vi.fn()}
        onDeny={vi.fn()}
      />,
    )
    expect(screen.getByText('Retroactive — originally June 1st')).toBeInTheDocument()
  })
})
