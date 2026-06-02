import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import React from 'react'

interface PageProps {
  readonly params: Promise<{ conversationId: string }>
}

export default async function ChatPage({ params }: PageProps): Promise<React.JSX.Element> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { conversationId } = await params

  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-muted-foreground text-sm">
        Chat {conversationId} — full layout coming in subsystem 2
      </p>
    </div>
  )
}
