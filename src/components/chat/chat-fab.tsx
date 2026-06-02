'use client'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { ChatFab as ChatFabPrimitive } from '@/lib/ui'
import { createConversation } from '@/server/actions/conversations'

export function ChatFab(): React.JSX.Element {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleClick(): void {
    if (isPending) return
    startTransition(async () => {
      const { id } = await createConversation('general')
      router.push(`/chat/${id}`)
    })
  }

  return <ChatFabPrimitive onClick={handleClick} />
}
