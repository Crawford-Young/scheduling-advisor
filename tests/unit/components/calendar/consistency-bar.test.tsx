import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import { ConsistencyBar } from '@/components/calendar/consistency-bar'

describe('ConsistencyBar', () => {
  it('shows planned and completed counts', () => {
    render(<ConsistencyBar plannedCount={7} completedCount={5} consistencyPct={71} />)
    expect(screen.getByText(/5\/7/)).toBeInTheDocument()
  })

  it('shows consistency percentage', () => {
    render(<ConsistencyBar plannedCount={7} completedCount={6} consistencyPct={86} />)
    expect(screen.getByText(/86%/)).toBeInTheDocument()
  })

  it('shows perfect week label at 100%', () => {
    render(<ConsistencyBar plannedCount={5} completedCount={5} consistencyPct={100} />)
    expect(screen.getByText(/perfect week/i)).toBeInTheDocument()
  })

  it('progressbar has correct aria attributes', () => {
    render(<ConsistencyBar plannedCount={7} completedCount={5} consistencyPct={71} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '71')
  })

  it('passes axe', async () => {
    const { container } = render(
      <ConsistencyBar plannedCount={7} completedCount={3} consistencyPct={43} />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
