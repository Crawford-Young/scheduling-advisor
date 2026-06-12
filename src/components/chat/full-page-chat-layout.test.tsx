import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FullPageChatLayout } from './full-page-chat-layout'
import type { ConversationRow } from '@/server/queries/conversations'
import type { ConversationMessage } from '@/server/queries/conversations'
import type { AppEvent } from './tool-result-renderer'

const pushMock = vi.fn()

let capturedOnFinish: (() => Promise<void>) | undefined
let useChatMessages: unknown[] = []

vi.mock('ai/react', () => ({
  useChat: ({ onFinish }: { onFinish?: () => Promise<void> }) => {
    capturedOnFinish = onFinish
    return {
      messages: useChatMessages,
      input: '',
      setInput: vi.fn(),
      handleSubmit: vi.fn(),
      isLoading: false,
      append: vi.fn(),
    }
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock('@/components/chat/chat-header', () => ({
  ChatHeader: ({
    title,
    tokenBalance,
    onBack,
  }: {
    title: string | null
    tokenBalance: number
    onBack: () => void
  }) => (
    <div data-testid="chat-header" data-balance={tokenBalance}>
      <button onClick={onBack}>back</button>
      {title}
    </div>
  ),
}))

let capturedOnScheduleUpdate: ((weekStart: string, events: readonly AppEvent[]) => void) | undefined
let capturedOnItemConfirmed:
  | ((action: string, entityType: 'habit' | 'goal' | 'event', date?: string, time?: string) => void)
  | undefined

vi.mock('@/components/chat/chat-messages-panel', () => ({
  ChatMessagesPanel: ({
    onScheduleUpdate,
    onItemConfirmed,
  }: {
    onScheduleUpdate?: (weekStart: string, events: readonly AppEvent[]) => void
    onItemConfirmed?: (
      action: string,
      entityType: 'habit' | 'goal' | 'event',
      date?: string,
      time?: string,
    ) => void
  }) => {
    capturedOnScheduleUpdate = onScheduleUpdate
    capturedOnItemConfirmed = onItemConfirmed
    return <div data-testid="messages-panel" />
  },
}))

vi.mock('@/components/chat/schedule-panel', () => ({
  SchedulePanel: ({ state }: { state: { visible: boolean; events: readonly unknown[] } }) => (
    <div
      data-testid="schedule-panel"
      data-visible={state.visible}
      data-event-count={state.events.length}
    />
  ),
}))

vi.mock('@/server/actions/tokens', () => ({
  getTokenBalanceAction: vi.fn().mockResolvedValue(50),
}))

vi.mock('@/server/actions/conversations', () => ({
  setConversationTitle: vi.fn(),
}))

vi.mock('react-resizable-panels', () => ({
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Separator: () => <div data-testid="resize-handle" />,
}))

const conversation: ConversationRow = {
  id: 'conv-1',
  type: 'general',
  title: 'Test chat',
  createdAt: new Date(),
  updatedAt: new Date(),
  lastMessagePreview: '',
}

const initialMessages: ConversationMessage[] = []

describe('FullPageChatLayout', () => {
  it('renders chat header with title', () => {
    render(
      <FullPageChatLayout
        conversation={conversation}
        initialMessages={initialMessages}
        tokenBalance={42}
      />,
    )
    expect(screen.getByTestId('chat-header')).toHaveTextContent('Test chat')
  })

  it('renders messages panel', () => {
    render(
      <FullPageChatLayout
        conversation={conversation}
        initialMessages={initialMessages}
        tokenBalance={42}
      />,
    )
    expect(screen.getByTestId('messages-panel')).toBeInTheDocument()
  })

  it('schedule panel starts not visible', () => {
    render(
      <FullPageChatLayout
        conversation={conversation}
        initialMessages={initialMessages}
        tokenBalance={42}
      />,
    )
    expect(screen.getByTestId('schedule-panel')).toHaveAttribute('data-visible', 'false')
  })

  it('back button navigates to /reflections', () => {
    pushMock.mockClear()
    render(
      <FullPageChatLayout
        conversation={conversation}
        initialMessages={initialMessages}
        tokenBalance={42}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'back' }))
    expect(pushMock).toHaveBeenCalledWith('/reflections')
  })

  it('onScheduleUpdate makes schedule panel visible', () => {
    render(
      <FullPageChatLayout
        conversation={conversation}
        initialMessages={initialMessages}
        tokenBalance={42}
      />,
    )
    act(() => {
      capturedOnScheduleUpdate?.('2026-06-02', [
        {
          id: 'e1',
          title: 'Run',
          start: '2026-06-02T07:00:00',
          end: '2026-06-02T08:00:00',
          type: 'habit',
        },
      ])
    })
    expect(screen.getByTestId('schedule-panel')).toHaveAttribute('data-visible', 'true')
    expect(screen.getByTestId('schedule-panel')).toHaveAttribute('data-event-count', '1')
  })

  it('onItemConfirmed adds an event to schedule', () => {
    render(
      <FullPageChatLayout
        conversation={conversation}
        initialMessages={initialMessages}
        tokenBalance={42}
      />,
    )
    act(() => {
      capturedOnItemConfirmed?.('Morning Run', 'habit', '2026-06-02', '07:00')
    })
    expect(screen.getByTestId('schedule-panel')).toHaveAttribute('data-event-count', '1')
  })

  it('sets conversation title when title is null and 2+ messages', async () => {
    const { setConversationTitle } = await import('@/server/actions/conversations')
    useChatMessages = [
      { id: '1', role: 'user', content: 'Tell me about scheduling' },
      { id: '2', role: 'assistant', content: 'Sure!' },
    ]
    const nullTitleConversation = { ...conversation, title: null }
    render(
      <FullPageChatLayout
        conversation={nullTitleConversation}
        initialMessages={initialMessages}
        tokenBalance={42}
      />,
    )
    await vi.waitFor(() => {
      expect(setConversationTitle).toHaveBeenCalledWith('conv-1', expect.any(String))
    })
    useChatMessages = []
  })

  it('onFinish refreshes token balance', async () => {
    const { getTokenBalanceAction } = await import('@/server/actions/tokens')
    vi.mocked(getTokenBalanceAction).mockResolvedValueOnce(99)
    render(
      <FullPageChatLayout
        conversation={conversation}
        initialMessages={initialMessages}
        tokenBalance={42}
      />,
    )
    await act(async () => {
      await capturedOnFinish?.()
    })
    expect(getTokenBalanceAction).toHaveBeenCalled()
  })

  it('onItemConfirmed with no date/time uses defaults', () => {
    render(
      <FullPageChatLayout
        conversation={conversation}
        initialMessages={initialMessages}
        tokenBalance={42}
      />,
    )
    act(() => {
      capturedOnItemConfirmed?.('Team standup', 'event')
    })
    expect(screen.getByTestId('schedule-panel')).toHaveAttribute('data-event-count', '1')
  })

  describe('zero token balance', () => {
    it('shows a "Get tokens" link pointing to /tokens', () => {
      render(
        <FullPageChatLayout
          conversation={conversation}
          initialMessages={initialMessages}
          tokenBalance={0}
        />,
      )
      const link = screen.getByRole('link', { name: /get tokens/i })
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', '/tokens')
    })

    it('does not render the message input when balance is zero', () => {
      render(
        <FullPageChatLayout
          conversation={conversation}
          initialMessages={initialMessages}
          tokenBalance={0}
        />,
      )
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /send/i })).not.toBeInTheDocument()
    })

    it('describes the assistant value with planning/scheduling copy', () => {
      render(
        <FullPageChatLayout
          conversation={conversation}
          initialMessages={initialMessages}
          tokenBalance={0}
        />,
      )
      expect(screen.getByText(/plans your schedule/i)).toBeInTheDocument()
    })

    it('shows "out of tokens" heading', () => {
      render(
        <FullPageChatLayout
          conversation={conversation}
          initialMessages={initialMessages}
          tokenBalance={0}
        />,
      )
      expect(screen.getByText(/out of tokens/i)).toBeInTheDocument()
    })

    it('still renders the chat header with correct balance', () => {
      render(
        <FullPageChatLayout
          conversation={conversation}
          initialMessages={initialMessages}
          tokenBalance={0}
        />,
      )
      expect(screen.getByTestId('chat-header')).toHaveAttribute('data-balance', '0')
    })

    it('renders messages panel when balance is zero', () => {
      render(
        <FullPageChatLayout
          conversation={conversation}
          initialMessages={initialMessages}
          tokenBalance={0}
        />,
      )
      expect(screen.getByTestId('messages-panel')).toBeInTheDocument()
    })
  })
})
