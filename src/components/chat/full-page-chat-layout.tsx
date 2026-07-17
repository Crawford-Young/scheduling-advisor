'use client'
import * as React from 'react'
import { Panel, Group, Separator } from 'react-resizable-panels'
import { useRouter } from 'next/navigation'
import { ChatHeader } from '@/components/chat/chat-header'
import { ChatSurface } from '@/components/chat/chat-surface'
import { SchedulePanel, type ScheduleState } from '@/components/chat/schedule-panel'
import type { AppEvent, EventProposal, CreatedEvent } from '@/components/chat/tool-result-renderer'
import type { ConversationRow } from '@/server/queries/conversations'
import type { ConversationMessage } from '@/server/queries/conversations'
import { setConversationModel } from '@/server/actions/conversations'
import { clearPendingProposals, readPendingProposals } from '@/lib/chat/pending-proposals'
import { normalizeTier, type ModelTier } from '@/lib/chat/model-tier-core'
import type { CalendarEvent } from '@/lib/ui'

const ENTITY_COLOR: Record<'habit' | 'goal' | 'event', CalendarEvent['color']> = {
  habit: 'green',
  goal: 'amber',
  event: 'default',
}

// Resizable-panel layout. Sizes MUST be percentage STRINGS: react-resizable-panels
// v4 parses a bare number as PIXELS (bt() -> [n, 'px']), so minSize={40} is a 40px
// floor (chat drags basically closed) and 'px' min+max over-constrains the solver
// and freezes the drag. As '%' strings, minSize on BOTH panels bounds the drag both
// ways (schedule's 25% floor caps the chat at 75%, the chat's 40% floor caps the
// schedule at 60%) — a drag can never collapse either panel.
// `defaultLayout` is a flexGrow map (unitless ratios) keyed by panel id — it seeds
// the split at SSR so the panels render at 60/40 immediately instead of flashing as
// slivers until the client measures.
const CHAT_PANEL_ID = 'chat-panel'
const SCHEDULE_PANEL_ID = 'schedule-panel'
const CHAT_DEFAULT_SIZE = '60%'
const SCHEDULE_DEFAULT_SIZE = '40%'
const CHAT_MIN_SIZE = '40%'
const SCHEDULE_MIN_SIZE = '25%'
const CHAT_FLEX_GROW = 60
const SCHEDULE_FLEX_GROW = 40
const DEFAULT_PANEL_LAYOUT: Record<string, number> = {
  [CHAT_PANEL_ID]: CHAT_FLEX_GROW,
  [SCHEDULE_PANEL_ID]: SCHEDULE_FLEX_GROW,
}

function buildIsoDateTime(date?: string, time?: string): string {
  const d = date ?? new Date().toISOString().slice(0, 10)
  const t = time ?? '00:00'
  return `${d}T${t}:00`
}

function addOneHour(iso: string): string {
  return new Date(new Date(iso).getTime() + 60 * 60 * 1_000).toISOString()
}

/** Local-wall-clock ISO from a `YYYY-MM-DD` date + `HH:MM` time — matches the confirm path. */
function proposalIso(date: string, time: string): string {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, m] = time.split(':').map(Number)
  return new Date(y!, mo! - 1, d!, h!, m!).toISOString()
}

