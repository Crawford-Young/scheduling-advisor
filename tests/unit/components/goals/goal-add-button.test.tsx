import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GoalAddButton } from '@/components/goals/goal-add-button'

vi.mock('@/lib/ui', () => ({
  Button: ({ children, onClick }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick}>{children}</button>
  ),
}))

vi.mock('@/components/goals/goal-form-dialog', () => ({
  GoalFormDialog: ({ open }: { open: boolean; onOpenChange: (v: boolean) => void }) =>
    open ? <div data-testid="goal-dialog">dialog</div> : null,
}))

describe('GoalAddButton', () => {
  it('renders add goal button', () => {
    render(<GoalAddButton />)
    expect(screen.getByRole('button', { name: /add goal/i })).toBeInTheDocument()
  })

  it('dialog is closed by default', () => {
    render(<GoalAddButton />)
    expect(screen.queryByTestId('goal-dialog')).not.toBeInTheDocument()
  })

  it('opens dialog on button click', () => {
    render(<GoalAddButton />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByTestId('goal-dialog')).toBeInTheDocument()
  })
})
