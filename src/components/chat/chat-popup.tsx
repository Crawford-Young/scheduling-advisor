'use client'
import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Maximize2, Plus, X } from 'lucide-react'
import { Button, ChatFab, Spinner } from '@/lib/ui'
import { ChatSurface } from '@/components/chat/chat-surface'
import {
  createConversation,
  getConversationMessagesAction,
  getLatestConversation,
} from '@/server/actions/conversations'
import { getTokenBalanceAction } from '@/server/actions/tokens'
import type { ConversationMessage } from '@/server/queries/conversations'

const CHAT_ROUTE_PREFIX = '/chat'
const UNTITLED_CONVERSATION_TITLE = 'Untitled'

interface PopupConversation {
  readonly id: string
  readonly title: string | null
}

interface OpenChatEventDetail {
  readonly prefill?: string
}

export function ChatPopup(): React.JSX.Element | null {
  const pathname = usePathname()
  const router = useRouter()

  const [isOpen, setIsOpen] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(false)
  const hasLoadedRef = React.useRef(false)
  const [conversation, setConversation] = React.useState<PopupConversation | null>(null)
  const [messages, setMessages] = React.useState<readonly ConversationMessage[]>([])
  const [tokenBalance, setTokenBalance] = React.useState(0)
  const [prefill, setPrefill] = React.useState<string | undefined>(undefined)
  const [surfaceKey, setSurfaceKey] = React.useState(0)

  const loadLatest = React.useCallback(async () => {
    setIsLoading(true)
    try {
      const [latest, balance] = await Promise.all([
        getLatestConversation(),
        getTokenBalanceAction(),
      ])
      setTokenBalance(balance)
      if (latest) {
        const latestMessages = await getConversationMessagesAction(latest.id)
        setConversation(latest)
        setMessages(latestMessages)
      } else {
        setConversation(null)
        setMessages([])
      }
    } finally {
      setIsLoading(false)
      hasLoadedRef.current = true
    }
  }, [])

  const openPanel = React.useCallback(
    (detail?: OpenChatEventDetail) => {
      setIsOpen(true)
      setPrefill(detail?.prefill)
      if (!hasLoadedRef.current) {
        void loadLatest()
      }
    },
    [loadLatest],
  )

  React.useEffect(() => {
    function handleOpenChat(event: Event): void {
      const custom = event as CustomEvent<OpenChatEventDetail>
      openPanel(custom.detail)
    }
    window.addEventListener('open-chat', handleOpenChat)
    return () => window.removeEventListener('open-chat', handleOpenChat)
  }, [openPanel])

  const ensureConversation = React.useCallback(async () => {
    const created = await createConversation('general')
    setConversation({ id: created.id, title: null })
    return created
  }, [])

  function handleNewChat(): void {
    setConversation(null)
    setMessages([])
    setPrefill(undefined)
    setSurfaceKey((key) => key + 1)
  }

  async function handleExpand(): Promise<void> {
    const id = conversation?.id ?? (await createConversation('general')).id
    setIsOpen(false)
    router.push(`${CHAT_ROUTE_PREFIX}/${id}`)
  }

  function handleClose(): void {
    setIsOpen(false)
  }

  if (pathname.startsWith(CHAT_ROUTE_PREFIX)) return null

  if (!isOpen) {
    return <ChatFab onClick={() => openPanel()} />
  }

  return (
    <div
      data-testid="chat-popup-panel"
      className="border-border bg-background fixed right-6 bottom-6 z-50 flex h-[560px] w-[380px] flex-col overflow-hidden rounded-lg border shadow-xl"
    >
      <div className="border-border flex items-center gap-2 border-b p-3">
        <h2
          data-testid="chat-popup-title"
          className="min-w-0 flex-1 truncate text-sm font-semibold"
        >
          {conversation?.title ?? UNTITLED_CONVERSATION_TITLE}
        </h2>
        <Button type="button" variant="ghost" size="sm" onClick={handleNewChat}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New chat
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Expand to full chat"
          onClick={() => void handleExpand()}
        >
          <Maximize2 className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close chat"
          onClick={handleClose}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <ChatSurface
            key={surfaceKey}
            conversation={conversation}
            initialMessages={messages}
            initialTokenBalance={tokenBalance}
            prefill={prefill}
            onEnsureConversation={ensureConversation}
          />
        )}
      </div>
    </div>
  )
}