/** `YYYY-MM-DD` for the Sunday that starts the local week containing `date`. */
function weekStartOf(date: string): string {
  const [y, mo, d] = date.split('-').map(Number)
  const dt = new Date(y!, mo! - 1, d!)
  dt.setDate(dt.getDate() - dt.getDay())
  const yyyy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
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
  const [model, setModel] = React.useState<ModelTier>(normalizeTier(conversation.model))
  const [scheduleState, setScheduleState] = React.useState<ScheduleState>({
    visible: false,
    weekStart: new Date().toISOString().slice(0, 10),
    events: [],
  })
  // Bumped on every scheduleState mutation so WeekCalendarView re-seeds from the
  // fresh events prop — it renders only from internal state seeded once per token
  // identity (AGENTS.md WeekCalendarView resyncToken entry).
  const [resyncToken, setResyncToken] = React.useState(0)
  // Proposals carried across the popup → /chat expand handoff. Read once on mount
  // (never a useState initializer — reading sessionStorage during render diverges
  // from SSR and triggers a hydration mismatch, the fab-hydration trap). The ref
  // guard keeps StrictMode's dev double-invoke from dropping the carried set.
  const [carriedProposals, setCarriedProposals] = React.useState<readonly EventProposal[]>([])
  const hydratedRef = React.useRef(false)

  React.useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true
    const carried = readPendingProposals(conversation.id)
    // Deliberate post-mount browser read (sessionStorage). Reading during render
    // would diverge from the server render (window undefined there) and trigger a
    // hydration mismatch that drops the carried proposals — the fab-hydration
    // trap. The single extra render is the accepted empty->carried settle, so the
    // set-state-in-effect guidance is waived here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (carried.length) setCarriedProposals(carried)
    clearPendingProposals(conversation.id)
  }, [conversation.id])

  function bumpResync(): void {
    setResyncToken((t) => t + 1)
  }

  function handleModelChange(tier: ModelTier): void {
    setModel(tier)
    void setConversationModel(conversation.id, tier)
  }

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
    bumpResync()
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
    setScheduleState((prev) => ({ ...prev, visible: true, events: [...prev.events, event] }))
    bumpResync()
  }

  function handleEventProposed(p: EventProposal): void {
    // TODO(recurrence): show all in-week occurrences as ghosts. v1 keeps the
    // single anchor-day violet ghost; a recurring proposal (p.recurrence set)
    // still renders one ghost here, and the confirmed series appears from real
    // rows after createTask's fan-out.
    const ghost: CalendarEvent = {
      id: p.toolCallId,
      title: p.title,
      start: proposalIso(p.date, p.start),
      end: proposalIso(p.date, p.end),
      color: 'violet',
    }
    setScheduleState((prev) => {
      // Idempotent per toolCallId: the tool-result mount effect can re-notify on
      // each stream delta; a second ghost with the same id would collide keys in
      // WeekCalendarView. Skip the duplicate append.
      if (prev.events.some((e) => e.id === ghost.id)) return prev
      return {
        visible: true,
        weekStart: weekStartOf(p.date),
        events: [...prev.events, ghost],
      }
    })
    bumpResync()
  }

  function handleEventResolved(
    toolCallId: string,
    outcome: 'confirmed' | 'denied',
    created?: CreatedEvent,
  ): void {
    setScheduleState((prev) => {
      const withoutGhost = prev.events.filter((e) => e.id !== toolCallId)
      if (outcome === 'confirmed' && created) {
        const real: CalendarEvent = {
          id: created.id,
          title: created.title,
          start: created.start,
          end: created.end,
          color: 'default',
        }
        return { ...prev, events: [...withoutGhost, real] }
      }
      return { ...prev, events: withoutGhost }
    })
    bumpResync()
  }

  return (
    <div className="flex h-full flex-col">
      <ChatHeader
        title={conversation.title}
        onBack={() => router.push('/reflections')}
        model={model}
        onModelChange={handleModelChange}
      />
      <Group orientation="horizontal" className="flex-1" defaultLayout={DEFAULT_PANEL_LAYOUT}>
        <Panel id={CHAT_PANEL_ID} defaultSize={CHAT_DEFAULT_SIZE} minSize={CHAT_MIN_SIZE}>
          <div className="flex h-full flex-col overflow-hidden">
            <ChatSurface
              conversation={{ id: conversation.id, title: conversation.title }}
              initialMessages={initialMessages}
              initialTokenBalance={initialBalance}
              onScheduleUpdate={handleScheduleUpdate}
              onItemConfirmed={handleItemConfirmed}
              onEventProposed={handleEventProposed}
              onEventResolved={handleEventResolved}
              carriedProposals={carriedProposals}
            />
          </div>
        </Panel>
        <Separator className="bg-border hover:bg-border/80 hidden w-1 cursor-col-resize transition-colors hover:w-1 md:block" />
        <Panel
          id={SCHEDULE_PANEL_ID}
          defaultSize={SCHEDULE_DEFAULT_SIZE}
          minSize={SCHEDULE_MIN_SIZE}
          className="hidden md:flex"
        >
          <SchedulePanel state={scheduleState} resyncToken={resyncToken} />
        </Panel>
      </Group>
    </div>
  )
}
