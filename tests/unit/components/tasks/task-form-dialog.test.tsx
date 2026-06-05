import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TaskFormDialog } from '@/components/tasks/task-form-dialog'

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
        onClick: () => onValueChange?.(new Date('2026-05-19T12:00:00Z')),
      },
      'Pick a date',
    ),
  Select: ({
    children,
    value,
    ...rest
  }: {
    children: React.ReactNode
    onValueChange?: (v: string) => void
    value?: string
  }) => React.createElement('div', { 'data-value': value, ...rest }, children),
  SelectTrigger: ({ children, ...p }: React.HTMLAttributes<HTMLButtonElement>) =>
    React.createElement('button', { type: 'button', ...p }, children),
  SelectValue: ({ placeholder }: { placeholder?: string }) =>
    React.createElement('span', null, placeholder),
  SelectContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  SelectItem: ({
    children,
    value,
    ...p
  }: { children: React.ReactNode; value: string } & React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement('div', { 'data-value': value, role: 'option', ...p }, children),
  NumberInput: ({
    value,
    onChange,
    min,
    max,
  }: {
    value: number
    onChange: (v: number) => void
    min?: number
    max?: number
  }) =>
    React.createElement('input', {
      type: 'number',
      'aria-label': 'repeat count',
      value,
      min,
      max,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value)),
    }),
}))

vi.mock('@/server/actions/tasks', () => ({
  createTask: vi.fn().mockResolvedValue({ data: { id: 'task-1' } }),
  updateTask: vi.fn().mockResolvedValue({ data: { id: 'task-1' } }),
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ refresh: vi.fn() })),
}))

const baseProps = { open: true, onOpenChange: vi.fn() }

describe('TaskFormDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders "Add Task" title when no taskId', () => {
    render(<TaskFormDialog {...baseProps} />)
    expect(screen.getByRole('heading', { name: 'Add Task' })).toBeInTheDocument()
  })

  it('renders "Edit Task" title when taskId provided', () => {
    render(
      <TaskFormDialog
        {...baseProps}
        taskId="550e8400-e29b-41d4-a716-446655440000"
        initialTitle="Build app"
      />,
    )
    expect(screen.getByRole('heading', { name: 'Edit Task' })).toBeInTheDocument()
  })

  it('save button disabled when title empty', () => {
    render(<TaskFormDialog {...baseProps} />)
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('calls onOpenChange(false) on cancel', async () => {
    render(<TaskFormDialog {...baseProps} />)
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(baseProps.onOpenChange).toHaveBeenCalledWith(false)
  })

  it('prefills title when initialTitle provided', () => {
    render(
      <TaskFormDialog
        {...baseProps}
        taskId="550e8400-e29b-41d4-a716-446655440000"
        initialTitle="Run 5k"
      />,
    )
    expect(screen.getByRole('textbox')).toHaveValue('Run 5k')
  })

  it('does nothing when save clicked without date selected', async () => {
    const { createTask } = await import('@/server/actions/tasks')
    render(<TaskFormDialog {...baseProps} />)
    await userEvent.type(screen.getByRole('textbox'), 'No date task')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(createTask).not.toHaveBeenCalled()
  })

  it('calls updateTask on submit when taskId provided', async () => {
    const { updateTask } = await import('@/server/actions/tasks')
    render(
      <TaskFormDialog
        {...baseProps}
        taskId="550e8400-e29b-41d4-a716-446655440000"
        initialTitle="Build app"
        initialStartAt="2026-05-19T09:00:00Z"
        initialEndAt="2026-05-19T10:00:00Z"
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    await vi.waitFor(() => {
      expect(updateTask).toHaveBeenCalledWith(
        expect.objectContaining({ id: '550e8400-e29b-41d4-a716-446655440000', title: 'Build app' }),
      )
    })
  })

  it('calls createTask on submit without taskId when date selected', async () => {
    const { createTask } = await import('@/server/actions/tasks')
    render(<TaskFormDialog {...baseProps} />)
    await userEvent.type(screen.getByRole('textbox'), 'New task')
    await userEvent.click(screen.getByRole('button', { name: 'date-picker' }))
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    await vi.waitFor(() => {
      expect(createTask).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'task', title: 'New task' }),
      )
    })
  })

  it('calls createTask for each defaultDate when multiple dates', async () => {
    const { createTask } = await import('@/server/actions/tasks')
    const defaultDates = [new Date('2026-06-01T00:00:00Z'), new Date('2026-06-02T00:00:00Z')]
    render(<TaskFormDialog {...baseProps} defaultDates={defaultDates} />)
    await userEvent.type(screen.getByRole('textbox'), 'Multi-day task')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    await vi.waitFor(() => {
      expect(createTask).toHaveBeenCalledTimes(2)
    })
  })

  it('shows date chips when defaultDates provided', () => {
    const defaultDates = [new Date('2026-06-01T00:00:00Z')]
    render(<TaskFormDialog {...baseProps} defaultDates={defaultDates} />)
    expect(screen.getByText('Date(s)')).toBeInTheDocument()
  })
})
