'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { MessageSquarePlus } from 'lucide-react'
import { Button } from '@/lib/ui'
import { createConversation } from '@/server/actions/conversations'

export function NewConversationButton(): React.JSX.Element {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleClick(): void {
    if (isPending) return
    startTransition(async () => {
      const { id } = await createConversation('general')
      router.push(`/chat/${id}`)
    })
  }

  return (
    <Button type="button" onClick={handleClick} disabled={isPending}>
      <MessageSquarePlus className="mr-1 h-4 w-4" aria-hidden />
      New conversation
    </Button>
  )
}
