import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FullPageChatLayout } from './full-page-chat-layout'
import type { ConversationRow } from '@/server/queries/conversations'
import type { ConversationMessage } from '@/server/queries/conversations'

vi.mock('ai/react', () => ({
  useChat: () => ({
    messages: [],
    input: '',
    setInput: vi.fn(),
    handleSubmit: vi.fn(),
    isLoading: false,
    append: vi.fn(),
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/components/chat/chat-header', () => ({
  ChatHeader: ({ title }: { title: string | null }) => <div data-testid="chat-header">{title}</div>,
}))

vi.mock('@/components/chat/chat-messages-panel', () => ({
  ChatMessagesPanel: () => <div data-testid="messages-panel" />,
}))

vi.mock('@/components/chat/schedule-panel', () => ({
  SchedulePanel: ({ state }: { state: { visible: boolean } }) => (
    <div data-testid="schedule-panel" data-visible={state.visible} />
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
})
