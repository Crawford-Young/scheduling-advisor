import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import { ReflectionCard, reflectionCardPropsSchema } from '@/components/cards/reflection-card'

const baseProps = {
  checkInId: '550e8400-e29b-41d4-a716-446655440000',
  promptText: 'How did your run go today?',
  taskTitle: 'Run 5k',
}

describe('ReflectionCard', () => {
  it('renders prompt text', () => {
    render(<ReflectionCard {...baseProps} />)
    expect(screen.getByText('How did your run go today?')).toBeInTheDocument()
  })

  it('renders task title when provided', () => {
    render(<ReflectionCard {...baseProps} />)
    expect(screen.getByText('Run 5k')).toBeInTheDocument()
  })

  it('does not render a task title when not provided', () => {
    render(<ReflectionCard {...baseProps} taskTitle={undefined} />)
    expect(screen.queryByText('Run 5k')).not.toBeInTheDocument()
  })

  it('renders no interactive controls (display-only, save capability removed)', () => {
    render(<ReflectionCard {...baseProps} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('shows the reflections-no-longer-collected notice', () => {
    render(<ReflectionCard {...baseProps} />)
    expect(screen.getByText('Reflections are no longer collected.')).toBeInTheDocument()
  })

  it('passes axe accessibility check', async () => {
    const { container } = render(<ReflectionCard {...baseProps} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('reflectionCardPropsSchema', () => {
  it('validates correct props', () => {
    expect(reflectionCardPropsSchema.safeParse(baseProps).success).toBe(true)
  })

  it('accepts null taskTitle', () => {
    expect(reflectionCardPropsSchema.safeParse({ ...baseProps, taskTitle: null }).success).toBe(
      true,
    )
  })
})
