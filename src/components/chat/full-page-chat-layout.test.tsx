import * as React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { FullPageChatLayout } from './full-page-chat-layout'
import type { ConversationRow } from '@/server/queries/conversations'
import type { ConversationMessage } from '@/server/queries/conversations'
import type { AppEvent, EventProposal, CreatedEvent } from './tool-result-renderer'
import type { ScheduleState } from './schedule-panel'
import type { ModelTier } from '@/lib/chat/model-tiers'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock('@/components/chat/chat-header', () => ({
  ChatHeader: ({
    title,
    onBack,
    model,
    onModelChange,
  }: {
    title: string | null
    onBack: () => void
    model: string
    onModelChange: (tier: string) => void
  }) => (
    <div data-testid="chat-header" data-model={model}>
      <button onClick={onBack}>back</button>
      <button onClick={() => onModelChange('opus')}>change-model</button>
      {title}
    </div>
  ),
}))

const setConversationModelMock = vi.fn()

vi.mock('@/server/actions/conversations', () => ({
  setConversationModel: (id: string, model: string) => setConversationModelMock(id, model),
}))

let capturedInitialBalance: number | undefined
let capturedInitialMessages: readonly ConversationMessage[] | undefined
let capturedOnScheduleUpdate: ((weekStart: string, events: readonly AppEvent[]) => void) | undefined
let capturedOnItemConfirmed:
  | ((action: string, entityType: 'habit' | 'goal' | 'event', date?: string, time?: string) => void)
  | undefined
let capturedOnEventProposed: ((proposal: EventProposal) => void) | undefined
let capturedOnEventResolved:
  | ((toolCallId: string, outcome: 'confirmed' | 'denied', created?: CreatedEvent) => void)
  | undefined
let capturedCarriedProposals: readonly EventProposal[] | undefined

vi.mock('@/components/chat/chat-surface', () => ({
  ChatSurface: ({
    conversation,
    initialMessages,
    initialTokenBalance,
    onScheduleUpdate,
    onItemConfirmed,
    onEventProposed,
    onEventResolved,
    carriedProposals,
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
    onEventProposed?: (proposal: EventProposal) => void
    onEventResolved?: (
      toolCallId: string,
      outcome: 'confirmed' | 'denied',
      created?: CreatedEvent,
    ) => void
    carriedProposals?: readonly EventProposal[]
  }) => {
    capturedInitialBalance = initialTokenBalance
    capturedInitialMessages = initialMessages
    capturedOnScheduleUpdate = onScheduleUpdate
    capturedOnItemConfirmed = onItemConfirmed
    capturedOnEventProposed = onEventProposed
    capturedOnEventResolved = onEventResolved
    capturedCarriedProposals = carriedProposals
    return (
      <div
        data-testid="chat-surface"
        data-conversation-id={conversation?.id ?? 'null'}
        data-conversation-title={conversation?.title ?? 'null'}
        data-balance={initialTokenBalance}
        data-message-count={initialMessages.length}
        data-carried-count={carriedProposals?.length ?? 0}
      />
    )
  },
}))

let capturedScheduleState: ScheduleState | undefined
let capturedResyncToken: number | undefined

vi.mock('@/components/chat/schedule-panel', () => ({
  SchedulePanel: ({ state, resyncToken }: { state: ScheduleState; resyncToken?: number }) => {
    capturedScheduleState = state
    capturedResyncToken = resyncToken
    return (
      <div
        data-testid="schedule-panel"
        data-visible={state.visible}
        data-week-start={state.weekStart}
        data-event-count={state.events.length}
        data-resync-token={resyncToken}
      />
    )
  },
}))

vi.mock('react-resizable-panels', () => ({
  Panel: ({
    children,
    id,
    minSize,
    defaultSize,
  }: {
    children: React.ReactNode
    id?: string
    minSize?: number
    defaultSize?: number
  }) => (
    <div data-testid="panel" data-id={id} data-min-size={minSize} data-default-size={defaultSize}>
      {children}
    </div>
  ),
  Group: ({
    children,
    defaultLayout,
  }: {
    children: React.ReactNode
    defaultLayout?: Record<string, number>
  }) => (
    <div data-testid="group" data-default-layout={JSON.stringify(defaultLayout)}>
      {children}
    </div>
  ),
  Separator: () => <div data-testid="resize-handle" />,
}))

