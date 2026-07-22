import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { SplashProvider, useSplash } from '@/components/splash/splash-provider'
import { BrandMark } from '@/components/layout/brand-mark'

function ShowSplashButton(): React.JSX.Element {
  const { showSplash } = useSplash()
  return <button onClick={showSplash}>show</button>
}

function renderMark(): void {
  render(
    <SplashProvider>
      <BrandMark />
      <ShowSplashButton />
    </SplashProvider>,
  )
}

describe('BrandMark', () => {
  it('renders the Cybond wordmark', () => {
    renderMark()
    expect(screen.getByText('Cybond')).toBeInTheDocument()
  })

  it('carries the brand-wordmark view-transition-name while the splash is inactive', () => {
    renderMark()
    const mark = screen.getByText('Cybond') as HTMLElement
    expect(mark.style.viewTransitionName).toBe('brand-wordmark')
  })

  it('drops the view-transition-name while the splash is active', async () => {
    renderMark()
    await act(async () => screen.getByText('show').click())
    const mark = screen.getByText('Cybond') as HTMLElement
    expect(mark.style.viewTransitionName).toBe('')
  })
})
