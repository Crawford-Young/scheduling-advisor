'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { HeroCard } from '@crawfordyoung/ui'

interface HeroCardCtaProps {
  readonly headline: string
  readonly subtitle: string
  readonly ctaLabel: string
}

export function HeroCardCta({ headline, subtitle, ctaLabel }: HeroCardCtaProps): React.JSX.Element {
  const router = useRouter()
  return (
    <HeroCard
      headline={headline}
      subtitle={subtitle}
      ctaLabel={ctaLabel}
      onCtaClick={() => router.push('/?chat=1')}
    />
  )
}
