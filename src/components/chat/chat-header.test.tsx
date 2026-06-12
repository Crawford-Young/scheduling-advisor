import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChatHeader } from './chat-header'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

describe('ChatHeader', () => {
  it('renders conversation title', () => {
    render(<ChatHeader title="My chat" tokenBalance={42} onBack={() => {}} />)
    expect(screen.getByText('My chat')).toBeInTheDocument()
  })

  it('renders token balance', () => {
    render(<ChatHeader title="Chat" tokenBalance={100} onBack={() => {}} />)
    expect(screen.getByLabelText('Token balance: 100')).toBeInTheDocument()
  })

  it('renders Untitled when title is null', () => {
    render(<ChatHeader title={null} tokenBalance={0} onBack={() => {}} />)
    expect(screen.getByText('Untitled')).toBeInTheDocument()
  })

  it('calls onBack when back button clicked', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    render(<ChatHeader title="Chat" tokenBalance={0} onBack={onBack} />)
    await user.click(screen.getByRole('button', { name: 'Back to reflections' }))
    expect(onBack).toHaveBeenCalledOnce()
  })
})
