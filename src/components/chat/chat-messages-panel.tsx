'use client'
import * as React from 'react'
import { getToolName, isToolUIPart, type UIMessage } from 'ai'
import { Textarea, Button } from '@/lib/ui'
import { Send } from 'lucide-react'
import { ProposeEventResult, ToolResultRenderer } from '@/components/chat/tool-result-renderer'
import type {
  AppEvent,
  CreatedEvent,
  EventProposal,
  ToolResultPart,
} from '@/components/chat/tool-result-renderer'
import type { ChatAppendMessage } from '@/components/chat/event-proposal-card'
import { extractText } from '@/lib/chat/message-content'

/**
 * Normalize a single ai@7 UIMessage part into the renderer's `ToolResultPart`,
 * or `null` when the part is not a tool call that has produced output yet
 * (text/reasoning parts, or tool calls still streaming their input). The old
 * `toolInvocations` array + `state === 'result'` filter is replaced by walking
 * `message.parts` and gating on `state === 'output-available'`.
 */
const TOOL_OUTPUT_AVAILABLE = 'output-available'
function toToolResultPart(part: UIMessage['parts'][number]): ToolResultPart | null {
  if (!isToolUIPart(part)) return null
  if (part.state !== TOOL_OUTPUT_AVAILABLE) return null
  return { toolCallId: part.toolCallId, toolName: getToolName(part), result: part.output }
}

const CHAT_ERROR_MESSAGE = "Cy couldn't respond. Try again."
const RETRY_LABEL = 'Retry'

export interface ChatMessagesPanelProps {
  readonly messages: readonly UIMessage[]
  readonly input: string
  readonly setInput: (value: string) => void
  readonly handleSubmit: (e?: React.FormEvent) => void
  readonly isLoading: boolean
  readonly append: (message: ChatAppendMessage) => void
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
  // Proposals carried across the popup → /chat expand handoff. Re-rendered here as
  // fully-actionable ✓/✗ cards outside the message loop (history is text-only).
  readonly carriedProposals?: readonly EventProposal[]
  readonly inlineDayPreview?: boolean
  readonly inputReplacement?: React.ReactNode
  readonly error?: Error
  readonly onRetry?: () => void
}

export function ChatMessagesPanel({
  messages,
  input,
  setInput,
  handleSubmit,
  isLoading,
  append,
  onScheduleUpdate,
  onItemConfirmed,
  onEventProposed,
  onEventResolved,
  carriedProposals,
  inlineDayPreview,
  inputReplacement,
  error,
  onRetry,
}: ChatMessagesPanelProps): React.JSX.Element {
  const bottomRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-muted-foreground pt-8 text-center text-sm">
            Ask me anything about your schedule.
          </p>
        )}
        {messages.map((message) => {
          const text = extractText(message.parts)
          return message.role === 'user' ? (
            <div key={message.id} className="flex justify-end">
              <div className="bg-accent max-w-[85%] rounded-lg px-3 py-2">
                <p className="text-accent-foreground text-sm whitespace-pre-wrap">{text}</p>
              </div>
            </div>
          ) : (
            <div key={message.id} className="flex justify-start">
              <div className="max-w-[85%] space-y-2">
                {text && (
                  <div className="bg-surface-raised rounded-lg px-3 py-2">
                    <p className="text-foreground text-sm whitespace-pre-wrap">{text}</p>
                  </div>
                )}
                {message.parts.map((part) => {
                  const toolResult = toToolResultPart(part)
                  if (!toolResult) return null
                  return (
                    <ToolResultRenderer
                      key={toolResult.toolCallId}
                      toolInvocation={toolResult}
                      append={append}
                      onScheduleUpdate={onScheduleUpdate}
                      onItemConfirmed={onItemConfirmed}
                      onEventProposed={onEventProposed}
                      onEventResolved={onEventResolved}
                      inlineDayPreview={inlineDayPreview}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
        {carriedProposals?.map((p) => (
          <div key={p.toolCallId} className="flex justify-start">
            <div className="max-w-[85%]">
              <ProposeEventResult
                toolCallId={p.toolCallId}
                result={{
                  title: p.title,
                  date: p.date,
                  start: p.start,
                  end: p.end,
                  description: p.description,
                  recurrence: p.recurrence,
                  recurrenceDays: p.recurrenceDays,
                  recurrenceCount: p.recurrenceCount,
                }}
                append={append}
                onEventProposed={onEventProposed}
                onEventResolved={onEventResolved}
                inlineDayPreview={inlineDayPreview}
              />
            </div>
          </div>
        ))}
        {error ? (
          <div className="flex justify-start">
            <div className="bg-surface-raised flex items-center gap-2 rounded-lg px-3 py-2">
              <p className="text-destructive text-sm">{CHAT_ERROR_MESSAGE}</p>
              <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
                {RETRY_LABEL}
              </Button>
            </div>
          </div>
        ) : (
          isLoading && (
            <div className="flex justify-start">
              <div className="bg-surface-raised rounded-lg px-3 py-2" data-testid="loading-dots">
                <div className="flex gap-1">
                  <span className="text-muted-foreground animate-bounce">•</span>
                  <span className="text-muted-foreground animate-bounce [animation-delay:0.1s]">
                    •
                  </span>
                  <span className="text-muted-foreground animate-bounce [animation-delay:0.2s]">
                    •
                  </span>
                </div>
              </div>
            </div>
          )
        )}
        <div ref={bottomRef} />
      </div>

      {inputReplacement ?? (
        <form onSubmit={handleSubmit} className="border-border border-t p-3">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about your schedule..."
              rows={1}
              className="max-h-32 flex-1 resize-none"
            />
            <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
              <Send className="h-4 w-4" aria-hidden />
              <span className="sr-only">Send</span>
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
