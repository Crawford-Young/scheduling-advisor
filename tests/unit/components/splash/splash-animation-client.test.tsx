import { render, screen, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { SplashAnimationClient } from '@/components/splash/splash-animation-client'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

let capturedOnComplete: (() => void) | undefined

vi.mock('@/components/splash/splash-animation', () => ({
  SplashAnimation: ({
    onComplete,
  }: {
    checkInDone: boolean
    onComplete: () => void
    quote: { text: string; attribution: string | null }
  }) => {
    capturedOnComplete = onComplete
    return <div data-testid="splash">splash</div>
  },
}))

const SPLASH_KEY = 'cybond-splash-v1'

describe('SplashAnimationClient', () => {
  beforeEach(() => {
    sessionStorage.removeItem(SPLASH_KEY)
    pushMock.mockClear()
    capturedOnComplete = undefined
  })

  afterEach(() => {
    sessionStorage.removeItem(SPLASH_KEY)
  })

  it('shows splash on first mount', async () => {
    await act(async () => {
      render(<SplashAnimationClient checkInDone={false} />)
    })
    expect(screen.getByTestId('splash')).toBeInTheDocument()
  })

  it('does not show splash if session key already set', async () => {
    sessionStorage.setItem(SPLASH_KEY, '1')
    await act(async () => {
      render(<SplashAnimationClient checkInDone={false} />)
    })
    expect(screen.queryByTestId('splash')).not.toBeInTheDocument()
  })

  it('hides splash and navigates to /calendar when checkInDone is false', async () => {
    await act(async () => {
      render(<SplashAnimationClient checkInDone={false} />)
    })
    act(() => {
      capturedOnComplete?.()
    })
    expect(pushMock).toHaveBeenCalledWith('/calendar')
    expect(screen.queryByTestId('splash')).not.toBeInTheDocument()
  })

  it('hides splash without navigating when checkInDone is true', async () => {
    await act(async () => {
      render(<SplashAnimationClient checkInDone={true} />)
    })
    act(() => {
      capturedOnComplete?.()
    })
    expect(pushMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('splash')).not.toBeInTheDocument()
  })
})
