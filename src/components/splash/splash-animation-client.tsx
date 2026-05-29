'use client'
import * as React from 'react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SplashAnimation } from '@/components/splash/splash-animation'

interface SplashAnimationClientProps {
  readonly checkInDone: boolean
}

export function SplashAnimationClient({
  checkInDone,
}: SplashAnimationClientProps): React.JSX.Element | null {
  const router = useRouter()
  const [visible, setVisible] = useState(true)

  if (!visible) return null

  function handleComplete(): void {
    setVisible(false)
    if (!checkInDone) {
      router.push('/calendar')
    }
  }

  return <SplashAnimation checkInDone={checkInDone} onComplete={handleComplete} />
}
