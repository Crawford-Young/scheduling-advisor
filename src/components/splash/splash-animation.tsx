'use client'
import * as React from 'react'
import { useEffect, useState } from 'react'

interface SplashAnimationProps {
  readonly checkInDone: boolean
  readonly onComplete: () => void
}

type Phase = 'initial' | 'split' | 'signal' | 'done'

const PHASE_MS: Record<Exclude<Phase, 'done'>, number> = {
  initial: 400,
  split: 600,
  signal: 500,
}

export function SplashAnimation({
  checkInDone,
  onComplete,
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

  return (
    <div
      role="status"
      aria-label="Loading CyRein"
      className="bg-background fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="text-foreground flex items-center text-4xl font-bold tracking-tight select-none">
        <span
          className="transition-all duration-500"
          style={{ transform: isSplit ? 'translateX(-12px)' : 'translateX(0)' }}
        >
          Cy
          {isSplit && (
            <span
              className="transition-opacity duration-300"
              style={{ opacity: phase === 'signal' ? 1 : 0 }}
            >
              &apos;s
            </span>
          )}
        </span>
        <span
          className="transition-all duration-500"
          style={{
            transform: isSplit ? 'translateX(12px)' : 'translateX(0)',
            opacity: phase === 'signal' ? (checkInDone ? 1 : 0.4) : 1,
            textShadow:
              phase === 'signal' && checkInDone ? '0 0 20px rgba(16, 185, 129, 0.8)' : 'none',
          }}
        >
          Rein
        </span>
      </div>
    </div>
  )
}
