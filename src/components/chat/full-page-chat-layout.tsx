'use client'
import * as React from 'react'
import { Panel, Group, Separator } from 'react-resizable-panels'
import { useRouter } from 'next/navigation'
import { ChatHeader } from '@/components/chat/chat-header'
import { ChatSurface } from '@/components/chat/chat-surface'
import { SchedulePanel, type ScheduleState } from '@/components/chat/schedule-panel'
import type { AppEvent } from '@/components/chat/tool-result-renderer'
import type { ConversationRow } from '@/server/queries/conversations'
import type { ConversationMessage } from '@/server/queries/conversations'
import type { CalendarEvent } from '@/lib/ui'

const ENTITY_COLOR: Record<'habit' | 'goal' | 'event', CalendarEvent['color']> = {
  habit: 'green',
  goal: 'amber',
  event: 'default',
}

function buildIsoDateTime(date?: string, time?: string): string {
  const d = date ?? new Date().toISOString().slice(0, 10)
  const t = time ?? '00:00'
  return `${d}T${t}:00`
}

function addOneHour(iso: string): string {
  return new Date(new Date(iso).getTime() + 60 * 60 * 1_000).toISOString()
}

export interface FullPageChatLayoutProps {
  readonly conversation: ConversationRow
  readonly initialMessages: readonly ConversationMessage[]
  readonly tokenBalance: number
}

export function FullPageChatLayout({
  conversation,
  initialMessages,
  tokenBalance: initialBalance,
}: FullPageChatLayoutProps): React.JSX.Element {
  const router = useRouter()
  const [scheduleState, setScheduleState] = React.useState<ScheduleState>({
    visible: false,
    weekStart: new Date().toISOString().slice(0, 10),
    events: [],
  })

  function handleScheduleUpdate(weekStart: string, events: readonly AppEvent[]): void {
    const calEvents: CalendarEvent[] = events.map((e) => ({
      id: e.id,
      title: e.title,
      start: e.start,
      end: e.end,
      color:
        e.type === 'task'
          ? 'blue'
          : e.type === 'goal'
            ? 'amber'
            : e.type === 'habit'
              ? 'green'
              : 'default',
    }))
    setScheduleState({ visible: true, weekStart, events: calEvents })
  }

  function handleItemConfirmed(
    action: string,
    entityType: 'habit' | 'goal' | 'event',
    date?: string,
    time?: string,
  ): void {
    const start = buildIsoDateTime(date, time)
    const event: CalendarEvent = {
      id: crypto.randomUUID(),
      title: action,
      start,
      end: addOneHour(start),
      color: ENTITY_COLOR[entityType],
    }
    setScheduleState((prev) => ({ ...prev, events: [...prev.events, event] }))
  }

  return (
    <div className="flex h-full flex-col">
      <ChatHeader title={conversation.title} onBack={() => router.push('/reflections')} />
      <Group orientation="horizontal" className="flex-1">
        <Panel defaultSize={60} minSize={35}>
          <div className="flex h-full flex-col overflow-hidden">
            <ChatSurface
              conversation={{ id: conversation.id, title: conversation.title }}
              initialMessages={initialMessages}
              initialTokenBalance={initialBalance}
              onScheduleUpdate={handleScheduleUpdate}
              onItemConfirmed={handleItemConfirmed}
            />
          </div>
        </Panel>
        <Separator className="bg-border hover:bg-border/80 hidden w-1 cursor-col-resize transition-colors hover:w-1 md:block" />
        <Panel defaultSize={40} minSize={25} className="hidden md:flex">
          <SchedulePanel state={scheduleState} />
        </Panel>
      </Group>
    </div>
  )
}
