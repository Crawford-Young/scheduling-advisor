import * as React from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { UIMessage } from 'ai'
import { ChatSurface } from './chat-surface'
import type { ConversationMessage } from '@/server/queries/conversations'
import type { AppEvent } from './tool-result-renderer'

// ai@7 useChat mock — no input/handleSubmit/append/reload; the surface owns the
// controlled input and calls sendMessage / regenerate.
let useChatMessages: UIMessage[] = []
let useChatError: Error | undefined
let useChatStatus: 'ready' | 'submitted' | 'streaming' | 'error' = 'ready'
let capturedOnFinish: (() => Promise<void>) | undefined
const sendMessageMock = vi.fn().mockResolvedValue(undefined)
const regenerateMock = vi.fn().mockResolvedValue(undefined)
const setMessagesMock = vi.fn()

interface UseChatConfig {
  readonly onFinish?: () => Promise<void>
  readonly transport?: unknown
  readonly messages?: UIMessage[]
}

vi.mock('@ai-sdk/react', () => ({
  useChat: ({ onFinish }: UseChatConfig) => {
    capturedOnFinish = onFinish
    return {
      messages: useChatMessages,
      sendMessage: sendMessageMock,
      regenerate: regenerateMock,
      status: useChatStatus,
      error: useChatError,
      setMessages: setMessagesMock,
      clearError: vi.fn(),
      stop: vi.fn(),
      id: 'chat-1',
    }
  },
}))

// ai@7 DefaultChatTransport is mocked to capture its construction options so the
// wire-format adapter (prepareSendMessagesRequest) and the seeded body can be
// asserted without a real fetch.
interface TransportOptions {
  readonly api: string
  readonly body: unknown
  readonly prepareSendMessagesRequest: (opts: {
    messages: UIMessage[]
    body: Record<string, unknown>
  }) => { body: Record<string, unknown> }
}
let capturedTransportOptions: TransportOptions | undefined
vi.mock('ai', () => ({
  DefaultChatTransport: class {
    constructor(options: TransportOptions) {
      capturedTransportOptions = options
    }
  },
}))

function messageText(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('')
}

let capturedPanelSubmit: ((e?: React.FormEvent) => void) | undefined
let capturedAppend: ((message: { role: 'user'; content: string }) => void) | undefined
let capturedOnScheduleUpdate: ((weekStart: string, events: readonly AppEvent[]) => void) | undefined
let capturedOnItemConfirmed:
  | ((action: string, entityType: 'habit' | 'goal' | 'event', date?: string, time?: string) => void)
  | undefined
let capturedOnEventProposed: unknown
let capturedOnEventResolved: unknown
let capturedInlineDayPreview: unknown
let capturedCarriedProposals: unknown

vi.mock('@/components/chat/chat-messages-panel', () => ({
  ChatMessagesPanel: ({
    messages,
    input,
    setInput,
    handleSubmit,
    append,
    onScheduleUpdate,
    onItemConfirmed,
    onEventProposed,
    onEventResolved,
    carriedProposals,
    inlineDayPreview,
    inputReplacement,
    error,
    onRetry,
  }: {
    messages: readonly UIMessage[]
    input: string
    setInput: (value: string) => void
    handleSubmit: (e?: React.FormEvent) => void
    append: (message: { role: 'user'; content: string }) => void
    onScheduleUpdate?: (weekStart: string, events: readonly AppEvent[]) => void
    onItemConfirmed?: (
      action: string,
      entityType: 'habit' | 'goal' | 'event',
      date?: string,
      time?: string,
    ) => void
    onEventProposed?: unknown
    onEventResolved?: unknown
    carriedProposals?: unknown
    inlineDayPreview?: boolean
    inputReplacement?: React.ReactNode
    error?: Error
    onRetry?: () => void
  }) => {
    capturedPanelSubmit = handleSubmit
    capturedAppend = append
    capturedOnScheduleUpdate = onScheduleUpdate
    capturedOnItemConfirmed = onItemConfirmed
    capturedOnEventProposed = onEventProposed
    capturedOnEventResolved = onEventResolved
    capturedCarriedProposals = carriedProposals
    capturedInlineDayPreview = inlineDayPreview
    return (
      <form data-testid="surface-form" onSubmit={handleSubmit}>
        {messages.map((m) => (
          <div key={m.id} data-testid="message">
            {messageText(m)}
          </div>
        ))}
        {error && (
          <div data-testid="panel-error">
            <span data-testid="panel-error-message">{error.message}</span>
            <button type="button" onClick={onRetry}>
              panel-retry
            </button>
          </div>
        )}
        {inputReplacement ?? (
          <>
            <textarea
              aria-label="chat input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button type="submit">send</button>
          </>
        )}
      </form>
    )
  },
}))

const getTokenBalanceActionMock = vi.fn().mockResolvedValue(50)
vi.mock('@/server/actions/tokens', () => ({
  getTokenBalanceAction: () => getTokenBalanceActionMock(),
}))

const setConversationTitleMock = vi.fn()
vi.mock('@/server/actions/conversations', () => ({
  setConversationTitle: (id: string, title: string) => setConversationTitleMock(id, title),
}))

