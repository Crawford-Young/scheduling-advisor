import * as React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ChatSurface } from './chat-surface'
import type { ConversationMessage } from '@/server/queries/conversations'
import type { AppEvent } from './tool-result-renderer'

interface UseChatConfig {
  readonly onFinish?: () => Promise<void>
  readonly body?: unknown
}

let useChatMessages: { id: string; role: string; content: string }[] = []
let useChatInput = ''
let useChatError: Error | undefined
let capturedOnFinish: (() => Promise<void>) | undefined
let capturedHookBody: unknown
const setInputMock = vi.fn()
const handleSubmitMock = vi.fn()
const reloadMock = vi.fn()
const appendMock = vi.fn()

vi.mock('ai/react', () => ({
  useChat: ({ onFinish, body }: UseChatConfig) => {
    capturedOnFinish = onFinish
    capturedHookBody = body
    return {
      messages: useChatMessages,
      input: useChatInput,
      setInput: setInputMock,
      handleSubmit: handleSubmitMock,
      isLoading: false,
      append: appendMock,
      error: useChatError,
      reload: reloadMock,
    }
  },
}))

let capturedPanelSubmit: ((e?: React.FormEvent) => void) | undefined
let capturedOnScheduleUpdate: ((weekStart: string, events: readonly AppEvent[]) => void) | undefined
let capturedOnItemConfirmed:
  | ((action: string, entityType: 'habit' | 'goal' | 'event', date?: string, time?: string) => void)
  | undefined

