import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
  Progress: ({ value, ...p }: React.HTMLAttributes<HTMLDivElement> & { value?: number }) =>
    React.createElement('div', { role: 'progressbar', 'aria-valuenow': value, ...p }),
}))

const baseProps = {
  taskId: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Run a half marathon',
  progress: 0.4,
  milestones: [
    { label: 'Run 5k', completed: true },
    { label: 'Run 10k', completed: false },
    { label: 'Run 21k', completed: false },
  ],
  targetDate: '2026-09-01',
}

describe('GoalCard', () => {
  it('renders goal title', () => {
    render(<GoalCard {...baseProps} />)
    expect(screen.getByText('Run a half marathon')).toBeInTheDocument()
  })

  it('renders progress percentage', () => {
    render(<GoalCard {...baseProps} />)
    expect(screen.getByText('40%')).toBeInTheDocument()
  })

  it('marks completed milestones visually', () => {
    render(<GoalCard {...baseProps} />)
    expect(screen.getByText('Run 5k')).toBeInTheDocument()
    expect(screen.getByText('Run 10k')).toBeInTheDocument()
  })

  it('shows target date when provided', () => {
    render(<GoalCard {...baseProps} />)
    expect(screen.getByText(/2026-09-01/)).toBeInTheDocument()
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

  it('accepts empty milestones array', () => {
    expect(goalCardPropsSchema.safeParse({ ...baseProps, milestones: [] }).success).toBe(true)
  })
})
