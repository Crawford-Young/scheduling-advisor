'use client'
import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Maximize2, Plus } from 'lucide-react'
import { Button, ChatFab, ChatPanel, Spinner } from '@/lib/ui'
import { ChatSurface } from '@/components/chat/chat-surface'
import { ModelTierSelect } from '@/components/chat/model-tier-select'
import { useFabPosition } from '@/components/chat/use-fab-position'
import { writePendingProposals } from '@/lib/chat/pending-proposals'
import type { EventProposal } from '@/components/chat/tool-result-renderer'
import {
  createConversation,
  getConversationMessagesAction,
  getLatestConversation,
  setConversationModel,
} from '@/server/actions/conversations'
import { getTokenBalanceAction } from '@/server/actions/tokens'
import type { ConversationMessage } from '@/server/queries/conversations'
import { normalizeTier, type ModelTier } from '@/lib/chat/model-tier-core'

const CHAT_ROUTE_PREFIX = '/chat'
const UNTITLED_CONVERSATION_TITLE = 'Untitled'
const DEFAULT_MODEL_TIER: ModelTier = 'sonnet'

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
  const [conversation, setConversation] = React.useState<PopupConversation | null>(null)
  const [messages, setMessages] = React.useState<readonly ConversationMessage[]>([])
  const [tokenBalance, setTokenBalance] = React.useState(0)
  const [prefill, setPrefill] = React.useState<string | undefined>(undefined)
  const [surfaceKey, setSurfaceKey] = React.useState(0)
  const [model, setModel] = React.useState<ModelTier>(DEFAULT_MODEL_TIER)
  // Unresolved proposals keyed by toolCallId — a ref (no re-render needed; read
  // only at expand time to hand off to /chat via sessionStorage).
  const pendingProposalsRef = React.useRef<Map<string, EventProposal>>(new Map())
  const { fabStyle, panelStyle, handlers: fabHandlers, consumeDrag } = useFabPosition()

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
        setModel(normalizeTier(latest.model))
      } else {
        setConversation(null)
        setMessages([])
        setModel(DEFAULT_MODEL_TIER)
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  const openPanel = React.useCallback(
    (detail?: OpenChatEventDetail) => {
      if (!isOpen) void loadLatest()
      setIsOpen(true)
      setPrefill(detail?.prefill)
    },
    [isOpen, loadLatest],
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
    const created = await createConversation('general', model)
    setConversation({ id: created.id, title: null })
    return created
  }, [model])

  function handleNewChat(): void {
    setConversation(null)
    setMessages([])
    setPrefill(undefined)
    // A New chat abandons any pending proposal from the prior conversation.
    pendingProposalsRef.current = new Map()
    setSurfaceKey((key) => key + 1)
  }

  async function handleExpand(): Promise<void> {
    const id = conversation?.id ?? (await createConversation('general', model)).id
    // Hand the still-unresolved proposals off to /chat before navigating; the
    // reloaded conversation is text-only, so /chat re-renders these as cards.
    writePendingProposals(id, [...pendingProposalsRef.current.values()])
    setIsOpen(false)
    router.push(`${CHAT_ROUTE_PREFIX}/${id}`)
  }

  function handleEventProposed(proposal: EventProposal): void {
    pendingProposalsRef.current.set(proposal.toolCallId, proposal)
  }

  function handleEventResolved(toolCallId: string): void {
    pendingProposalsRef.current.delete(toolCallId)
  }

  function handleModelChange(tier: ModelTier): void {
    setModel(tier)
    if (conversation) void setConversationModel(conversation.id, tier)
  }

  function handleFabClick(): void {
    if (consumeDrag()) return
    openPanel()
  }

  if (pathname.startsWith(CHAT_ROUTE_PREFIX)) return null

  if (!isOpen) {
    return (
      <div
        data-testid="chat-fab-wrapper"
        style={fabStyle}
        onPointerDown={fabHandlers.onPointerDown}
        onPointerMove={fabHandlers.onPointerMove}
        onPointerUp={fabHandlers.onPointerUp}
      >
        <ChatFab position={fabStyle ? 'static' : 'fixed'} onClick={handleFabClick} />
      </div>
    )
  }

  return (
    <ChatPanel
      open={isOpen}
      onOpenChange={setIsOpen}
      title="Cy assistant"
      modal={false}
      role="dialog"
      data-testid="chat-popup-panel"
      style={panelStyle}
      className="border-border bg-background inset-y-auto right-6 bottom-6 h-[560px] w-[380px] rounded-lg border shadow-xl"
      header={
        <h2
          data-testid="chat-popup-title"
          className="min-w-0 flex-1 truncate text-sm font-semibold"
        >
          {conversation?.title ?? UNTITLED_CONVERSATION_TITLE}
        </h2>
      }
      actions={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={handleNewChat}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New chat
          </Button>
          <ModelTierSelect value={model} onChange={handleModelChange} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Expand to full chat"
            onClick={() => void handleExpand()}
          >
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </>
      }
    >
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
          onEventProposed={handleEventProposed}
          onEventResolved={handleEventResolved}
          inlineDayPreview
        />
      )}
    </ChatPanel>
  )
}