const conversation: ConversationRow = {
  id: 'conv-1',
  type: 'general',
  model: 'sonnet',
  title: 'Test chat',
  createdAt: new Date(),
  updatedAt: new Date(),
  lastMessagePreview: '',
}

const initialMessages: ConversationMessage[] = [{ id: 'm1', role: 'user', content: 'Hi' }]

describe('FullPageChatLayout', () => {
  beforeEach(() => {
    pushMock.mockClear()
    setConversationModelMock.mockClear()
    capturedInitialBalance = undefined
    capturedInitialMessages = undefined
    capturedOnScheduleUpdate = undefined
    capturedOnItemConfirmed = undefined
    capturedOnEventProposed = undefined
    capturedOnEventResolved = undefined
    capturedCarriedProposals = undefined
    capturedScheduleState = undefined
    capturedResyncToken = undefined
    window.sessionStorage.clear()
  })

  function renderLayout(): void {
    render(
      <FullPageChatLayout
        conversation={conversation}
        initialMessages={initialMessages}
        tokenBalance={42}
      />,
    )
  }

  function localYmd(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  it('bounds both panels via minSize so a drag can never collapse either away', () => {
    renderLayout()
    const [chatPanel, schedulePanel] = screen.getAllByTestId('panel')
    // minSize on both bounds the drag both ways: schedule's 25% floor caps chat
    // at 75%, chat's 40% floor caps schedule at 60% — no maxSize needed (maxSize
    // on both froze the drag entirely).
    // Percentage STRINGS, not bare numbers: v4 parses a bare number as pixels, so
    // '40' would be a 40px floor (chat drags basically closed).
    expect(chatPanel).toHaveAttribute('data-id', 'chat-panel')
    expect(chatPanel).toHaveAttribute('data-min-size', '40%')
    expect(schedulePanel).toHaveAttribute('data-id', 'schedule-panel')
    expect(schedulePanel).toHaveAttribute('data-min-size', '25%')
  })

  it('seeds a defaultLayout so the panels do not flash as slivers on load', () => {
    renderLayout()
    const group = screen.getByTestId('group')
    expect(group).toHaveAttribute(
      'data-default-layout',
      JSON.stringify({ 'chat-panel': 60, 'schedule-panel': 40 }),
    )
  })

  const proposal: EventProposal = {
    toolCallId: 'call-1',
    title: 'Dentist',
    date: '2026-06-03',
    start: '14:00',
    end: '15:00',
  }

  describe('carried proposal hydration', () => {
    const KEY_CONV_1 = 'chat-pending-proposals:conv-1'
    const carried: EventProposal = {
      toolCallId: 'call-1',
      title: 'Dentist',
      date: '2026-06-03',
      start: '14:00',
      end: '15:00',
    }

    it('hydrates carried proposals from sessionStorage and passes them to the left-panel ChatSurface', () => {
      window.sessionStorage.setItem(KEY_CONV_1, JSON.stringify([carried]))
      renderLayout()
      expect(capturedCarriedProposals).toEqual([carried])
      expect(screen.getByTestId('chat-surface')).toHaveAttribute('data-carried-count', '1')
    })

    it('clears the sessionStorage key once hydrated (one-shot handoff)', () => {
      window.sessionStorage.setItem(KEY_CONV_1, JSON.stringify([carried]))
      renderLayout()
      expect(window.sessionStorage.getItem(KEY_CONV_1)).toBeNull()
    })

    it('passes no carried proposals when the key is absent', () => {
      renderLayout()
      expect(capturedCarriedProposals).toEqual([])
      expect(screen.getByTestId('chat-surface')).toHaveAttribute('data-carried-count', '0')
    })

    it('ignores a key stored under a different conversation id', () => {
      window.sessionStorage.setItem('chat-pending-proposals:other', JSON.stringify([carried]))
      renderLayout()
      expect(capturedCarriedProposals).toEqual([])
      expect(window.sessionStorage.getItem('chat-pending-proposals:other')).not.toBeNull()
    })

    it('hydrates only once — a later conversation id change does not re-read the handoff', () => {
      window.sessionStorage.setItem(KEY_CONV_1, JSON.stringify([carried]))
      const { rerender } = render(
        <FullPageChatLayout
          conversation={conversation}
          initialMessages={initialMessages}
          tokenBalance={42}
        />,
      )
      expect(capturedCarriedProposals).toEqual([carried])

      // A second conversation's handoff must be left untouched once hydrated — the
      // ref guard short-circuits the re-run the deps change would otherwise trigger.
      const KEY_CONV_2 = 'chat-pending-proposals:conv-2'
      window.sessionStorage.setItem(KEY_CONV_2, JSON.stringify([carried]))
      rerender(
        <FullPageChatLayout
          conversation={{ ...conversation, id: 'conv-2' }}
          initialMessages={initialMessages}
          tokenBalance={42}
        />,
      )
      expect(capturedCarriedProposals).toEqual([carried])
      expect(window.sessionStorage.getItem(KEY_CONV_2)).not.toBeNull()
    })
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

  describe('model tier', () => {
    it('seeds the header with the conversation model', () => {
      render(
        <FullPageChatLayout
          conversation={{ ...conversation, model: 'opus' }}
          initialMessages={initialMessages}
          tokenBalance={42}
        />,
      )
      expect(screen.getByTestId('chat-header')).toHaveAttribute('data-model', 'opus')
    })

    it('optimistically sets the model and persists it on change', () => {
      render(
        <FullPageChatLayout
          conversation={conversation}
          initialMessages={initialMessages}
          tokenBalance={42}
        />,
      )
      expect(screen.getByTestId('chat-header')).toHaveAttribute('data-model', 'sonnet')

      fireEvent.click(screen.getByRole('button', { name: 'change-model' }))

      expect(screen.getByTestId('chat-header')).toHaveAttribute('data-model', 'opus')
      expect(setConversationModelMock).toHaveBeenCalledWith('conv-1', 'opus')
    })

    it('normalizes a legacy haiku conversation model to sonnet', () => {
      render(
        <FullPageChatLayout
          conversation={{ ...conversation, model: 'haiku' as ModelTier }}
          initialMessages={initialMessages}
          tokenBalance={42}
        />,
      )
      expect(screen.getByTestId('chat-header')).toHaveAttribute('data-model', 'sonnet')
    })
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
    renderLayout()
    const tokenBefore = capturedResyncToken
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
    expect(capturedResyncToken).not.toBe(tokenBefore)
  })

  it('maps each AppEvent type to its calendar color', () => {
    renderLayout()
    act(() => {
      capturedOnScheduleUpdate?.('2026-06-02', [
        { id: 't', title: 'Task', start: 's', end: 'e', type: 'task' },
        { id: 'g', title: 'Goal', start: 's', end: 'e', type: 'goal' },
        { id: 'h', title: 'Habit', start: 's', end: 'e', type: 'habit' },
        { id: 'c', title: 'Cal', start: 's', end: 'e', type: 'calendar' },
      ])
    })
    const colors = (capturedScheduleState?.events ?? []).map((ev) => ev.color)
    expect(colors).toEqual(['blue', 'amber', 'green', 'default'])
  })

  it('onItemConfirmed from ChatSurface adds an event and reveals the panel', () => {
    renderLayout()
    const tokenBefore = capturedResyncToken
    act(() => {
      capturedOnItemConfirmed?.('Morning Run', 'habit', '2026-06-02', '07:00')
    })
    expect(screen.getByTestId('schedule-panel')).toHaveAttribute('data-event-count', '1')
    expect(screen.getByTestId('schedule-panel')).toHaveAttribute('data-visible', 'true')
    expect(capturedResyncToken).not.toBe(tokenBefore)
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

  describe('event proposal ghost flow', () => {
    it('shows a violet ghost on the proposal week and bumps the resync token', () => {
      renderLayout()
      const tokenBefore = capturedResyncToken
      act(() => {
        capturedOnEventProposed?.(proposal)
      })

      const panel = screen.getByTestId('schedule-panel')
      expect(panel).toHaveAttribute('data-visible', 'true')
      expect(panel).toHaveAttribute('data-event-count', '1')

      // weekStart snaps to the Sunday of the proposal's date (local math).
      const sunday = new Date(2026, 5, 3)
      sunday.setDate(sunday.getDate() - sunday.getDay())
      expect(panel).toHaveAttribute('data-week-start', localYmd(sunday))

      const ghost = capturedScheduleState?.events[0]
      expect(ghost?.id).toBe('call-1')
      expect(ghost?.title).toBe('Dentist')
      expect(ghost?.color).toBe('violet')
      // Times are local-wall-clock ISO — matching the confirm path's client build.
      expect(ghost?.start).toBe(new Date(2026, 5, 3, 14, 0).toISOString())
      expect(ghost?.end).toBe(new Date(2026, 5, 3, 15, 0).toISOString())

      // The mocked-lib trap: assert the TOKEN bumped, not just the events prop.
      expect(capturedResyncToken).not.toBe(tokenBefore)
    })

    it('dedupes a repeated proposal notification with the same toolCallId to one ghost', () => {
      renderLayout()
      // Simulates the tool-result mount effect re-firing on each stream delta:
      // the same toolCallId is notified twice while the card is pending.
      act(() => {
        capturedOnEventProposed?.(proposal)
      })
      act(() => {
        capturedOnEventProposed?.(proposal)
      })

      expect(screen.getByTestId('schedule-panel')).toHaveAttribute('data-event-count', '1')
      const matching = (capturedScheduleState?.events ?? []).filter((e) => e.id === 'call-1')
      expect(matching).toHaveLength(1)
    })

    it('replaces the ghost with the created event on confirm and bumps the token', () => {
      renderLayout()
      act(() => {
        capturedOnEventProposed?.(proposal)
      })
      const tokenAfterPropose = capturedResyncToken

      const created: CreatedEvent = {
        id: 'row-9',
        title: 'Dentist',
        start: '2026-06-03T18:00:00.000Z',
        end: '2026-06-03T19:00:00.000Z',
      }
      act(() => {
        capturedOnEventResolved?.('call-1', 'confirmed', created)
      })

      expect(screen.getByTestId('schedule-panel')).toHaveAttribute('data-event-count', '1')
      const events = capturedScheduleState?.events ?? []
      expect(events.some((e) => e.id === 'call-1')).toBe(false)
      const real = events.find((e) => e.id === 'row-9')
      expect(real?.color).toBe('default')
      expect(real?.start).toBe('2026-06-03T18:00:00.000Z')
      expect(real?.end).toBe('2026-06-03T19:00:00.000Z')
      expect(capturedResyncToken).not.toBe(tokenAfterPropose)
    })

    it('keeps other scheduled events when a ghost is confirmed', () => {
      renderLayout()
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
      act(() => {
        capturedOnEventProposed?.(proposal)
      })
      act(() => {
        capturedOnEventResolved?.('call-1', 'confirmed', {
          id: 'row-9',
          title: 'Dentist',
          start: '2026-06-03T18:00:00.000Z',
          end: '2026-06-03T19:00:00.000Z',
        })
      })

      const ids = (capturedScheduleState?.events ?? []).map((e) => e.id)
      expect(ids).toContain('e1')
      expect(ids).toContain('row-9')
      expect(ids).not.toContain('call-1')
    })

    it('drops the ghost on deny and bumps the token', () => {
      renderLayout()
      act(() => {
        capturedOnEventProposed?.(proposal)
      })
      const tokenAfterPropose = capturedResyncToken

      act(() => {
        capturedOnEventResolved?.('call-1', 'denied')
      })

      expect(screen.getByTestId('schedule-panel')).toHaveAttribute('data-event-count', '0')
      expect(capturedResyncToken).not.toBe(tokenAfterPropose)
    })

    it('drops the ghost when confirmed without a created payload (defensive)', () => {
      renderLayout()
      act(() => {
        capturedOnEventProposed?.(proposal)
      })
      act(() => {
        capturedOnEventResolved?.('call-1', 'confirmed')
      })
      expect(screen.getByTestId('schedule-panel')).toHaveAttribute('data-event-count', '0')
    })
  })
})
