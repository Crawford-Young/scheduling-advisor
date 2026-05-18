'use client'
import { useState, useRef, useEffect } from 'react'
import { useChat } from 'ai/react'
import type { Message, ToolInvocation } from 'ai'
import { Send, Settings, Sparkles, Zap } from 'lucide-react'
import Link from 'next/link'
import { ToolResultRenderer } from './tool-result-renderer'

interface DashboardChatProps {
  conversationId: string
  initialMessages: Message[]
  plan: 'free' | 'pro' | 'comped'
}

export function DashboardChat({ conversationId, initialMessages, plan }: DashboardChatProps) {
  const [showNoKeyBanner, setShowNoKeyBanner] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const isFree = plan === 'free'

  const { messages, input, setInput, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
    initialMessages,
    body: { conversationId },
    onError: (error) => {
      if (error.message.includes('no_api_key')) setShowNoKeyBanner(true)
    },
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-border flex items-center justify-between border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Scheduling Advisor</h1>
        <Link href="/settings" aria-label="Settings">
          <Settings
            className="text-muted-foreground hover:text-foreground h-5 w-5 transition-colors"
            aria-hidden="true"
          />
        </Link>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {isFree ? (
          <div className="flex flex-col items-center gap-4 pt-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 ring-1 ring-amber-500/30">
              <Sparkles className="h-7 w-7 text-amber-400" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-zinc-100">AI assistant is a Pro feature</p>
              <p className="text-muted-foreground max-w-xs text-sm">
                Upgrade to get personalized scheduling advice, smart suggestions, and more.
              </p>
            </div>
            <Link
              href="/upgrade"
              className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition-all hover:bg-amber-400 active:scale-[0.98]"
            >
              <Zap className="h-4 w-4" aria-hidden="true" />
              Upgrade to Pro
            </Link>
          </div>
        ) : showNoKeyBanner ? (
          <div className="border-border rounded-lg border p-4 text-center">
            <p className="text-muted-foreground text-sm">
              Add your Anthropic API key in the settings page to start chatting.
            </p>
          </div>
        ) : messages.length === 0 ? (
          <p className="text-muted-foreground pt-8 text-center text-sm">
            Start a conversation to get personalized scheduling advice.
          </p>
        ) : null}

        {!isFree &&
          messages.map((message) =>
            message.role === 'user' ? (
              <div key={message.id} className="flex justify-end">
                <div className="bg-primary text-primary-foreground max-w-[80%] rounded-lg px-3 py-2">
                  <p className="text-sm whitespace-pre-wrap">{message.content as string}</p>
                </div>
              </div>
            ) : (
              <div key={message.id} className="flex justify-start">
                <div className="max-w-[80%] space-y-2">
                  {message.content && (
                    <div className="bg-muted rounded-lg px-3 py-2">
                      <p className="text-sm whitespace-pre-wrap">{message.content as string}</p>
                    </div>
                  )}
                  {message.toolInvocations
                    ?.filter((t: ToolInvocation) => t.state === 'result')
                    .map((t: ToolInvocation) => (
                      <ToolResultRenderer
                        key={t.toolCallId}
                        toolInvocation={t as ToolInvocation & { state: 'result' }}
                      />
                    ))}
                </div>
              </div>
            ),
          )}

        {!isFree && isLoading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-3 py-2" data-testid="loading-dots">
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

      {!isFree && (
        <form onSubmit={handleSubmit} className="border-border flex gap-2 border-t p-4">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask about your schedule..."
            className="border-input bg-background max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-md border px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center rounded-md p-2 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            <span className="sr-only">Send</span>
          </button>
        </form>
      )}
    </div>
  )
}
