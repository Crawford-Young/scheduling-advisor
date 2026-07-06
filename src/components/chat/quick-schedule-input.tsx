'use client'
import * as React from 'react'
import { useChat } from 'ai/react'
import type { Message, ToolInvocation } from 'ai'
import { usePathname } from 'next/navigation'
import { Send } from 'lucide-react'
import { Button, Input } from '@/lib/ui'
import { ToolResultRenderer } from '@/components/chat/tool-result-renderer'

const MAX_TRANSCRIPT_MESSAGES = 6
const CHAT_ROUTE = '/chat'
const QUICK_SCHEDULE_MODE = 'quick-schedule'
const SUCCESS_TOOL_NAMES: ReadonlySet<string> = new Set(['createCalendarEvent', 'createTask'])
const QUICK_ADD_PLACEHOLDER = 'Quick add — "dinner Fri 7pm"'

type ResultToolInvocation = ToolInvocation & { state: 'result' }

function isResultInvocation(invocation: ToolInvocation): invocation is ResultToolInvocation {
  return invocation.state === 'result'
}

function findResultInvocation(
  messages: readonly Message[],
  predicate: (invocation: ResultToolInvocation) => boolean,
): ResultToolInvocation | undefined {
  for (const message of messages) {
    const hit = message.toolInvocations?.filter(isResultInvocation).find(predicate)
    if (hit) return hit
  }
  return undefined
}

export function QuickScheduleInput(): React.JSX.Element | null {
  const pathname = usePathname()
  const sessionId = React.useId()
  const [value, setValue] = React.useState('')

  const { messages, append, setMessages } = useChat({
    id: sessionId,
    api: '/api/chat',
    body: { mode: QUICK_SCHEDULE_MODE },
    onFinish: () => {
      window.dispatchEvent(new CustomEvent('token-balance-changed'))
    },
  })

  if (pathname === CHAT_ROUTE) return null

  const successResult = findResultInvocation(messages, (invocation) =>
    SUCCESS_TOOL_NAMES.has(invocation.toolName),
  )
  const atCapacity = messages.length >= MAX_TRANSCRIPT_MESSAGES

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const text = value.trim()
    if (!text || atCapacity) return
    append({ role: 'user', content: text })
    setValue('')
  }

  function handleReset(): void {
    setMessages([])
    setValue('')
  }

  if (successResult) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-foreground">Added to your schedule.</span>
        <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
          Add another
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={QUICK_ADD_PLACEHOLDER}
          aria-label="Quick add"
          disabled={atCapacity}
          className="h-8 w-56"
        />
        <Button type="submit" size="icon" disabled={atCapacity || !value.trim()}>
          <Send className="h-4 w-4" aria-hidden />
          <span className="sr-only">Add</span>
        </Button>
      </form>
      {atCapacity && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Quick add is full.</span>
          <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
            Reset
          </Button>
        </div>
      )}
      {messages.map((message) =>
        message.toolInvocations
          ?.filter(isResultInvocation)
          .map((invocation) => (
            <ToolResultRenderer
              key={invocation.toolCallId}
              toolInvocation={invocation}
              append={append}
            />
          )),
      )}
    </div>
  )
}
