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
}))

vi.mock('@/server/actions/tasks', () => ({
  updateTask: vi.fn().mockResolvedValue({ data: { id: 'task-1' } }),
}))

const baseProps = {
  taskId: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Run a half marathon',
  status: 'in_progress' as const,
  targetDate: '2026-09-01',
}

describe('GoalCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders goal title', () => {
    render(<GoalCard {...baseProps} />)
    expect(screen.getByText('Run a half marathon')).toBeInTheDocument()
  })

  it('renders status badge', () => {
    render(<GoalCard {...baseProps} />)
    expect(screen.getByText('In Progress')).toBeInTheDocument()
  })

  it('renders target date when provided', () => {
    render(<GoalCard {...baseProps} />)
    expect(screen.getByText(/2026-09-01/)).toBeInTheDocument()
  })

  it('hides target date when null', () => {
    render(<GoalCard {...baseProps} targetDate={null} />)
    expect(screen.queryByText(/Target/)).not.toBeInTheDocument()
  })

  it('shows Mark complete button when status is pending', () => {
    render(<GoalCard {...baseProps} status="pending" />)
    expect(screen.getByRole('button', { name: /Mark complete/ })).toBeInTheDocument()
  })

  it('shows Mark complete button when status is in_progress', () => {
    render(<GoalCard {...baseProps} status="in_progress" />)
    expect(screen.getByRole('button', { name: /Mark complete/ })).toBeInTheDocument()
  })

  it('hides Mark complete button when status is completed', () => {
    render(<GoalCard {...baseProps} status="completed" />)
    expect(screen.queryByRole('button', { name: /Mark complete/ })).not.toBeInTheDocument()
  })

  it('calls updateTask with completed status on click', async () => {
    const { updateTask } = await import('@/server/actions/tasks')
    render(<GoalCard {...baseProps} status="pending" />)
    await userEvent.click(screen.getByRole('button', { name: /Mark complete/ }))
    expect(updateTask).toHaveBeenCalledWith({
      id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'completed',
    })
  })

  it('hides button optimistically after click', async () => {
    render(<GoalCard {...baseProps} status="pending" />)
    await userEvent.click(screen.getByRole('button', { name: /Mark complete/ }))
    expect(screen.queryByRole('button', { name: /Mark complete/ })).not.toBeInTheDocument()
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

  it('accepts null targetDate', () => {
    expect(goalCardPropsSchema.safeParse({ ...baseProps, targetDate: null }).success).toBe(true)
  })

  it('rejects invalid status', () => {
    expect(goalCardPropsSchema.safeParse({ ...baseProps, status: 'done' }).success).toBe(false)
  })
})