function uiMessage(id: string, role: 'user' | 'assistant', text: string): UIMessage {
  return { id, role, parts: [{ type: 'text', text }] }
}

const initialMessages: ConversationMessage[] = [
  { id: 'seed-1', role: 'user', content: 'Previously said' },
]
const existingConversation = { id: 'c1', title: 'Existing' } as const

function renderSurface(
  overrides: Partial<React.ComponentProps<typeof ChatSurface>> = {},
): ReturnType<typeof render> {
  return render(
    <ChatSurface
      conversation={existingConversation}
      initialMessages={initialMessages}
      initialTokenBalance={50}
      {...overrides}
    />,
  )
}

describe('ChatSurface', () => {
  beforeEach(() => {
    useChatMessages = []
    useChatError = undefined
    useChatStatus = 'ready'
    capturedOnFinish = undefined
    capturedTransportOptions = undefined
    capturedInlineDayPreview = undefined
    capturedCarriedProposals = undefined
    sendMessageMock.mockClear()
    regenerateMock.mockClear()
    getTokenBalanceActionMock.mockClear()
    getTokenBalanceActionMock.mockResolvedValue(50)
    setConversationTitleMock.mockClear()
  })

  it('renders the messages from useChat as data', () => {
    useChatMessages = [uiMessage('m1', 'user', 'Plan my week')]
    renderSurface()
    expect(screen.getByTestId('message')).toHaveTextContent('Plan my week')
  })

  it('seeds the transport body with the existing conversation id', () => {
    renderSurface()
    expect(capturedTransportOptions?.body).toEqual({ conversationId: 'c1' })
    expect(capturedTransportOptions?.api).toBe('/api/chat')
  })

  it('flattens UIMessage parts to { role, content } on the wire, dropping tool parts', () => {
    renderSurface()
    const prepared = capturedTransportOptions?.prepareSendMessagesRequest({
      messages: [
        {
          id: 'm1',
          role: 'user',
          parts: [
            { type: 'text', text: 'hi' },
            {
              type: 'tool-proposeEvent',
              toolCallId: 't1',
              state: 'output-available',
              input: {},
              output: {},
            } as UIMessage['parts'][number],
          ],
        },
      ],
      body: { conversationId: 'c1' },
    })
    expect(prepared?.body).toEqual({
      conversationId: 'c1',
      messages: [{ role: 'user', content: 'hi' }],
    })
  })

  it('sends the trimmed input with the existing conversation id', async () => {
    renderSurface()
    fireEvent.change(screen.getByLabelText('chat input'), { target: { value: 'Plan my week' } })
    fireEvent.submit(screen.getByTestId('surface-form'))
    await waitFor(() =>
      expect(sendMessageMock).toHaveBeenCalledWith(
        { text: 'Plan my week' },
        { body: { conversationId: 'c1' } },
      ),
    )
  })

  it('appends a card-driven transcript line as a user turn via sendMessage', () => {
    renderSurface()
    capturedAppend?.({ role: 'user', content: '[CONFIRMED] Standup — 2026-06-02 09:00–10:00' })
    expect(sendMessageMock).toHaveBeenCalledWith({
      text: '[CONFIRMED] Standup — 2026-06-02 09:00–10:00',
    })
  })

  it('does not send when the input is only whitespace', async () => {
    renderSurface()
    fireEvent.change(screen.getByLabelText('chat input'), { target: { value: '   ' } })
    await act(async () => {
      await capturedPanelSubmit?.()
    })
    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it('lazily creates a conversation before the first send when none exists', async () => {
    const onEnsureConversation = vi.fn().mockResolvedValue({ id: 'new-id' })
    renderSurface({ conversation: null, onEnsureConversation })
    fireEvent.change(screen.getByLabelText('chat input'), { target: { value: 'hi there' } })
    fireEvent.submit(screen.getByTestId('surface-form'))
    await waitFor(() => expect(onEnsureConversation).toHaveBeenCalledTimes(1))
    expect(sendMessageMock).toHaveBeenCalledWith(
      { text: 'hi there' },
      { body: { conversationId: 'new-id' } },
    )
  })

  it('dispatches token-balance-changed on finish and refreshes balance', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    renderSurface()
    await act(async () => {
      await capturedOnFinish?.()
    })
    expect(getTokenBalanceActionMock).toHaveBeenCalled()
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'token-balance-changed' }),
    )
    dispatchSpy.mockRestore()
  })

  it('swallows a failed balance refresh on finish', async () => {
    getTokenBalanceActionMock.mockRejectedValueOnce(new Error('offline'))
    renderSurface()
    await act(async () => {
      await capturedOnFinish?.()
    })
    expect(getTokenBalanceActionMock).toHaveBeenCalled()
  })

  describe('zero balance', () => {
    it('replaces the input with a "Get tokens" CTA when balance is below one', () => {
      renderSurface({ initialTokenBalance: 0 })
      const link = screen.getByRole('link', { name: /get tokens/i })
      expect(link).toHaveAttribute('href', '/tokens')
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })

    it('describes the assistant value in the CTA', () => {
      renderSurface({ initialTokenBalance: 0 })
      expect(screen.getByText(/plans your schedule/i)).toBeInTheDocument()
      expect(screen.getByText(/out of tokens/i)).toBeInTheDocument()
    })

    it('keeps the input when balance is at least one', () => {
      renderSurface({ initialTokenBalance: 1 })
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })
  })

  describe('error passthrough', () => {
    it('renders the useChat error message through the panel', () => {
      useChatError = new Error('boom')
      renderSurface()
      expect(screen.getByTestId('panel-error-message')).toHaveTextContent('boom')
    })

    it('wires panel retry to useChat regenerate', () => {
      useChatError = new Error('boom')
      renderSurface()
      fireEvent.click(screen.getByRole('button', { name: 'panel-retry' }))
      expect(regenerateMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('prefill', () => {
    it('seeds the input with the prefill when the input is empty', () => {
      renderSurface({ prefill: 'Reschedule my afternoon' })
      expect(screen.getByLabelText('chat input')).toHaveValue('Reschedule my afternoon')
    })

    it('does not overwrite input the user has already typed', () => {
      const { rerender } = renderSurface()
      fireEvent.change(screen.getByLabelText('chat input'), { target: { value: 'already typing' } })
      rerender(
        <ChatSurface
          conversation={existingConversation}
          initialMessages={initialMessages}
          initialTokenBalance={50}
          prefill="Reschedule my afternoon"
        />,
      )
      expect(screen.getByLabelText('chat input')).toHaveValue('already typing')
    })

    it('does nothing when no prefill is provided', () => {
      renderSurface()
      expect(screen.getByLabelText('chat input')).toHaveValue('')
    })
  })

  describe('auto title', () => {
    it('sets the title when the conversation title is null and there are 2+ messages', async () => {
      useChatMessages = [
        uiMessage('1', 'user', 'Tell me about scheduling'),
        uiMessage('2', 'assistant', 'Sure!'),
      ]
      renderSurface({ conversation: { id: 'c1', title: null } })
      await vi.waitFor(() => {
        expect(setConversationTitleMock).toHaveBeenCalledWith('c1', 'Tell me about scheduling')
      })
    })

    it('does not set the title when the conversation already has one', () => {
      useChatMessages = [
        uiMessage('1', 'user', 'Tell me about scheduling'),
        uiMessage('2', 'assistant', 'Sure!'),
      ]
      renderSurface()
      expect(setConversationTitleMock).not.toHaveBeenCalled()
    })

    it('does not set the title when there is no conversation', () => {
      useChatMessages = [
        uiMessage('1', 'user', 'Tell me about scheduling'),
        uiMessage('2', 'assistant', 'Sure!'),
      ]
      renderSurface({ conversation: null })
      expect(setConversationTitleMock).not.toHaveBeenCalled()
    })

    it('does not set the title when there is no user message', () => {
      useChatMessages = [
        uiMessage('1', 'assistant', 'Hello'),
        uiMessage('2', 'assistant', 'Anyone?'),
      ]
      renderSurface({ conversation: { id: 'c1', title: null } })
      expect(setConversationTitleMock).not.toHaveBeenCalled()
    })

    it('does not set the title with fewer than 2 messages', () => {
      useChatMessages = [uiMessage('1', 'user', 'Only one')]
      renderSurface({ conversation: { id: 'c1', title: null } })
      expect(setConversationTitleMock).not.toHaveBeenCalled()
    })
  })

  it('passes schedule callbacks through to the panel', () => {
    const onScheduleUpdate = vi.fn()
    const onItemConfirmed = vi.fn()
    renderSurface({ onScheduleUpdate, onItemConfirmed })
    capturedOnScheduleUpdate?.('2026-06-02', [])
    capturedOnItemConfirmed?.('Run', 'habit')
    expect(onScheduleUpdate).toHaveBeenCalledWith('2026-06-02', [])
    expect(onItemConfirmed).toHaveBeenCalledWith('Run', 'habit')
  })

  it('passes the event-proposal callbacks through to the panel', () => {
    const onEventProposed = vi.fn()
    const onEventResolved = vi.fn()
    renderSurface({ onEventProposed, onEventResolved })
    expect(capturedOnEventProposed).toBe(onEventProposed)
    expect(capturedOnEventResolved).toBe(onEventResolved)
  })

  it('forwards inlineDayPreview to the panel', () => {
    renderSurface({ inlineDayPreview: true })
    expect(capturedInlineDayPreview).toBe(true)
  })

  it('leaves inlineDayPreview undefined when not set', () => {
    renderSurface()
    expect(capturedInlineDayPreview).toBeUndefined()
  })

  it('forwards carriedProposals to the panel', () => {
    const carried = [
      { toolCallId: 'call-1', title: 'Dentist', date: '2026-06-03', start: '14:00', end: '15:00' },
    ]
    renderSurface({ carriedProposals: carried })
    expect(capturedCarriedProposals).toBe(carried)
  })

  it('leaves carriedProposals undefined when not set', () => {
    renderSurface()
    expect(capturedCarriedProposals).toBeUndefined()
  })
})
