'use client'
import * as React from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/lib/ui'
import type { ModelTier } from '@/lib/chat/model-tier-core'

/**
 * Tier options with multiplier-suffixed labels. The labels are authored here
 * (not derived from `MODEL_TIERS`) so this client component never value-imports
 * `@/lib/chat/model-tiers` — that module eagerly builds Anthropic clients via
 * `@/env`, which would drag env validation into the browser bundle.
 */
const MODEL_TIER_OPTIONS: readonly { readonly value: ModelTier; readonly label: string }[] = [
  { value: 'sonnet', label: 'Sonnet ×1' },
  { value: 'opus', label: 'Opus ×2' },
]

export interface ModelTierSelectProps {
  readonly value: ModelTier
  readonly onChange: (tier: ModelTier) => void
  readonly disabled?: boolean
}

export function ModelTierSelect({
  value,
  onChange,
  disabled,
}: ModelTierSelectProps): React.JSX.Element {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as ModelTier)} disabled={disabled}>
      <SelectTrigger aria-label="Model" className="h-8 w-[8.5rem]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {MODEL_TIER_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
