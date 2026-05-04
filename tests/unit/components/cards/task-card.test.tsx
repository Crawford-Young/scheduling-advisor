import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { TaskCard, taskCardPropsSchema } from '@/components/cards/task-card'

vi.mock('@/server/actions/tasks', () => ({
  updateTask: vi.fn().mockResolvedValue({ data: { status: 'completed' } }),
}))

const baseProps = {
  taskId: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Run 5k',
  type: 'goal' as const,
  status: 'pending' as const,
  nextSlot: 'Tomorrow 7:00 AM',
}

describe('TaskCard', () => {
  it('renders title and type badge', () => {
    render(<TaskCard {...baseProps} />)
    expect(screen.getByText('Run 5k')).toBeInTheDocument()
    expect(screen.getByText('Goal')).toBeInTheDocument()
  })

  it('shows next slot when provided', () => {
    render(<TaskCard {...baseProps} />)
    expect(screen.getByText(/Tomorrow 7:00 AM/)).toBeInTheDocument()
  })

  it('hides mark complete button when status is completed', () => {
    render(<TaskCard {...baseProps} status="completed" />)
    expect(screen.queryByText('Mark complete')).not.toBeInTheDocument()
  })

  it('hides card content when completed and no nextSlot', () => {
    render(<TaskCard {...baseProps} status="completed" nextSlot={undefined} />)
    expect(screen.queryByText('Mark complete')).not.toBeInTheDocument()
  })

  it('calls updateTask when mark complete clicked', async () => {
    const { updateTask } = await import('@/server/actions/tasks')
    render(<TaskCard {...baseProps} />)
    await userEvent.click(screen.getByText('Mark complete'))
    expect(updateTask).toHaveBeenCalledWith({
      id: baseProps.taskId,
      status: 'completed',
    })
  })

  it('passes axe accessibility check', async () => {
    const { container } = render(<TaskCard {...baseProps} />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

describe('taskCardPropsSchema', () => {
  it('validates correct props', () => {
    expect(taskCardPropsSchema.safeParse(baseProps).success).toBe(true)
  })

  it('rejects invalid type', () => {
    expect(taskCardPropsSchema.safeParse({ ...baseProps, type: 'invalid' }).success).toBe(false)
  })
})
