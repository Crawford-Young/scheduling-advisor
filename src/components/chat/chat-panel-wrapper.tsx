'use client'
import { useState, useRef, useEffect } from 'react'
import { useChat } from 'ai/react'
import type { Message, ToolInvocation } from 'ai'
import { ChatPanel, ChatFab, Textarea, Button } from '@/lib/ui'
import { Send } from 'lucide-react'
import { ToolResultRenderer } from './tool-result-renderer'
import Link from 'next/link'

interface ChatPanelWrapperProps {
  readonly conversationId: string
  readonly initialMessages: ReadonlyArray<Message>
  readonly plan: 'starter' | 'growth' | 'pro' | 'comped' | null
  readonly pageContext?: string
}

export function ChatPanelWrapper({
  conversationId,
  initialMessages,
  plan,
  pageContext,
}: ChatPanelWrapperProps) {
  const [open, setOpen] = useState(false)
  const isFree = plan === null
  const bottomRef = useRef<HTMLDivElement>(null)

  const { messages, input, setInput, handleSubmit, isLoading, append } = useChat({
    api: '/api/chat',
    initialMessages: initialMessages as Message[],
    body: { conversationId },
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    function handleOpenChat() {
      setOpen(true)
    }
    window.addEventListener('open-chat', handleOpenChat)
    return () => window.removeEventListener('open-chat', handleOpenChat)
  }, [])

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <>
      <ChatFab onClick={() => setOpen(true)} />
      <ChatPanel open={open} onOpenChange={setOpen} title="AI Assistant">
        <div className="flex flex-1 flex-col overflow-hidden">
          {isFree ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 ring-1 ring-amber-500/30">
                <svg
                  aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-7 w-7 text-amber-400"
                >
                  <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                </svg>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-foreground text-sm font-semibold">
                  AI assistant is a Pro feature
                </p>
                <p className="text-muted-foreground max-w-xs text-sm">
                  Upgrade to get personalized scheduling advice, smart suggestions, and more.
                </p>
              </div>
              <Link
                href="/upgrade"
                className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition-all hover:bg-amber-400 active:scale-[0.98]"
              >
                Upgrade to Pro
              </Link>
            </div>
          ) : (
            <>
              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                {messages.length === 0 && (
                  <p className="text-muted-foreground pt-8 text-center text-sm">
                    {pageContext ?? 'Ask me anything about your schedule.'}
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
                            />
                          ))}
                      </div>
                    </div>
                  ),
                )}
                {isLoading && (
                  <div className="flex justify-start">
                    <div
                      className="bg-surface-raised rounded-lg px-3 py-2"
                      data-testid="loading-dots"
                    >
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
            </>
          )}
        </div>
      </ChatPanel>
    </>
  )
}
