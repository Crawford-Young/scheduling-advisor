import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { TaskRowActions } from '@/components/tasks/task-row-actions'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/server/actions/tasks', () => ({
  deleteTask: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/ui', () => ({
  Button: ({ children, onClick, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} {...p}>
      {children}
    </button>
  ),
  AlertDialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  AlertDialogAction: ({
    children,
    onClick,
    ...p
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} {...p}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/tasks/task-form-dialog', () => ({
  TaskFormDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="edit-dialog" /> : null,
}))

const baseProps = {
  taskId: 'task-1',
  title: 'Buy groceries',
  startAt: null,
  endAt: null,
  recurrence: null,
}

describe('TaskRowActions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders edit and delete buttons', () => {
    render(<TaskRowActions {...baseProps} />)
    expect(screen.getByRole('button', { name: 'Edit task' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete task' })).toBeInTheDocument()
  })

  it('opens edit dialog on edit click', () => {
    render(<TaskRowActions {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit task' }))
    expect(screen.getByTestId('edit-dialog')).toBeInTheDocument()
  })

  it('opens delete dialog on delete click', () => {
    render(<TaskRowActions {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete task' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('calls deleteTask on confirm delete', async () => {
    const { deleteTask } = await import('@/server/actions/tasks')
    render(<TaskRowActions {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete task' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))
    await vi.waitFor(() => {
      expect(deleteTask).toHaveBeenCalledWith({ id: 'task-1' })
    })
  })
})
