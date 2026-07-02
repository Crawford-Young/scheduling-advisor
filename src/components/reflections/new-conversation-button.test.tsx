import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NewConversationButton } from './new-conversation-button'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock('@/server/actions/conversations', () => ({
  createConversation: vi.fn().mockResolvedValue({ id: 'conv-new' }),
}))

describe('NewConversationButton', () => {
  beforeEach(() => {
    pushMock.mockClear()
  })

  it('renders an accessible button labeled "New conversation"', () => {
    render(<NewConversationButton />)
    expect(screen.getByRole('button', { name: /new conversation/i })).toBeInTheDocument()
  })

  it('starts a general conversation and navigates to it on click', async () => {
    const { createConversation } = await import('@/server/actions/conversations')
    render(<NewConversationButton />)
    fireEvent.click(screen.getByRole('button', { name: /new conversation/i }))
    await vi.waitFor(() => {
      expect(createConversation).toHaveBeenCalledWith('general')
      expect(pushMock).toHaveBeenCalledWith('/chat/conv-new')
    })
  })

  it('disables the button while the transition is pending', async () => {
    const { createConversation } = await import('@/server/actions/conversations')
    let resolveCreate: (value: { id: string }) => void = () => {}
    vi.mocked(createConversation).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve
        }),
    )

    render(<NewConversationButton />)
    const button = screen.getByRole('button', { name: /new conversation/i })
    fireEvent.click(button)

    await vi.waitFor(() => {
      expect(button).toBeDisabled()
    })

    resolveCreate({ id: 'conv-new' })

    await vi.waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/chat/conv-new')
    })
  })
})
