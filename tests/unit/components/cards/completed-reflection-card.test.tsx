import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import {
  CompletedReflectionCard,
  type CompletedReflectionCardProps,
} from '@/components/cards/completed-reflection-card'

vi.mock('@crawfordyoung/ui', () => ({
  Card: ({ children, ...p }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement('div', p, children),
  CardHeader: ({ children, ...p }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement('div', p, children),
  CardContent: ({ children, ...p }: React.HTMLAttributes<HTMLDivElement>) =>
    React.createElement('div', p, children),
}))

const baseProps: CompletedReflectionCardProps = {
  scheduledAt: new Date('2026-05-18T12:00:00Z'),
  rating: 3,
  reflectionText: 'Great session today!',
}

describe('CompletedReflectionCard', () => {
  it('renders formatted date', () => {
    render(<CompletedReflectionCard {...baseProps} />)
    expect(screen.getByText('May 18')).toBeInTheDocument()
  })

  it('renders filled stars up to rating', () => {
    render(<CompletedReflectionCard {...baseProps} rating={3} />)
    expect(screen.getByLabelText('Rating: 3 out of 5')).toBeInTheDocument()
  })

  it('renders reflection text when provided', () => {
    render(<CompletedReflectionCard {...baseProps} reflectionText="Great session today!" />)
    expect(screen.getByText('Great session today!')).toBeInTheDocument()
  })

  it('shows "No notes left." when reflectionText is null', () => {
    render(<CompletedReflectionCard {...baseProps} reflectionText={null} />)
    expect(screen.getByText('No notes left.')).toBeInTheDocument()
  })

  it('shows "No rating." when rating is null', () => {
    render(<CompletedReflectionCard {...baseProps} rating={null} />)
    expect(screen.getByText('No rating.')).toBeInTheDocument()
  })

  it('passes axe accessibility check', async () => {
    const { container } = render(<CompletedReflectionCard {...baseProps} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