vi.mock('@/components/chat/chat-messages-panel', () => ({
  ChatMessagesPanel: ({
    messages,
    handleSubmit,
    onScheduleUpdate,
    onItemConfirmed,
    inputReplacement,
    error,
    onRetry,
  }: {
    messages: readonly { id: string; content: string }[]
    handleSubmit: (e?: React.FormEvent) => void
    onScheduleUpdate?: (weekStart: string, events: readonly AppEvent[]) => void
    onItemConfirmed?: (
      action: string,
      entityType: 'habit' | 'goal' | 'event',
      date?: string,
      time?: string,
    ) => void
    inputReplacement?: React.ReactNode
    error?: Error
    onRetry?: () => void
  }) => {
    capturedPanelSubmit = handleSubmit
    capturedOnScheduleUpdate = onScheduleUpdate
    capturedOnItemConfirmed = onItemConfirmed
    return (
      <div data-testid="messages-panel">
        {messages.map((m) => (
          <div key={m.id} data-testid="message">
            {m.content}
          </div>
        ))}
        {error && (
          <div data-testid="panel-error">
            <span data-testid="panel-error-message">{error.message}</span>
            <button onClick={onRetry}>panel-retry</button>
          </div>
        )}
        {inputReplacement ?? <textarea aria-label="chat input" />}
      </div>
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

const initialMessages: ConversationMessage[] = [
  { id: 'seed-1', role: 'user', content: 'Previously said' },
]
const existingConversation = { id: 'c1', title: 'Existing' } as const

describe('ChatSurface', () => {
  beforeEach(() => {
    useChatMessages = []
    useChatInput = ''
    useChatError = undefined
    capturedOnFinish = undefined
    capturedHookBody = undefined
    setInputMock.mockClear()
    handleSubmitMock.mockClear()
    reloadMock.mockClear()
    appendMock.mockClear()
    getTokenBalanceActionMock.mockClear()
    getTokenBalanceActionMock.mockResolvedValue(50)
    setConversationTitleMock.mockClear()
  })

  it('renders the messages from useChat as data', () => {
    useChatMessages = [{ id: 'm1', role: 'user', content: 'Plan my week' }]
    render(
      <ChatSurface
        conversation={existingConversation}
        initialMessages={initialMessages}
        initialTokenBalance={50}
      />,
    )
    expect(screen.getByTestId('message')).toHaveTextContent('Plan my week')
  })

  it('seeds the hook body with the existing conversation id', () => {
    render(
      <ChatSurface
        conversation={existingConversation}
        initialMessages={initialMessages}
        initialTokenBalance={50}
      />,
    )
    expect(capturedHookBody).toEqual({ conversationId: 'c1' })
  })

  it('submits with an existing conversation passing per-request body', async () => {
    render(
      <ChatSurface
        conversation={existingConversation}
        initialMessages={initialMessages}
        initialTokenBalance={50}
      />,
    )
    await act(async () => {
      await capturedPanelSubmit?.()
    })
    expect(handleSubmitMock).toHaveBeenCalledWith(undefined, {
      body: { conversationId: 'c1' },
    })
  })

  it('lazily creates a conversation before the first submit when none exists', async () => {
    const onEnsureConversation = vi.fn().mockResolvedValue({ id: 'new-id' })
    render(
      <ChatSurface
        conversation={null}
        initialMessages={initialMessages}
        initialTokenBalance={50}
        onEnsureConversation={onEnsureConversation}
      />,
    )
    await act(async () => {
      await capturedPanelSubmit?.()
    })
    expect(onEnsureConversation).toHaveBeenCalledTimes(1)
    expect(handleSubmitMock).toHaveBeenCalledWith(undefined, {
      body: { conversationId: 'new-id' },
    })
  })

  it('dispatches token-balance-changed on finish and refreshes balance', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    render(
      <ChatSurface
        conversation={existingConversation}
        initialMessages={initialMessages}
        initialTokenBalance={50}
      />,
    )
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
    render(
      <ChatSurface
        conversation={existingConversation}
        initialMessages={initialMessages}
        initialTokenBalance={50}
      />,
    )
    await act(async () => {
      await capturedOnFinish?.()
    })
    expect(getTokenBalanceActionMock).toHaveBeenCalled()
  })

  describe('zero balance', () => {
    it('replaces the input with a "Get tokens" CTA when balance is below one', () => {
      render(
        <ChatSurface
          conversation={existingConversation}
          initialMessages={initialMessages}
          initialTokenBalance={0}
        />,
      )
      const link = screen.getByRole('link', { name: /get tokens/i })
      expect(link).toHaveAttribute('href', '/tokens')
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })

    it('describes the assistant value in the CTA', () => {
      render(
        <ChatSurface
          conversation={existingConversation}
          initialMessages={initialMessages}
          initialTokenBalance={0}
        />,
      )
      expect(screen.getByText(/plans your schedule/i)).toBeInTheDocument()
      expect(screen.getByText(/out of tokens/i)).toBeInTheDocument()
    })

    it('keeps the input when balance is at least one', () => {
      render(
        <ChatSurface
          conversation={existingConversation}
          initialMessages={initialMessages}
          initialTokenBalance={1}
        />,
      )
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })
  })

  describe('error passthrough', () => {
    it('renders the useChat error message through the panel', () => {
      useChatError = new Error('boom')
      render(
        <ChatSurface
          conversation={existingConversation}
          initialMessages={initialMessages}
          initialTokenBalance={50}
        />,
      )
      expect(screen.getByTestId('panel-error-message')).toHaveTextContent('boom')
    })

    it('wires panel retry to useChat reload', () => {
      useChatError = new Error('boom')
      render(
        <ChatSurface
          conversation={existingConversation}
          initialMessages={initialMessages}
          initialTokenBalance={50}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: 'panel-retry' }))
      expect(reloadMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('prefill', () => {
    it('seeds the input with the prefill when the input is empty', () => {
      useChatInput = ''
      render(
        <ChatSurface
          conversation={existingConversation}
          initialMessages={initialMessages}
          initialTokenBalance={50}
          prefill="Reschedule my afternoon"
        />,
      )
      expect(setInputMock).toHaveBeenCalledWith('Reschedule my afternoon')
    })

    it('does not overwrite a non-empty input', () => {
      useChatInput = 'already typing'
      render(
        <ChatSurface
          conversation={existingConversation}
          initialMessages={initialMessages}
          initialTokenBalance={50}
          prefill="Reschedule my afternoon"
        />,
      )
      expect(setInputMock).not.toHaveBeenCalled()
    })

    it('does nothing when no prefill is provided', () => {
      render(
        <ChatSurface
          conversation={existingConversation}
          initialMessages={initialMessages}
          initialTokenBalance={50}
        />,
      )
      expect(setInputMock).not.toHaveBeenCalled()
    })
  })

  describe('auto title', () => {
    it('sets the title when the conversation title is null and there are 2+ messages', async () => {
      useChatMessages = [
        { id: '1', role: 'user', content: 'Tell me about scheduling' },
        { id: '2', role: 'assistant', content: 'Sure!' },
      ]
      render(
        <ChatSurface
          conversation={{ id: 'c1', title: null }}
          initialMessages={initialMessages}
          initialTokenBalance={50}
        />,
      )
      await vi.waitFor(() => {
        expect(setConversationTitleMock).toHaveBeenCalledWith('c1', 'Tell me about scheduling')
      })
    })

    it('does not set the title when the conversation already has one', () => {
      useChatMessages = [
        { id: '1', role: 'user', content: 'Tell me about scheduling' },
        { id: '2', role: 'assistant', content: 'Sure!' },
      ]
      render(
        <ChatSurface
          conversation={existingConversation}
          initialMessages={initialMessages}
          initialTokenBalance={50}
        />,
      )
      expect(setConversationTitleMock).not.toHaveBeenCalled()
    })

    it('does not set the title when there is no conversation', () => {
      useChatMessages = [
        { id: '1', role: 'user', content: 'Tell me about scheduling' },
        { id: '2', role: 'assistant', content: 'Sure!' },
      ]
      render(
        <ChatSurface
          conversation={null}
          initialMessages={initialMessages}
          initialTokenBalance={50}
        />,
      )
      expect(setConversationTitleMock).not.toHaveBeenCalled()
    })

    it('does not set the title when there is no user message', () => {
      useChatMessages = [
        { id: '1', role: 'assistant', content: 'Hello' },
        { id: '2', role: 'assistant', content: 'Anyone?' },
      ]
      render(
        <ChatSurface
          conversation={{ id: 'c1', title: null }}
          initialMessages={initialMessages}
          initialTokenBalance={50}
        />,
      )
      expect(setConversationTitleMock).not.toHaveBeenCalled()
    })

    it('does not set the title with fewer than 2 messages', () => {
      useChatMessages = [{ id: '1', role: 'user', content: 'Only one' }]
      render(
        <ChatSurface
          conversation={{ id: 'c1', title: null }}
          initialMessages={initialMessages}
          initialTokenBalance={50}
        />,
      )
      expect(setConversationTitleMock).not.toHaveBeenCalled()
    })
  })

  it('passes schedule callbacks through to the panel', () => {
    const onScheduleUpdate = vi.fn()
    const onItemConfirmed = vi.fn()
    render(
      <ChatSurface
        conversation={existingConversation}
        initialMessages={initialMessages}
        initialTokenBalance={50}
        onScheduleUpdate={onScheduleUpdate}
        onItemConfirmed={onItemConfirmed}
      />,
    )
    capturedOnScheduleUpdate?.('2026-06-02', [])
    capturedOnItemConfirmed?.('Run', 'habit')
    expect(onScheduleUpdate).toHaveBeenCalledWith('2026-06-02', [])
    expect(onItemConfirmed).toHaveBeenCalledWith('Run', 'habit')
  })
})
