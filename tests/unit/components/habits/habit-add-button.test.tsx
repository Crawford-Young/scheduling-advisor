import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HabitAddButton } from '@/components/habits/habit-add-button'

vi.mock('@/lib/ui', () => ({
  Button: ({ children, onClick }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick}>{children}</button>
  ),
}))

vi.mock('@/components/habits/habit-form-dialog', () => ({
  HabitFormDialog: ({ open }: { open: boolean; onOpenChange: (v: boolean) => void }) =>
    open ? <div data-testid="habit-dialog">dialog</div> : null,
}))

describe('HabitAddButton', () => {
  it('renders add habit button', () => {
    render(<HabitAddButton />)
    expect(screen.getByRole('button', { name: /add habit/i })).toBeInTheDocument()
  })

  it('dialog is closed by default', () => {
    render(<HabitAddButton />)
    expect(screen.queryByTestId('habit-dialog')).not.toBeInTheDocument()
  })

  it('opens dialog on button click', () => {
    render(<HabitAddButton />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByTestId('habit-dialog')).toBeInTheDocument()
  })
})
