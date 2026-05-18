import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HabitFormDialog } from '@/components/habits/habit-form-dialog'

vi.mock('@crawfordyoung/ui', () => ({
  Button: ({
    children,
    onClick,
    type,
    disabled,
    form,
    ...p
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement('button', { onClick, type, disabled, form, ...p }, children),
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? React.createElement('div', { role: 'dialog' }, children) : null,
  DialogContent: ({ children, ...p }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement('div', p, children),
  DialogHeader: ({ children, ...p }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement('div', p, children),
  DialogTitle: ({ children, ...p }: React.HTMLAttributes<HTMLHeadingElement>) =>
    React.createElement('h2', p, children),
  DialogFooter: ({ children, ...p }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement('div', p, children),
  Input: ({ id, value, onChange, ...p }: React.InputHTMLAttributes<HTMLInputElement>) =>
    React.createElement('input', { id, value, onChange, ...p }),
  Label: ({ children, htmlFor, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) =>
    React.createElement('label', { htmlFor, ...p }, children),
}))

vi.mock('@/server/actions/tasks', () => ({
  createTask: vi.fn().mockResolvedValue({ data: { id: 'task-1' } }),
  updateTask: vi.fn().mockResolvedValue({ data: { id: 'task-1' } }),
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ refresh: vi.fn() })),
}))

const baseProps = { open: true, onOpenChange: vi.fn() }

describe('HabitFormDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders "Add Habit" title when no taskId', () => {
    render(<HabitFormDialog {...baseProps} />)
    expect(screen.getByRole('heading', { name: 'Add Habit' })).toBeInTheDocument()
  })

  it('renders "Edit Habit" title when taskId provided', () => {
    render(
      <HabitFormDialog
        {...baseProps}
        taskId="550e8400-e29b-41d4-a716-446655440000"
        initialTitle="Meditate"
      />,
    )
    expect(screen.getByRole('heading', { name: 'Edit Habit' })).toBeInTheDocument()
  })

  it('calls createTask with type habit on submit', async () => {
    const { createTask } = await import('@/server/actions/tasks')
    render(<HabitFormDialog {...baseProps} />)
    await userEvent.type(screen.getByRole('textbox'), 'Meditate 10min')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'habit', title: 'Meditate 10min' }),
    )
  })

  it('calls updateTask when taskId provided', async () => {
    const { updateTask } = await import('@/server/actions/tasks')
    render(
      <HabitFormDialog
        {...baseProps}
        taskId="550e8400-e29b-41d4-a716-446655440000"
        initialTitle="Meditate"
      />,
    )
    const input = screen.getByRole('textbox')
    await userEvent.clear(input)
    await userEvent.type(input, 'Meditate 10min')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(updateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '550e8400-e29b-41d4-a716-446655440000',
        title: 'Meditate 10min',
      }),
    )
  })

  it('save button disabled when title empty', () => {
    render(<HabitFormDialog {...baseProps} />)
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })
})
