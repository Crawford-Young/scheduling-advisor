import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SplashProvider } from '@/components/splash/splash-provider'
import { SplashAnimationClient } from '@/components/splash/splash-animation-client'

const { startBrandHandoffMock } = vi.hoisted(() => ({
  startBrandHandoffMock: vi.fn(async (update: () => void) => update()),
}))

vi.mock('@/lib/ui', () => ({
  BrandSplash: ({
    wordmark,
    splitIndex,
    signal,
    quote,
    onComplete,
    handoffName,
    exit,
  }: {
    wordmark: string
    splitIndex: number
    signal: 'glow' | 'dim' | 'none'
    quote?: { text: string; attribution: string | null }
    onComplete: () => void
    handoffName?: string
    exit?: 'fade' | 'external'
  }): React.JSX.Element => (
    <div
      data-testid="splash"
      data-split-index={splitIndex}
      data-handoff-name={handoffName}
      data-exit={exit}
    >
      <span data-testid="wordmark">{wordmark}</span>
      <span data-testid="signal">{signal}</span>
      <span data-testid="quote">{quote?.text}</span>
      <button onClick={onComplete}>complete</button>
    </div>
  ),
  startBrandHandoff: startBrandHandoffMock,
}))

const SPLASH_KEY = 'cybond-splash-v1'

function renderClient(): void {
  render(
    <SplashProvider>
      <SplashAnimationClient />
    </SplashProvider>,
  )
}

describe('SplashAnimationClient', () => {
  beforeEach(() => {
    sessionStorage.removeItem(SPLASH_KEY)
    startBrandHandoffMock.mockClear()
  })

  afterEach(() => {
    sessionStorage.removeItem(SPLASH_KEY)
  })

  it('shows splash on first mount', async () => {
    await act(async () => {
      renderClient()
    })
    expect(screen.getByTestId('splash')).toBeInTheDocument()
    expect(sessionStorage.getItem(SPLASH_KEY)).toBe('1')
  })

  it('does not show splash if session key already set', async () => {
    sessionStorage.setItem(SPLASH_KEY, '1')
    await act(async () => {
      renderClient()
    })
    expect(screen.queryByTestId('splash')).not.toBeInTheDocument()
  })

  it('renders BrandSplash with brand staging props', async () => {
    await act(async () => {
      renderClient()
    })
    const splash = screen.getByTestId('splash')
    expect(screen.getByTestId('wordmark')).toHaveTextContent('Cybond')
    expect(splash).toHaveAttribute('data-split-index', '2')
    expect(splash).toHaveAttribute('data-handoff-name', 'brand-wordmark')
    expect(splash).toHaveAttribute('data-exit', 'external')
  })

  it('passes the selected quote text to BrandSplash', async () => {
    await act(async () => {
      renderClient()
    })
    expect(screen.getByTestId('quote').textContent).not.toBe('')
  })

  it('always renders the glow signal', async () => {
    await act(async () => {
      renderClient()
    })
    expect(screen.getByTestId('signal')).toHaveTextContent('glow')
  })

  it('unmounts through startBrandHandoff on complete', async () => {
    await act(async () => {
      renderClient()
    })
    await act(async () => {
      screen.getByText('complete').click()
    })
    expect(startBrandHandoffMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('splash')).not.toBeInTheDocument()
  })
})
