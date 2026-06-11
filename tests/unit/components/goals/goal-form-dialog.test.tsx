import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GoalFormDialog } from '@/components/goals/goal-form-dialog'

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
  DatePicker: ({
    value,
    onValueChange,
  }: {
    value?: Date
    onValueChange?: (d: Date | undefined) => void
  }) =>
    React.createElement(
      'button',
      {
        type: 'button',
        'aria-label': 'date-picker',
        onClick: () => onValueChange?.(new Date('2026-06-01T12:00:00Z')),
      },
      value ? value.toISOString() : 'Pick a date',
    ),
}))

vi.mock('@/server/actions/tasks', () => ({
  createTask: vi.fn().mockResolvedValue({ data: { id: 'task-1' } }),
  updateTask: vi.fn().mockResolvedValue({ data: { id: 'task-1' } }),
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ refresh: vi.fn() })),
}))

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
}

describe('GoalFormDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders "Add Goal" title when no taskId', () => {
    render(<GoalFormDialog {...baseProps} />)
    expect(screen.getByRole('heading', { name: 'Add Goal' })).toBeInTheDocument()
  })

  it('renders "Edit Goal" title when taskId provided', () => {
    render(
      <GoalFormDialog
        {...baseProps}
        taskId="550e8400-e29b-41d4-a716-446655440000"
        initialTitle="Run marathon"
      />,
    )
    expect(screen.getByRole('heading', { name: 'Edit Goal' })).toBeInTheDocument()
  })

  it('calls createTask on submit when no taskId', async () => {
    const { createTask } = await import('@/server/actions/tasks')
    render(<GoalFormDialog {...baseProps} />)
    await userEvent.type(screen.getByRole('textbox'), 'Run marathon')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'goal', title: 'Run marathon' }),
    )
  })

  it('calls updateTask on submit when taskId provided', async () => {
    const { updateTask } = await import('@/server/actions/tasks')
    render(
      <GoalFormDialog
        {...baseProps}
        taskId="550e8400-e29b-41d4-a716-446655440000"
        initialTitle="Run 5k"
      />,
    )
    const input = screen.getByRole('textbox')
    await userEvent.clear(input)
    await userEvent.type(input, 'Run marathon')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(updateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '550e8400-e29b-41d4-a716-446655440000',
        title: 'Run marathon',
      }),
    )
  })

  it('calls onOpenChange(false) on cancel', async () => {
    render(<GoalFormDialog {...baseProps} />)
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(baseProps.onOpenChange).toHaveBeenCalledWith(false)
  })

  it('save button disabled when title is empty', () => {
    render(<GoalFormDialog {...baseProps} />)
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('initializes with targetDate when initialTargetDate provided', () => {
    render(
      <GoalFormDialog
        {...baseProps}
        taskId="550e8400-e29b-41d4-a716-446655440000"
        initialTitle="Run marathon"
        initialTargetDate="2026-06-15"
      />,
    )
    expect(screen.getByRole('button', { name: 'date-picker' })).toHaveTextContent(/2026/)
  })

  it('includes targetDate in createTask when date picker used', async () => {
    const { createTask } = await import('@/server/actions/tasks')
    render(<GoalFormDialog {...baseProps} />)
    await userEvent.type(screen.getByRole('textbox'), 'Run marathon')
    await userEvent.click(screen.getByRole('button', { name: 'date-picker' }))
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ targetDate: expect.stringContaining('2026-06') }),
    )
  })
})
