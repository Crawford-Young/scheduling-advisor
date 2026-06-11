import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatFab } from '@/components/chat/chat-fab'

const mockPush = vi.hoisted(() => vi.fn())
const mockCreateConversation = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'conv-123' }))

vi.mock('@/server/actions/conversations', () => ({
  createConversation: mockCreateConversation,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/lib/ui', () => ({
  ChatFab: ({ onClick }: { onClick: () => void }) =>
    React.createElement('button', { onClick, 'aria-label': 'Open chat' }, 'Chat'),
}))

describe('ChatFab', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the chat fab button', () => {
    render(<ChatFab />)
    expect(screen.getByRole('button', { name: 'Open chat' })).toBeInTheDocument()
  })

  it('calls createConversation and navigates on click', async () => {
    render(<ChatFab />)
    await userEvent.click(screen.getByRole('button', { name: 'Open chat' }))
    await vi.waitFor(() => {
      expect(mockCreateConversation).toHaveBeenCalledWith('general')
      expect(mockPush).toHaveBeenCalledWith('/chat/conv-123')
    })
  })

  it('does not call createConversation again while transition is pending (isPending guard)', async () => {
    // Simulate a slow createConversation to hold isPending=true
    let resolveCreate!: (v: { id: string }) => void
    const pendingPromise = new Promise<{ id: string }>((res) => {
      resolveCreate = res
    })
    mockCreateConversation.mockReturnValueOnce(pendingPromise)

    render(<ChatFab />)
    const btn = screen.getByRole('button', { name: 'Open chat' })

    // First click — starts the transition (isPending becomes true)
    await userEvent.click(btn)

    // Second click while transition still pending — should be a no-op
    await userEvent.click(btn)

    // Now resolve to clean up
    resolveCreate({ id: 'conv-456' })
    await vi.waitFor(() => expect(mockPush).toHaveBeenCalled())

    // createConversation called only once despite two clicks
    expect(mockCreateConversation).toHaveBeenCalledTimes(1)
  })
})
