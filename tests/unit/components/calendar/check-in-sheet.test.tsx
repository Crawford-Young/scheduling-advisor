import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { CheckInSheet } from '@/components/calendar/check-in-sheet'

vi.mock('@/server/actions/consistency', () => ({
  recordCompletion: vi
    .fn()
    .mockResolvedValue({ data: { currentStreak: 1, bestStreak: 1, isPerfectWeek: false } }),
  rescheduleTask: vi.fn().mockResolvedValue({ data: { id: 'task-1' } }),
}))

vi.mock('next/navigation', () => ({ useRouter: vi.fn(() => ({ refresh: vi.fn() })) }))

vi.mock('@/lib/ui', () => ({
  Button: ({ children, onClick, disabled, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement('button', { onClick, disabled, ...p }, children),
}))

const item = {
  taskId: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Morning run',
  status: 'pending' as const,
}

describe('CheckInSheet', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders item title', () => {
    render(<CheckInSheet item={item} onClose={() => {}} onPerfectWeek={() => {}} />)
    expect(screen.getByText('Morning run')).toBeInTheDocument()
  })

  it('shows Done, Skip, Reschedule buttons', () => {
    render(<CheckInSheet item={item} onClose={() => {}} onPerfectWeek={() => {}} />)
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /skip/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reschedule/i })).toBeInTheDocument()
  })

  it('calls recordCompletion with done on Done click', async () => {
    const { recordCompletion } = await import('@/server/actions/consistency')
    render(<CheckInSheet item={item} onClose={() => {}} onPerfectWeek={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /done/i }))
    expect(recordCompletion).toHaveBeenCalledWith({
      taskId: '550e8400-e29b-41d4-a716-446655440000',
      outcome: 'done',
    })
  })

  it('calls recordCompletion with skip on Skip click', async () => {
    const { recordCompletion } = await import('@/server/actions/consistency')
    render(<CheckInSheet item={item} onClose={() => {}} onPerfectWeek={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /skip/i }))
    expect(recordCompletion).toHaveBeenCalledWith({
      taskId: '550e8400-e29b-41d4-a716-446655440000',
      outcome: 'skip',
    })
  })

  it('calls onPerfectWeek when isPerfectWeek is true', async () => {
    const { recordCompletion } = await import('@/server/actions/consistency')
    vi.mocked(recordCompletion).mockResolvedValueOnce({
      data: { currentStreak: 7, bestStreak: 7, isPerfectWeek: true },
    } as never)
    const onPerfectWeek = vi.fn()
    render(<CheckInSheet item={item} onClose={() => {}} onPerfectWeek={onPerfectWeek} />)
    await userEvent.click(screen.getByRole('button', { name: /done/i }))
    expect(onPerfectWeek).toHaveBeenCalled()
  })

  it('disables Done button after first click', async () => {
    render(<CheckInSheet item={item} onClose={() => {}} onPerfectWeek={() => {}} />)
    const doneBtn = screen.getByRole('button', { name: /done/i })
    await userEvent.click(doneBtn)
    expect(doneBtn).toBeDisabled()
  })

  it('calls onClose on Reschedule click', async () => {
    const onClose = vi.fn()
    render(<CheckInSheet item={item} onClose={onClose} onPerfectWeek={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /reschedule/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('passes axe', async () => {
    const { container } = render(
      <CheckInSheet item={item} onClose={() => {}} onPerfectWeek={() => {}} />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
