'use client'
import * as React from 'react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SplashAnimation } from '@/components/splash/splash-animation'

interface Quote {
  readonly text: string
  readonly attribution: string | null
}

const QUOTES: readonly Quote[] = [
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

const SPLASH_KEY = 'cyrein-splash-v1'

interface SplashAnimationClientProps {
  readonly checkInDone: boolean
}

export function SplashAnimationClient({
  checkInDone,
}: SplashAnimationClientProps): React.JSX.Element | null {
  const router = useRouter()
  const [visible, setVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    if (sessionStorage.getItem(SPLASH_KEY)) return false
    sessionStorage.setItem(SPLASH_KEY, '1')
    return true
  })
  const [quote] = useState<Quote>(() => QUOTES[Math.floor(Math.random() * QUOTES.length)]!)

  if (!visible) return null

  function handleComplete(): void {
    setVisible(false)
    if (!checkInDone) {
      router.push('/calendar')
    }
  }

  return <SplashAnimation checkInDone={checkInDone} onComplete={handleComplete} quote={quote} />
}
