import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { LoginAmbient } from '@/components/login/login-ambient'

describe('LoginAmbient', () => {
  it('renders a decorative container hidden from assistive tech and inert to pointer events', () => {
    const { container } = render(<LoginAmbient />)
    const decorative = container.firstElementChild

    expect(decorative).toHaveAttribute('aria-hidden', 'true')
    expect(decorative).toHaveClass('pointer-events-none')
  })
})
