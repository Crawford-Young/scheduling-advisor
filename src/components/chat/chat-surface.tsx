'use client'
import * as React from 'react'
import Link from 'next/link'
import { useChat } from 'ai/react'
import { ChatMessagesPanel } from '@/components/chat/chat-messages-panel'
import type { AppEvent } from '@/components/chat/tool-result-renderer'
import type { ConversationMessage } from '@/server/queries/conversations'
import { getTokenBalanceAction } from '@/server/actions/tokens'
import { setConversationTitle } from '@/server/actions/conversations'

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
  readonly onEnsureConversation?: () => Promise<{ id: string }>
}

export function ChatSurface({
  conversation,
  initialMessages,
  initialTokenBalance,
  prefill,
  onScheduleUpdate,
  onItemConfirmed,
  onEnsureConversation,
}: ChatSurfaceProps): React.JSX.Element {
  const [tokenBalance, setTokenBalance] = React.useState(initialTokenBalance)
  const [conversationId, setConversationId] = React.useState<string | null>(
    conversation?.id ?? null,
  )

  const { messages, input, setInput, handleSubmit, isLoading, append, error, reload } = useChat({
    api: '/api/chat',
    initialMessages: initialMessages.map((m) => ({ id: m.id, role: m.role, content: m.content })),
    body: { conversationId },
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

  const activeConversationId = conversation?.id ?? null
  const activeConversationTitle = conversation?.title ?? null

  React.useEffect(() => {
    if (activeConversationId === null) return
    if (activeConversationTitle !== null) return
    if (messages.length < MIN_TITLE_MESSAGE_COUNT) return
    const firstUser = messages.find((m) => m.role === 'user')
    if (!firstUser) return
    const title = (firstUser.content as string).slice(0, TITLE_MAX_LENGTH)
    void setConversationTitle(activeConversationId, title)
  }, [messages, activeConversationId, activeConversationTitle])

  React.useEffect(() => {
    if (prefill === undefined) return
    if (input !== '') return
    setInput(prefill)
    // input/setInput intentionally omitted: the prefill seeds the input only when it changes,
    // never re-firing while the user edits the input afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill])

  async function submit(e?: React.FormEvent): Promise<void> {
    let id = conversationId
    if (id === null) {
      const created = await onEnsureConversation!()
      id = created.id
      setConversationId(id)
    }
    handleSubmit(e, { body: { conversationId: id } })
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
      inputReplacement={tokenBalance < MIN_TOKEN_BALANCE ? zeroBalanceCta : undefined}
      error={error}
      onRetry={reload}
    />
  )
}
