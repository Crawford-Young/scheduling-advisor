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
}))

vi.mock('@/server/actions/tasks', () => ({
  updateTask: vi.fn().mockResolvedValue({ data: { id: 'task-1' } }),
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

  it('shows Log today button when status is pending', () => {
    render(<HabitCard {...baseProps} status="pending" />)
    expect(screen.getByRole('button', { name: /Log today/ })).toBeInTheDocument()
  })

  it('shows Log today button when status is in_progress', () => {
    render(<HabitCard {...baseProps} status="in_progress" />)
    expect(screen.getByRole('button', { name: /Log today/ })).toBeInTheDocument()
  })

  it('hides Log today button when status is completed', () => {
    render(<HabitCard {...baseProps} status="completed" />)
    expect(screen.queryByRole('button', { name: /Log today/ })).not.toBeInTheDocument()
  })

  it('calls updateTask with completed status on click', async () => {
    const { updateTask } = await import('@/server/actions/tasks')
    render(<HabitCard {...baseProps} />)
    await userEvent.click(screen.getByRole('button', { name: /Log today/ }))
    expect(updateTask).toHaveBeenCalledWith({
      id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'completed',
    })
  })

  it('hides button optimistically after click', async () => {
    render(<HabitCard {...baseProps} />)
    await userEvent.click(screen.getByRole('button', { name: /Log today/ }))
    expect(screen.queryByRole('button', { name: /Log today/ })).not.toBeInTheDocument()
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
