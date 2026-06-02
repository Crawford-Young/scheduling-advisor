'use client'
import * as React from 'react'
import { HeroCard } from '@/lib/ui'

interface HeroCardCtaProps {
  readonly headline: string
  readonly subtitle: string
  readonly ctaLabel: string
}

export function HeroCardCta({ headline, subtitle, ctaLabel }: HeroCardCtaProps): React.JSX.Element {
  return (
    <HeroCard
      headline={headline}
      subtitle={subtitle}
      ctaLabel={ctaLabel}
      onCtaClick={() => window.dispatchEvent(new CustomEvent('open-chat'))}
    />
  )
}
