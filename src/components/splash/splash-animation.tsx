'use client'
import * as React from 'react'
import { useEffect, useState } from 'react'

interface Quote {
  readonly text: string
  readonly attribution: string | null
}

interface SplashAnimationProps {
  readonly checkInDone: boolean
  readonly onComplete: () => void
  readonly quote: Quote
}

type Phase = 'initial' | 'split' | 'signal' | 'done'

const PHASE_MS: Record<Exclude<Phase, 'done'>, number> = {
  initial: 400,
  split: 600,
  signal: 800,
}

export function SplashAnimation({
  checkInDone,
  onComplete,
  quote,
}: SplashAnimationProps): React.JSX.Element | null {
  const [phase, setPhase] = useState<Phase>('initial')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('split'), PHASE_MS.initial)
    const t2 = setTimeout(() => setPhase('signal'), PHASE_MS.initial + PHASE_MS.split)
    const t3 = setTimeout(
      () => {
        setPhase('done')
        onComplete()
      },
      PHASE_MS.initial + PHASE_MS.split + PHASE_MS.signal,
    )
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [onComplete])

  if (phase === 'done') return null

  const isSplit = phase === 'split' || phase === 'signal'
  const isSignal = phase === 'signal'

  return (
    <div
      role="status"
      aria-label="Loading CyRein"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8"
      style={{ backgroundColor: 'rgb(var(--background))' }}
    >
      <div
        className="flex items-center text-4xl font-bold tracking-tight select-none"
        style={{ color: 'rgb(var(--foreground))' }}
      >
        <span
          className="transition-all duration-500"
          style={{ transform: isSplit ? 'translateX(-12px)' : 'translateX(0)' }}
        >
          Cy
          {isSplit && (
            <span className="transition-opacity duration-300" style={{ opacity: isSignal ? 1 : 0 }}>
              &apos;s
            </span>
          )}
        </span>
        <span
          className="transition-all duration-500"
          style={{
            transform: isSplit ? 'translateX(12px)' : 'translateX(0)',
            opacity: isSignal ? (checkInDone ? 1 : 0.4) : 1,
            textShadow: isSignal && checkInDone ? '0 0 20px rgba(16, 185, 129, 0.8)' : 'none',
          }}
        >
          Rein
        </span>
      </div>

      <div
        className="flex max-w-sm flex-col items-center gap-1 px-8 text-center transition-opacity duration-500"
        style={{ opacity: isSplit ? 1 : 0 }}
      >
        <p
          className="text-sm leading-relaxed italic"
          style={{ color: 'rgb(var(--muted-foreground) / 0.8)' }}
        >
          &ldquo;{quote.text}&rdquo;
        </p>
        {quote.attribution !== null && (
          <p className="text-xs" style={{ color: 'rgb(var(--muted-foreground) / 0.5)' }}>
            — {quote.attribution}
          </p>
        )}
      </div>
    </div>
  )
}
