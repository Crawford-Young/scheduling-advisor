import { render, screen, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { SplashAnimationClient } from '@/components/splash/splash-animation-client'

let capturedOnComplete: (() => void) | undefined

vi.mock('@/components/splash/splash-animation', () => ({
  SplashAnimation: ({ onComplete }: { onComplete: () => void; quote: unknown }) => {
    capturedOnComplete = onComplete
    return <div data-testid="splash">splash</div>
  },
}))

const SPLASH_KEY = 'cybond-splash-v1'

describe('SplashAnimationClient', () => {
  beforeEach(() => {
    sessionStorage.removeItem(SPLASH_KEY)
    capturedOnComplete = undefined
  })

  afterEach(() => {
    sessionStorage.removeItem(SPLASH_KEY)
  })

  it('shows splash on first mount', async () => {
    await act(async () => {
      render(<SplashAnimationClient />)
    })
    expect(screen.getByTestId('splash')).toBeInTheDocument()
  })

  it('does not show splash if session key already set', async () => {
    sessionStorage.setItem(SPLASH_KEY, '1')
    await act(async () => {
      render(<SplashAnimationClient />)
    })
    expect(screen.queryByTestId('splash')).not.toBeInTheDocument()
  })

  it('hides splash on complete', async () => {
    await act(async () => {
      render(<SplashAnimationClient />)
    })
    act(() => {
      capturedOnComplete?.()
    })
    expect(screen.queryByTestId('splash')).not.toBeInTheDocument()
  })
})
