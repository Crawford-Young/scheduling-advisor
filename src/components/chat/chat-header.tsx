'use client'
import * as React from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/lib/ui'
import { ModelTierSelect } from '@/components/chat/model-tier-select'
import type { ModelTier } from '@/lib/chat/model-tiers'

export interface ChatHeaderProps {
  readonly title: string | null
  readonly onBack: () => void
  readonly model: ModelTier
  readonly onModelChange: (tier: ModelTier) => void
}

export function ChatHeader({
  title,
  onBack,
  model,
  onModelChange,
}: ChatHeaderProps): React.JSX.Element {
  const displayTitle = title ?? 'Untitled'
  return (
    <header className="border-border flex h-12 shrink-0 items-center border-b px-4">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Back to reflections"
        onClick={onBack}
        className="h-8 w-8"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      </Button>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="text-foreground min-w-0 flex-1 truncate px-4 text-center text-sm font-medium">
              {displayTitle}
            </p>
          </TooltipTrigger>
          <TooltipContent>{displayTitle}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <ModelTierSelect value={model} onChange={onModelChange} />
    </header>
  )
}
