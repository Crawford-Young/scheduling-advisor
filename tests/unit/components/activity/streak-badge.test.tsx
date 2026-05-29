import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import { StreakBadge } from '@/components/activity/streak-badge'

vi.mock('@/lib/ui', () => ({
  Badge: ({ children, ...p }: React.HTMLAttributes<HTMLSpanElement>) =>
    React.createElement('span', p, children),
}))

describe('StreakBadge', () => {
  it('renders streak count', () => {
    render(<StreakBadge streak={7} />)
    expect(screen.getByText(/7/)).toBeInTheDocument()
  })

  it('renders nothing when streak is 0', () => {
    const { container } = render(<StreakBadge streak={0} />)
    expect(container.firstChild).toBeNull()
  })

  it('passes axe', async () => {
    const { container } = render(<StreakBadge streak={5} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
