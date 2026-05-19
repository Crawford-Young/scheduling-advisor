import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { GoalCard, goalCardPropsSchema } from '@/components/cards/goal-card'

vi.mock('@crawfordyoung/ui', () => ({
  Card: ({ children, ...p }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement('div', p, children),
  CardHeader: ({ children, ...p }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement('div', p, children),
  CardContent: ({ children, ...p }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement('div', p, children),
  Badge: ({ children, ...p }: React.HTMLAttributes<HTMLSpanElement>) =>
    React.createElement('span', p, children),
  Button: ({
    children,
    onClick,
    type,
    disabled,
    ...p
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: string; variant?: string }) =>
    React.createElement('button', { onClick, type, disabled, ...p }, children),
  AlertDialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open ? React.createElement('div', { role: 'alertdialog' }, children) : null,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) =>
    React.createElement('h2', null, children),
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) =>
    React.createElement('p', null, children),
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  AlertDialogAction: ({ children, onClick }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement('button', { onClick }, children),
  AlertDialogCancel: ({ children }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement('button', null, children),
}))

vi.mock('@/server/actions/tasks', () => ({
  updateTask: vi.fn().mockResolvedValue({ data: { id: 'task-1' } }),
  deleteTask: vi.fn().mockResolvedValue({ data: { success: true } }),
}))

vi.mock('@/components/goals/goal-form-dialog', () => ({
  GoalFormDialog: ({ open }: { open: boolean; onOpenChange: (v: boolean) => void }) =>
    open ? React.createElement('div', { role: 'dialog', 'aria-label': 'edit-goal-dialog' }) : null,
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ refresh: vi.fn() })),
}))

const baseProps = {
  taskId: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Run a marathon',
  status: 'pending' as const,
  targetDate: null,
}

describe('GoalCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders title', () => {
    render(<GoalCard {...baseProps} />)
    expect(screen.getByText('Run a marathon')).toBeInTheDocument()
  })

  it('renders status badge', () => {
    render(<GoalCard {...baseProps} />)
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('renders target date when provided', () => {
    render(<GoalCard {...baseProps} targetDate="2026-12-31" />)
    expect(screen.getByText(/2026-12-31/)).toBeInTheDocument()
  })

  it('hides target date when null', () => {
    render(<GoalCard {...baseProps} targetDate={null} />)
    expect(screen.queryByText(/Target:/)).not.toBeInTheDocument()
  })

  it('shows Mark complete button when status is pending', () => {
    render(<GoalCard {...baseProps} status="pending" />)
    expect(screen.getByRole('button', { name: /mark complete/i })).toBeInTheDocument()
  })

  it('hides Mark complete button when status is completed', () => {
    render(<GoalCard {...baseProps} status="completed" />)
    expect(screen.queryByRole('button', { name: /mark complete/i })).not.toBeInTheDocument()
  })

  it('calls updateTask with completed status on mark complete', async () => {
    const { updateTask } = await import('@/server/actions/tasks')
    render(<GoalCard {...baseProps} />)
    await userEvent.click(screen.getByRole('button', { name: /mark complete/i }))
    expect(updateTask).toHaveBeenCalledWith({
      id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'completed',
    })
  })

  it('hides Mark complete optimistically after click', async () => {
    render(<GoalCard {...baseProps} />)
    await userEvent.click(screen.getByRole('button', { name: /mark complete/i }))
    expect(screen.queryByRole('button', { name: /mark complete/i })).not.toBeInTheDocument()
  })

  it('shows edit dialog when edit button clicked', async () => {
    render(<GoalCard {...baseProps} />)
    await userEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByRole('dialog', { name: 'edit-goal-dialog' })).toBeInTheDocument()
  })

  it('shows delete confirm dialog when delete button clicked', async () => {
    render(<GoalCard {...baseProps} />)
    await userEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('calls deleteTask and router.refresh on confirm delete', async () => {
    const { deleteTask } = await import('@/server/actions/tasks')
    const { useRouter } = await import('next/navigation')
    const refresh = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ refresh } as never)

    render(<GoalCard {...baseProps} />)
    await userEvent.click(screen.getByRole('button', { name: /delete/i }))
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(deleteTask).toHaveBeenCalledWith({ id: '550e8400-e29b-41d4-a716-446655440000' })
    expect(refresh).toHaveBeenCalled()
  })

  it('passes axe accessibility check', async () => {
    const { container } = render(<GoalCard {...baseProps} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('goalCardPropsSchema', () => {
  it('validates correct props', () => {
    expect(goalCardPropsSchema.safeParse(baseProps).success).toBe(true)
  })

  it('rejects invalid status', () => {
    expect(goalCardPropsSchema.safeParse({ ...baseProps, status: 'done' }).success).toBe(false)
  })
})
