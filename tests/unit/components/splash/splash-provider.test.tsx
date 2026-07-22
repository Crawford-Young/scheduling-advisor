import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { SplashProvider, useSplash } from '@/components/splash/splash-provider'

function Probe(): React.JSX.Element {
  const { splashActive, showSplash, endSplash } = useSplash()
  return (
    <div>
      <span data-testid="state">{splashActive ? 'on' : 'off'}</span>
      <button onClick={showSplash}>show</button>
      <button onClick={endSplash}>end</button>
    </div>
  )
}

describe('SplashProvider', () => {
  it('starts inactive, toggles via showSplash/endSplash', async () => {
    render(
      <SplashProvider>
        <Probe />
      </SplashProvider>,
    )
    expect(screen.getByTestId('state')).toHaveTextContent('off')
    await act(async () => screen.getByText('show').click())
    expect(screen.getByTestId('state')).toHaveTextContent('on')
    await act(async () => screen.getByText('end').click())
    expect(screen.getByTestId('state')).toHaveTextContent('off')
  })

  it('useSplash throws outside the provider', () => {
    expect(() => render(<Probe />)).toThrow('useSplash must be used within SplashProvider')
  })
})
