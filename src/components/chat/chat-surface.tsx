'use client'
import * as React from 'react'
import Link from 'next/link'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import { ChatMessagesPanel } from '@/components/chat/chat-messages-panel'
import type { AppEvent, CreatedEvent, EventProposal } from '@/components/chat/tool-result-renderer'
import type { ChatAppendMessage } from '@/components/chat/event-proposal-card'
import type { ConversationMessage } from '@/server/queries/conversations'
import { extractText } from '@/lib/chat/message-content'
import { getTokenBalanceAction } from '@/server/actions/tokens'
import { setConversationTitle } from '@/server/actions/conversations'

const CHAT_API_ROUTE = '/api/chat'
const MIN_TITLE_MESSAGE_COUNT = 2
const TITLE_MAX_LENGTH = 60
const MIN_TOKEN_BALANCE = 1

export interface ChatSurfaceProps {
  readonly conversation: { readonly id: string; readonly title: string | null } | null
  readonly initialMessages: readonly ConversationMessage[]
  readonly initialTokenBalance: number
  readonly prefill?: string
  readonly onScheduleUpdate?: (weekStart: string, events: readonly AppEvent[]) => void
  readonly onItemConfirmed?: (
    action: string,
    entityType: 'habit' | 'goal' | 'event',
    date?: string,
    time?: string,
  ) => void
  readonly onEventProposed?: (proposal: EventProposal) => void
  readonly onEventResolved?: (
    toolCallId: string,
    outcome: 'confirmed' | 'denied',
    created?: CreatedEvent,
  ) => void
  readonly onEnsureConversation?: () => Promise<{ id: string }>
  // Proposals carried across the popup → /chat expand handoff, rendered as
  // actionable cards below the (text-only) message history.
  readonly carriedProposals?: readonly EventProposal[]
  readonly inlineDayPreview?: boolean
}

export function ChatSurface({
  conversation,
  initialMessages,
  initialTokenBalance,
  prefill,
  onScheduleUpdate,
  onItemConfirmed,
  onEventProposed,
  onEventResolved,
  onEnsureConversation,
  carriedProposals,
  inlineDayPreview,
}: ChatSurfaceProps): React.JSX.Element {
  const [tokenBalance, setTokenBalance] = React.useState(initialTokenBalance)
  const [conversationId, setConversationId] = React.useState<string | null>(
    conversation?.id ?? null,
  )
  // ai@7's useChat no longer owns the input — controlled input is the caller's.
  const [input, setInput] = React.useState('')

  // DefaultChatTransport sends UIMessage-shaped messages (with `parts`) by
  // default, but the /api/chat route validates a `{ role, content }[]` body.
  // prepareSendMessagesRequest flattens each message's text parts back to a
  // string so the wire format matches the server zod schema; `conversationId`
  // rides through the transport body (per-send override handles lazy create).
  const transport = React.useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: CHAT_API_ROUTE,
        body: { conversationId },
        prepareSendMessagesRequest: ({ messages: outgoing, body }) => ({
          body: {
            ...body,
            messages: outgoing.map((m) => ({ role: m.role, content: extractText(m.parts) })),
          },
        }),
      }),
    [conversationId],
  )

  // Replayed history is text-only (proposeEvent tool blocks are never
  // persisted), mapped into the ai@7 UIMessage shape ({ parts: [text] }).
  const replayedMessages = React.useMemo<UIMessage[]>(
    () =>
      initialMessages.map((m) => ({
        id: m.id,
        role: m.role,
        parts: [{ type: 'text' as const, text: m.content }],
      })),
    [initialMessages],
  )

  const { messages, sendMessage, regenerate, status, error } = useChat<UIMessage>({
    transport,
    messages: replayedMessages,
    onFinish: async () => {
      try {
        const balance = await getTokenBalanceAction()
        setTokenBalance(balance)
        window.dispatchEvent(new CustomEvent('token-balance-changed'))
      } catch {
        // non-fatal — stale balance ok
      }
    },
  })

  const isLoading = status === 'submitted' || status === 'streaming'

  // Card-driven transcript lines ([CONFIRMED]/[DENY]/[CONFIRM]) are user turns;
  // ai@7 has no `append`, so wrap `sendMessage`. The conversation already exists
  // by the time a card resolves, so the transport body carries its id.
  const append = React.useCallback(
    (message: ChatAppendMessage): void => {
      void sendMessage({ text: message.content })
    },
    [sendMessage],
  )

  const activeConversationId = conversation?.id ?? null
  const activeConversationTitle = conversation?.title ?? null

  React.useEffect(() => {
    if (activeConversationId === null) return
    if (activeConversationTitle !== null) return
    if (messages.length < MIN_TITLE_MESSAGE_COUNT) return
    const firstUser = messages.find((m) => m.role === 'user')
    if (!firstUser) return
    const title = extractText(firstUser.parts).slice(0, TITLE_MAX_LENGTH)
    void setConversationTitle(activeConversationId, title)
  }, [messages, activeConversationId, activeConversationTitle])

  React.useEffect(() => {
    if (prefill === undefined) return
    if (input !== '') return
    // Sync an external prefill prop (a quick-action deep link) into the composer
    // exactly once per prefill change — prop→state synchronization, not a value
    // derivable during render, so it belongs in an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInput(prefill)
    // input/setInput intentionally omitted: the prefill seeds the input only when it changes,
    // never re-firing while the user edits the input afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill])

  async function submit(e?: React.FormEvent): Promise<void> {
    e?.preventDefault()
    const text = input.trim()
    if (text === '') return
    let id = conversationId
    if (id === null) {
      const created = await onEnsureConversation!()
      id = created.id
      setConversationId(id)
    }
    setInput('')
    await sendMessage({ text }, { body: { conversationId: id } })
  }

  const zeroBalanceCta = (
    <div className="border-border bg-background flex flex-col items-center gap-3 border-t p-6 text-center">
      <h2 className="text-foreground text-sm font-semibold">You&apos;re out of tokens</h2>
      <p className="text-muted-foreground max-w-sm text-sm">
        Cy plans your schedule, reschedules what slipped, and reflects on your day with you. Top up
        to keep going.
      </p>
      <Link
        href="/tokens"
        className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
      >
        Get tokens
      </Link>
    </div>
  )

  return (
    <ChatMessagesPanel
      messages={messages}
      input={input}
      setInput={setInput}
      handleSubmit={submit}
      isLoading={isLoading}
      append={append}
      onScheduleUpdate={onScheduleUpdate}
      onItemConfirmed={onItemConfirmed}
      onEventProposed={onEventProposed}
      onEventResolved={onEventResolved}
      carriedProposals={carriedProposals}
      inlineDayPreview={inlineDayPreview}
      inputReplacement={tokenBalance < MIN_TOKEN_BALANCE ? zeroBalanceCta : undefined}
      error={error}
      onRetry={regenerate}
    />
  )
}
