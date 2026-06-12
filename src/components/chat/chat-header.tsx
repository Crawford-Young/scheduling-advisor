'use client'
import * as React from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button, TokenChip } from '@/lib/ui'

export interface ChatHeaderProps {
  readonly title: string | null
  readonly tokenBalance: number
  readonly onBack: () => void
}

export function ChatHeader({ title, tokenBalance, onBack }: ChatHeaderProps): React.JSX.Element {
  return (
    <header className="border-border flex h-12 shrink-0 items-center justify-between border-b px-4">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Back to reflections"
        onClick={onBack}
        className="h-8 w-8"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      </Button>

      <p className="text-foreground max-w-xs truncate text-sm font-medium">{title ?? 'Untitled'}</p>

      <TokenChip balance={tokenBalance} />
    </header>
  )
}
