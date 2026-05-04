import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
  Progress: ({ value, ...p }: React.HTMLAttributes<HTMLDivElement> & { value?: number }) =>
    React.createElement('div', { role: 'progressbar', 'aria-valuenow': value, ...p }),
}))

const baseProps = {
  taskId: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Meditate 10min',
  streak: 7,
  completionRate: 0.85,
  nextPrompt: 'Tomorrow 8:00 AM',
}

describe('HabitCard', () => {
  it('renders title and streak', () => {
    render(<HabitCard {...baseProps} />)
    expect(screen.getByText('Meditate 10min')).toBeInTheDocument()
    expect(screen.getByText('7 day streak')).toBeInTheDocument()
  })

  it('renders completion rate as percentage', () => {
    render(<HabitCard {...baseProps} />)
    expect(screen.getByText('85%')).toBeInTheDocument()
  })

  it('shows next prompt', () => {
    render(<HabitCard {...baseProps} />)
    expect(screen.getByText(/Tomorrow 8:00 AM/)).toBeInTheDocument()
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

  it('rejects completionRate above 1', () => {
    expect(habitCardPropsSchema.safeParse({ ...baseProps, completionRate: 1.5 }).success).toBe(
      false,
    )
  })
})
