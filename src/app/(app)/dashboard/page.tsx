'use client'
import { useRef, useEffect } from 'react'
import { useTambo, useTamboThreadInput, ComponentRenderer } from '@tambo-ai/react'
import type { Content } from '@tambo-ai/react'
import { Button, Textarea } from '@crawfordyoung/ui'
import { Send } from 'lucide-react'

function MessageContent({ content }: { content: Content }) {
  if (content.type === 'text') {
    return <p className="text-sm leading-relaxed whitespace-pre-wrap">{content.text}</p>
  }
  if (content.type === 'component') {
    return (
      <ComponentRenderer
        key={content.id}
        content={content}
        threadId={content.id}
        messageId={content.id}
        fallback={<p className="text-muted-foreground text-xs">Component unavailable</p>}
      />
    )
  }
  return null
}

export default function DashboardPage() {
  const { messages, isStreaming, isWaiting } = useTambo()
  const { value, setValue, submit, isPending } = useTamboThreadInput()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!value.trim() || isPending) return
    await submit()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSubmit(e as unknown as React.FormEvent)
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold">Scheduling Advisor</h1>
        <p className="text-muted-foreground text-sm">Your AI-powered life balance coach</p>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="space-y-2 text-center">
              <p className="text-lg font-medium">How can I help you today?</p>
              <p className="text-muted-foreground text-sm">
                Ask me to schedule a task, review your week, or reflect on your progress.
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-3 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  }`}
                >
                  {message.content.map((block, i) => (
                    <MessageContent key={i} content={block} />
                  ))}
                </div>
              </div>
            ))}
            {(isStreaming || isWaiting) && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-4 py-3">
                  <div className="flex gap-1">
                    <span className="bg-muted-foreground h-2 w-2 animate-bounce rounded-full [animation-delay:0ms]" />
                    <span className="bg-muted-foreground h-2 w-2 animate-bounce rounded-full [animation-delay:150ms]" />
                    <span className="bg-muted-foreground h-2 w-2 animate-bounce rounded-full [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </main>

      <footer className="border-t px-4 py-4">
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="mx-auto flex max-w-2xl items-end gap-2"
        >
          <Textarea
            placeholder="Message your advisor… (Shift+Enter for newline)"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            className="max-h-32 min-h-[44px] flex-1 resize-none"
            aria-label="Message input"
          />
          <Button
            type="submit"
            size="sm"
            disabled={isPending || !value.trim()}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </footer>
    </div>
  )
}
