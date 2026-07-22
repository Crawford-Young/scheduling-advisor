'use client'
import * as React from 'react'
import { startTransition, useEffect } from 'react'
import { flushSync } from 'react-dom'
import { BrandSplash, startBrandHandoff } from '@/lib/ui'
import type { SplashQuote } from '@/lib/ui'
import { useSplash } from '@/components/splash/splash-provider'

const QUOTES: readonly SplashQuote[] = [
  { text: 'Either you run the day, or the day runs you.', attribution: 'Jim Rohn' },
  {
    text: "You don't rise to the level of your goals. You fall to the level of your systems.",
    attribution: 'James Clear',
  },
  {
    text: "The key is not to prioritize what's on your schedule, but to schedule your priorities.",
    attribution: 'Stephen Covey',
  },
  { text: 'Focus is the art of knowing what to ignore.', attribution: null },
  {
    text: 'Small daily improvements are the key to staggering long-term results.',
    attribution: null,
  },
  {
    text: 'Discipline is choosing between what you want now and what you want most.',
    attribution: 'Abraham Lincoln',
  },
  { text: 'Please actually use the app this time.', attribution: 'Crawford Young, Creator' },
  { text: 'I built this instead of doing my habits.', attribution: 'Crawford Young, Creator' },
  {
    text: 'My therapist said I needed better routines. This seemed easier.',
    attribution: 'Crawford Young, Creator',
  },
  {
    text: "If you're reading this, the app loaded successfully.",
    attribution: 'Crawford Young, Creator',
  },
  {
    text: 'Technically, opening the app counts as a habit.',
    attribution: 'Crawford Young, Creator',
  },
]

const SPLASH_KEY = 'cybond-splash-v1'
const WORDMARK = 'Cybond'
const SPLIT_INDEX = 2

export function SplashAnimationClient(): React.JSX.Element | null {
  const { splashActive, showSplash, endSplash } = useSplash()
  const [quote] = React.useState<SplashQuote>(
    () => QUOTES[Math.floor(Math.random() * QUOTES.length)]!,
  )

  useEffect(() => {
    if (sessionStorage.getItem(SPLASH_KEY)) return
    sessionStorage.setItem(SPLASH_KEY, '1')
    startTransition(() => showSplash())
  }, [showSplash])

  if (!splashActive) return null

  function handleComplete(): void {
    void startBrandHandoff(() => {
      flushSync(() => endSplash())
    })
  }

  return (
    <BrandSplash
      wordmark={WORDMARK}
      splitIndex={SPLIT_INDEX}
      signal="glow"
      quote={quote}
      onComplete={handleComplete}
      handoffName="brand-wordmark"
      exit="external"
    />
  )
}
