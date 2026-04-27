import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { ReflectionCard, reflectionCardPropsSchema } from '@/components/tambo/reflection-card'

vi.mock('@/server/actions/check-ins', () => ({
  completeCheckIn: vi.fn().mockResolvedValue({ data: { id: 'ci-1' } }),
}))

const baseProps = {
  checkInId: '550e8400-e29b-41d4-a716-446655440000',
  promptText: 'How did your run go today?',
  taskTitle: 'Run 5k',
}

describe('ReflectionCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders prompt text', () => {
    render(<ReflectionCard {...baseProps} />)
    expect(screen.getByText('How did your run go today?')).toBeInTheDocument()
  })

  it('renders task title when provided', () => {
    render(<ReflectionCard {...baseProps} />)
    expect(screen.getByText('Run 5k')).toBeInTheDocument()
  })

  it('Save button is disabled until rating selected', async () => {
    render(<ReflectionCard {...baseProps} />)
    expect(screen.getByText('Save reflection').closest('button')).toBeDisabled()
  })

  it('enables Save button after rating selected', async () => {
    render(<ReflectionCard {...baseProps} />)
    await userEvent.click(screen.getByRole('button', { name: '3' }))
    expect(screen.getByText('Save reflection').closest('button')).not.toBeDisabled()
  })

  it('calls completeCheckIn with rating and reflection on submit', async () => {
    const { completeCheckIn } = await import('@/server/actions/check-ins')
    render(<ReflectionCard {...baseProps} />)
    await userEvent.click(screen.getByRole('button', { name: '4' }))
    await userEvent.type(screen.getByPlaceholderText(/optional/i), 'Felt great!')
    await userEvent.click(screen.getByText('Save reflection'))
    expect(completeCheckIn).toHaveBeenCalledWith({
      id: baseProps.checkInId,
      rating: 4,
      reflectionText: 'Felt great!',
    })
  })

  it('shows confirmation after save', async () => {
    render(<ReflectionCard {...baseProps} />)
    await userEvent.click(screen.getByRole('button', { name: '5' }))
    await userEvent.click(screen.getByText('Save reflection'))
    expect(await screen.findByText(/Reflection saved/)).toBeInTheDocument()
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
