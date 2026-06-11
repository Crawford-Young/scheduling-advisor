import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HeroCardCta } from '@/components/home/hero-card-cta'

vi.mock('@/lib/ui', () => ({
  HeroCard: ({
    headline,
    subtitle,
    ctaLabel,
    onCtaClick,
  }: {
    headline: string
    subtitle: string
    ctaLabel: string
    onCtaClick: () => void
  }) => (
    <div>
      <h1>{headline}</h1>
      <p>{subtitle}</p>
      <button onClick={onCtaClick}>{ctaLabel}</button>
    </div>
  ),
}))

describe('HeroCardCta', () => {
  it('renders headline, subtitle, cta', () => {
    render(<HeroCardCta headline="Hello" subtitle="World" ctaLabel="Start" />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('World')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()
  })

  it('dispatches open-chat event on cta click', () => {
    const listener = vi.fn()
    window.addEventListener('open-chat', listener)
    render(<HeroCardCta headline="Hello" subtitle="World" ctaLabel="Start" />)
    fireEvent.click(screen.getByRole('button'))
    expect(listener).toHaveBeenCalled()
    window.removeEventListener('open-chat', listener)
  })
})
