import { render, screen, fireEvent } from '@testing-library/react'
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

  it('calls setInput when typing in textarea', () => {
    const setInput = vi.fn()
    render(<ChatMessagesPanel messages={[]} {...noopFns} setInput={setInput} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } })
    expect(setInput).toHaveBeenCalledWith('hello')
  })

  it('calls handleSubmit on Enter key in textarea', () => {
    const handleSubmit = vi.fn()
    render(<ChatMessagesPanel messages={[]} {...noopFns} handleSubmit={handleSubmit} />)
    const textarea = screen.getByRole('textbox')
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    expect(handleSubmit).toHaveBeenCalled()
  })

  it('does not submit on Shift+Enter', () => {
    const handleSubmit = vi.fn()
    render(<ChatMessagesPanel messages={[]} {...noopFns} handleSubmit={handleSubmit} />)
    const textarea = screen.getByRole('textbox')
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
    expect(handleSubmit).not.toHaveBeenCalled()
  })

  it('renders tool invocations from assistant message', () => {
    const messages = [
      {
        id: '1',
        role: 'assistant' as const,
        content: '',
        toolInvocations: [
          {
            toolCallId: 'tc1',
            toolName: 'showTaskCard',
            args: {},
            state: 'result' as const,
            result: {},
          },
        ],
      },
    ]
    render(<ChatMessagesPanel messages={messages} {...noopFns} />)
    expect(screen.getByTestId('tool-result')).toBeInTheDocument()
  })

  it('filters out non-result tool invocations', () => {
    const messages = [
      {
        id: '1',
        role: 'assistant' as const,
        content: '',
        toolInvocations: [
          { toolCallId: 'tc1', toolName: 'showTaskCard', args: {}, state: 'call' as const },
        ],
      },
    ]
    render(<ChatMessagesPanel messages={messages} {...noopFns} />)
    expect(screen.queryByTestId('tool-result')).not.toBeInTheDocument()
  })
})
