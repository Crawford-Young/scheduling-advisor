import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { HabitCard, habitCardPropsSchema } from '@/components/cards/habit-card'

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

vi.mock('@/components/habits/habit-form-dialog', () => ({
  HabitFormDialog: ({ open }: { open: boolean; onOpenChange: (v: boolean) => void }) =>
    open ? React.createElement('div', { role: 'dialog', 'aria-label': 'edit-habit-dialog' }) : null,
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ refresh: vi.fn() })),
}))

const baseProps = {
  taskId: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Meditate 10min',
  status: 'pending' as const,
  streak: 7,
}

describe('HabitCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders title and streak', () => {
    render(<HabitCard {...baseProps} />)
    expect(screen.getByText('Meditate 10min')).toBeInTheDocument()
    expect(screen.getByText(/7 day streak/)).toBeInTheDocument()
  })

  it('shows Log today button when pending', () => {
    render(<HabitCard {...baseProps} status="pending" />)
    expect(screen.getByRole('button', { name: /log today/i })).toBeInTheDocument()
  })

  it('hides Log today button when completed', () => {
    render(<HabitCard {...baseProps} status="completed" />)
    expect(screen.queryByRole('button', { name: /log today/i })).not.toBeInTheDocument()
  })

  it('calls updateTask on log today', async () => {
    const { updateTask } = await import('@/server/actions/tasks')
    render(<HabitCard {...baseProps} />)
    await userEvent.click(screen.getByRole('button', { name: /log today/i }))
    expect(updateTask).toHaveBeenCalledWith({
      id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'completed',
    })
  })

  it('hides Log today button optimistically after click', async () => {
    render(<HabitCard {...baseProps} />)
    await userEvent.click(screen.getByRole('button', { name: /log today/i }))
    expect(screen.queryByRole('button', { name: /log today/i })).not.toBeInTheDocument()
  })

  it('shows edit dialog when edit button clicked', async () => {
    render(<HabitCard {...baseProps} />)
    await userEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByRole('dialog', { name: 'edit-habit-dialog' })).toBeInTheDocument()
  })

  it('shows delete confirm dialog when delete button clicked', async () => {
    render(<HabitCard {...baseProps} />)
    await userEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('calls deleteTask on confirm delete', async () => {
    const { deleteTask } = await import('@/server/actions/tasks')
    render(<HabitCard {...baseProps} />)
    await userEvent.click(screen.getByRole('button', { name: /delete/i }))
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(deleteTask).toHaveBeenCalledWith({ id: '550e8400-e29b-41d4-a716-446655440000' })
  })

  it('passes axe accessibility check', async () => {
    const { container } = render(<HabitCard {...baseProps} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('habitCardPropsSchema', () => {
  it('validates correct props', () => {
    expect(habitCardPropsSchema.safeParse(baseProps).success).toBe(true)
  })

  it('rejects negative streak', () => {
    expect(habitCardPropsSchema.safeParse({ ...baseProps, streak: -1 }).success).toBe(false)
  })

  it('rejects invalid status', () => {
    expect(habitCardPropsSchema.safeParse({ ...baseProps, status: 'done' }).success).toBe(false)
  })
})
