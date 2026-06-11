import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { PerfectWeekCelebration } from '@/components/calendar/perfect-week-celebration'

vi.mock('@/lib/ui', () => ({
  Button: ({ children, onClick, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement('button', { onClick, ...p }, children),
}))

describe('PerfectWeekCelebration', () => {
  it('renders when visible', () => {
    render(<PerfectWeekCelebration visible onDismiss={() => {}} />)
    expect(screen.getByText(/perfect week/i)).toBeInTheDocument()
  })

  it('renders nothing when not visible', () => {
    const { container } = render(<PerfectWeekCelebration visible={false} onDismiss={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('calls onDismiss when button clicked', async () => {
    const onDismiss = vi.fn()
    render(<PerfectWeekCelebration visible onDismiss={onDismiss} />)
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('passes axe', async () => {
    const { container } = render(<PerfectWeekCelebration visible onDismiss={() => {}} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
