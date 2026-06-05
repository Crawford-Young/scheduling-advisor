import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ChatFab } from './chat-fab'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock('@/lib/ui', () => ({
  ChatFab: ({ onClick }: { onClick: () => void }) => (
    <button onClick={onClick} aria-label="Open AI assistant">
      chat
    </button>
  ),
}))

vi.mock('@/server/actions/conversations', () => ({
  createConversation: vi.fn().mockResolvedValue({ id: 'conv-new' }),
}))

describe('ChatFab', () => {
  beforeEach(() => {
    pushMock.mockClear()
  })

  it('renders the chat fab button', () => {
    render(<ChatFab />)
    expect(screen.getByRole('button', { name: /open ai assistant/i })).toBeInTheDocument()
  })

  it('navigates to new conversation on click', async () => {
    render(<ChatFab />)
    fireEvent.click(screen.getByRole('button', { name: /open ai assistant/i }))
    await vi.waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/chat/conv-new')
    })
  })
})
