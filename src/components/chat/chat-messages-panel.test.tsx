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

let capturedRendererProps: Record<string, unknown> | undefined
interface MockProposeEventResultProps {
  readonly toolCallId: string
  readonly result: {
    readonly title: string
    readonly recurrence?: string
    readonly recurrenceCount?: number
  }
  readonly inlineDayPreview?: boolean
}
vi.mock('@/components/chat/tool-result-renderer', () => ({
  ToolResultRenderer: (props: Record<string, unknown>) => {
    capturedRendererProps = props
    return <div data-testid="tool-result" />
  },
  ProposeEventResult: ({ toolCallId, result, inlineDayPreview }: MockProposeEventResultProps) => (
    <div
      data-testid="carried-proposal"
      data-tool-call-id={toolCallId}
      data-recurrence={result.recurrence ?? 'none'}
      data-recurrence-count={result.recurrenceCount ?? 'none'}
      data-inline-preview={String(inlineDayPreview)}
    >
      {result.title}
    </div>
  ),
}))

const noopFns = {
  input: '',
  setInput: vi.fn(),
  handleSubmit: vi.fn(),
  isLoading: false,
  append: vi.fn(),
  onScheduleUpdate: vi.fn(),
  onItemConfirmed: vi.fn(),
  onRetry: vi.fn(),
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

  it('threads the event-proposal callbacks through to the tool renderer', () => {
    const onEventProposed = vi.fn()
    const onEventResolved = vi.fn()
    const messages = [
      {
        id: '1',
        role: 'assistant' as const,
        content: '',
        toolInvocations: [
          {
            toolCallId: 'tc1',
            toolName: 'proposeEvent',
            args: {},
            state: 'result' as const,
            result: {},
          },
        ],
      },
    ]
    render(
      <ChatMessagesPanel
        messages={messages}
        {...noopFns}
        onEventProposed={onEventProposed}
        onEventResolved={onEventResolved}
      />,
    )
    expect(capturedRendererProps?.onEventProposed).toBe(onEventProposed)
    expect(capturedRendererProps?.onEventResolved).toBe(onEventResolved)
  })

  it('threads inlineDayPreview through to the tool renderer', () => {
    const messages = [
      {
        id: '1',
        role: 'assistant' as const,
        content: '',
        toolInvocations: [
          {
            toolCallId: 'tc1',
            toolName: 'proposeEvent',
            args: {},
            state: 'result' as const,
            result: {},
          },
        ],
      },
    ]
    render(<ChatMessagesPanel messages={messages} {...noopFns} inlineDayPreview />)
    expect(capturedRendererProps?.inlineDayPreview).toBe(true)
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

  describe('error state', () => {
    it('renders the error message and a Retry button when an error is present', () => {
      render(<ChatMessagesPanel messages={[]} {...noopFns} error={new Error('boom')} />)
      expect(screen.getByText("Cy couldn't respond. Try again.")).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    })

    it('calls onRetry once when Retry is clicked', () => {
      const onRetry = vi.fn()
      render(
        <ChatMessagesPanel
          messages={[]}
          {...noopFns}
          error={new Error('boom')}
          onRetry={onRetry}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('does not render error UI when there is no error', () => {
      render(<ChatMessagesPanel messages={[]} {...noopFns} />)
      expect(screen.queryByText("Cy couldn't respond. Try again.")).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    })

    it('does not render loading dots when an error is present', () => {
      render(<ChatMessagesPanel messages={[]} {...noopFns} isLoading error={new Error('boom')} />)
      expect(screen.queryByTestId('loading-dots')).not.toBeInTheDocument()
    })
  })

  describe('carriedProposals', () => {
    const carried = [
      { toolCallId: 'call-1', title: 'Dentist', date: '2026-06-03', start: '14:00', end: '15:00' },
      {
        toolCallId: 'call-2',
        title: 'Standup',
        date: '2026-06-01',
        start: '09:00',
        end: '09:15',
        recurrence: 'weekly' as const,
        recurrenceDays: ['Mon', 'Fri'] as const,
        recurrenceCount: 8,
      },
    ]

    it('renders one card per carried proposal, echoing title and recurrence', () => {
      render(<ChatMessagesPanel messages={[]} {...noopFns} carriedProposals={carried} />)
      const cards = screen.getAllByTestId('carried-proposal')
      expect(cards).toHaveLength(2)
      expect(screen.getByText('Dentist')).toBeInTheDocument()
      const standup = cards.find((c) => c.getAttribute('data-tool-call-id') === 'call-2')
      expect(standup).toHaveAttribute('data-recurrence', 'weekly')
      expect(standup).toHaveAttribute('data-recurrence-count', '8')
    })

    it('leaves the inline day preview unset on carried cards', () => {
      render(<ChatMessagesPanel messages={[]} {...noopFns} carriedProposals={carried} />)
      const cards = screen.getAllByTestId('carried-proposal')
      cards.forEach((card) => expect(card).toHaveAttribute('data-inline-preview', 'undefined'))
    })

    it('renders no carried cards when the prop is absent', () => {
      render(<ChatMessagesPanel messages={[]} {...noopFns} />)
      expect(screen.queryByTestId('carried-proposal')).not.toBeInTheDocument()
    })

    it('renders no carried cards for an empty array', () => {
      render(<ChatMessagesPanel messages={[]} {...noopFns} carriedProposals={[]} />)
      expect(screen.queryByTestId('carried-proposal')).not.toBeInTheDocument()
    })
  })

  describe('inputReplacement', () => {
    it('renders the replacement node instead of the form when inputReplacement is provided', () => {
      render(
        <ChatMessagesPanel
          messages={[]}
          {...noopFns}
          inputReplacement={<div data-testid="custom-replacement">No input</div>}
        />,
      )
      expect(screen.getByTestId('custom-replacement')).toBeInTheDocument()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /send/i })).not.toBeInTheDocument()
    })

    it('renders the form when inputReplacement is not provided', () => {
      render(<ChatMessagesPanel messages={[]} {...noopFns} />)
      expect(screen.getByRole('textbox')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument()
      expect(screen.queryByTestId('custom-replacement')).not.toBeInTheDocument()
    })
  })
})
