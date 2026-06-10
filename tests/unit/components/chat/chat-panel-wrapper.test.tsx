import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ChatPanelWrapper } from '@/components/chat/chat-panel-wrapper'

const mockSetInput = vi.fn()
const mockHandleSubmit = vi.fn()

vi.mock('ai/react', () => ({
  useChat: vi.fn(() => ({
    messages: [],
    input: '',
    setInput: mockSetInput,
    handleSubmit: mockHandleSubmit,
    isLoading: false,
    append: vi.fn(),
  })),
}))

vi.mock('next/navigation', () => ({ useRouter: vi.fn(() => ({ refresh: vi.fn() })) }))

vi.mock('@/lib/ui', () => ({
  ChatPanel: ({
    children,
    open,
  }: {
    children: React.ReactNode
    open: boolean
    onOpenChange?: (open: boolean) => void
    title?: string
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'chat-panel', 'data-open': String(open) },
      children,
    ),
  ChatFab: () => React.createElement('button', { 'aria-label': 'Open chat' }, 'Chat'),
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) =>
    React.createElement('textarea', props),
  Button: ({ children, onClick, disabled, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement('button', { onClick, disabled, ...p }, children),
}))

vi.mock('@/components/chat/tool-result-renderer', () => ({
  ToolResultRenderer: () => React.createElement('div', { 'data-testid': 'tool-result' }),
}))

vi.mock('lucide-react', () => ({
  Send: () => React.createElement('span', { 'aria-hidden': true }, 'Send'),
}))

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}))

describe('ChatPanelWrapper', () => {
  beforeEach(() => vi.clearAllMocks())

  it('seeds input from open-chat prefill detail without sending', () => {
    render(<ChatPanelWrapper conversationId="c1" initialMessages={[]} plan="pro" />)
    window.dispatchEvent(new CustomEvent('open-chat', { detail: { prefill: 'Find a new time' } }))
    expect(mockSetInput).toHaveBeenCalledWith('Find a new time')
    expect(mockHandleSubmit).not.toHaveBeenCalled()
  })

  it('opens panel on open-chat without prefill', () => {
    render(<ChatPanelWrapper conversationId="c1" initialMessages={[]} plan="pro" />)
    window.dispatchEvent(new CustomEvent('open-chat', { detail: {} }))
    expect(mockSetInput).not.toHaveBeenCalled()
    expect(mockHandleSubmit).not.toHaveBeenCalled()
  })

  it('ChatPanel receives open=true when open-chat event fires', () => {
    render(<ChatPanelWrapper conversationId="c1" initialMessages={[]} plan="pro" />)
    expect(screen.getByTestId('chat-panel')).toHaveAttribute('data-open', 'false')
    act(() => {
      window.dispatchEvent(new CustomEvent('open-chat', { detail: {} }))
    })
    expect(screen.getByTestId('chat-panel')).toHaveAttribute('data-open', 'true')
  })
})
