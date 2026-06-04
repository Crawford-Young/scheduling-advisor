import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatMessagesPanel } from './chat-messages-panel'
import type { Message } from 'ai'

vi.mock('@/lib/ui', () => ({
  Textarea: ({
    value,
    onChange,
    onKeyDown,
    ...rest
  }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea value={value} onChange={onChange} onKeyDown={onKeyDown} {...rest} />
  ),
  Button: ({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...rest}>{children}</button>
  ),
}))

vi.mock('@/components/chat/tool-result-renderer', () => ({
  ToolResultRenderer: () => <div data-testid="tool-result" />,
}))

const noopFns = {
  input: '',
  setInput: vi.fn(),
  handleSubmit: vi.fn(),
  isLoading: false,
  append: vi.fn(),
  onScheduleUpdate: vi.fn(),
  onItemConfirmed: vi.fn(),
}

describe('ChatMessagesPanel', () => {
  it('renders empty state when no messages', () => {
    render(<ChatMessagesPanel messages={[]} {...noopFns} />)
    expect(screen.getByText('Ask me anything about your schedule.')).toBeInTheDocument()
  })

  it('renders user message', () => {
    const messages: Message[] = [{ id: '1', role: 'user', content: 'Hello AI' }]
    render(<ChatMessagesPanel messages={messages} {...noopFns} />)
    expect(screen.getByText('Hello AI')).toBeInTheDocument()
  })

  it('renders assistant message', () => {
    const messages: Message[] = [{ id: '1', role: 'assistant', content: 'Hello user' }]
    render(<ChatMessagesPanel messages={messages} {...noopFns} />)
    expect(screen.getByText('Hello user')).toBeInTheDocument()
  })

  it('renders loading dots when isLoading', () => {
    render(<ChatMessagesPanel messages={[]} {...noopFns} isLoading />)
    expect(screen.getByTestId('loading-dots')).toBeInTheDocument()
  })

  it('renders send button', () => {
    render(<ChatMessagesPanel messages={[]} {...noopFns} />)
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
  })
})
