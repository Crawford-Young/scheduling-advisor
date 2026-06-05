import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TaskAddButton } from '@/components/tasks/task-add-button'

vi.mock('@/lib/ui', () => ({
  Button: ({ children, onClick }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick}>{children}</button>
  ),
}))

vi.mock('@/components/tasks/task-form-dialog', () => ({
  TaskFormDialog: ({ open }: { open: boolean; onOpenChange: (v: boolean) => void }) =>
    open ? <div data-testid="task-dialog">dialog</div> : null,
}))

describe('TaskAddButton', () => {
  it('renders add task button', () => {
    render(<TaskAddButton />)
    expect(screen.getByRole('button', { name: /add task/i })).toBeInTheDocument()
  })

  it('dialog is closed by default', () => {
    render(<TaskAddButton />)
    expect(screen.queryByTestId('task-dialog')).not.toBeInTheDocument()
  })

  it('opens dialog on button click', () => {
    render(<TaskAddButton />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByTestId('task-dialog')).toBeInTheDocument()
  })
})
