import * as React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { FullPageChatLayout } from './full-page-chat-layout'
import type { ConversationRow } from '@/server/queries/conversations'
import type { ConversationMessage } from '@/server/queries/conversations'
import type { AppEvent } from './tool-result-renderer'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock('@/components/chat/chat-header', () => ({
  ChatHeader: ({ title, onBack }: { title: string | null; onBack: () => void }) => (
    <div data-testid="chat-header">
      <button onClick={onBack}>back</button>
      {title}
    </div>
  ),
}))

let capturedInitialBalance: number | undefined
let capturedInitialMessages: readonly ConversationMessage[] | undefined
let capturedOnScheduleUpdate: ((weekStart: string, events: readonly AppEvent[]) => void) | undefined
let capturedOnItemConfirmed:
  | ((action: string, entityType: 'habit' | 'goal' | 'event', date?: string, time?: string) => void)
  | undefined

vi.mock('@/components/chat/chat-surface', () => ({
  ChatSurface: ({
    conversation,
    initialMessages,
    initialTokenBalance,
    onScheduleUpdate,
    onItemConfirmed,
  }: {
    conversation: { id: string; title: string | null } | null
    initialMessages: readonly ConversationMessage[]
    initialTokenBalance: number
    onScheduleUpdate?: (weekStart: string, events: readonly AppEvent[]) => void
    onItemConfirmed?: (
      action: string,
      entityType: 'habit' | 'goal' | 'event',
      date?: string,
      time?: string,
    ) => void
  }) => {
    capturedInitialBalance = initialTokenBalance
    capturedInitialMessages = initialMessages
    capturedOnScheduleUpdate = onScheduleUpdate
    capturedOnItemConfirmed = onItemConfirmed
    return (
      <div
        data-testid="chat-surface"
        data-conversation-id={conversation?.id ?? 'null'}
        data-conversation-title={conversation?.title ?? 'null'}
        data-balance={initialTokenBalance}
        data-message-count={initialMessages.length}
      />
    )
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

const initialMessages: ConversationMessage[] = [{ id: 'm1', role: 'user', content: 'Hi' }]

describe('FullPageChatLayout', () => {
  beforeEach(() => {
    pushMock.mockClear()
    capturedInitialBalance = undefined
    capturedInitialMessages = undefined
    capturedOnScheduleUpdate = undefined
    capturedOnItemConfirmed = undefined
  })

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

  describe('composition', () => {
    it('passes the conversation id and title to ChatSurface as data', () => {
      render(
        <FullPageChatLayout
          conversation={conversation}
          initialMessages={initialMessages}
          tokenBalance={42}
        />,
      )
      const surface = screen.getByTestId('chat-surface')
      expect(surface).toHaveAttribute('data-conversation-id', 'conv-1')
      expect(surface).toHaveAttribute('data-conversation-title', 'Test chat')
    })

    it('seeds ChatSurface with the initial balance and messages', () => {
      render(
        <FullPageChatLayout
          conversation={conversation}
          initialMessages={initialMessages}
          tokenBalance={42}
        />,
      )
      expect(capturedInitialBalance).toBe(42)
      expect(capturedInitialMessages).toBe(initialMessages)
    })
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

  it('onScheduleUpdate from ChatSurface makes schedule panel visible', () => {
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

  it('onItemConfirmed from ChatSurface adds an event to schedule', () => {
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
})
