'use client'
import * as React from 'react'
import type { Message, ToolInvocation } from 'ai'
import { Textarea, Button } from '@/lib/ui'
import { Send } from 'lucide-react'
import { ToolResultRenderer } from '@/components/chat/tool-result-renderer'
import type { AppEvent } from '@/components/chat/tool-result-renderer'

export interface ChatMessagesPanelProps {
  readonly messages: readonly Message[]
  readonly input: string
  readonly setInput: (value: string) => void
  readonly handleSubmit: (e?: React.FormEvent) => void
  readonly isLoading: boolean
  readonly append: (message: Pick<Message, 'role' | 'content'>) => void
  readonly onScheduleUpdate?: (weekStart: string, events: readonly AppEvent[]) => void
  readonly onItemConfirmed?: (
    action: string,
    entityType: 'habit' | 'goal' | 'event',
    date?: string,
    time?: string,
  ) => void
  readonly inputReplacement?: React.ReactNode
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
  inputReplacement,
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
        {messages.map((message) =>
          message.role === 'user' ? (
            <div key={message.id} className="flex justify-end">
              <div className="bg-accent max-w-[85%] rounded-lg px-3 py-2">
                <p className="text-accent-foreground text-sm whitespace-pre-wrap">
                  {message.content as string}
                </p>
              </div>
            </div>
          ) : (
            <div key={message.id} className="flex justify-start">
              <div className="max-w-[85%] space-y-2">
                {message.content && (
                  <div className="bg-surface-raised rounded-lg px-3 py-2">
                    <p className="text-foreground text-sm whitespace-pre-wrap">
                      {message.content as string}
                    </p>
                  </div>
                )}
                {message.toolInvocations
                  ?.filter((t: ToolInvocation) => t.state === 'result')
                  .map((t: ToolInvocation) => (
                    <ToolResultRenderer
                      key={t.toolCallId}
                      toolInvocation={t as ToolInvocation & { state: 'result' }}
                      append={append}
                      onScheduleUpdate={onScheduleUpdate}
                      onItemConfirmed={onItemConfirmed}
                    />
                  ))}
              </div>
            </div>
          ),
        )}
        {isLoading && (
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
