import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ProfileStats as ProfileStatsData } from '@/server/queries/profile'
import { ProfileStats } from './profile-stats'

vi.mock('@/lib/ui', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

function makeStats(overrides: Partial<ProfileStatsData> = {}): ProfileStatsData {
  return {
    completionsThisWeek: 3,
    completionsThisMonth: 12,
    completionsAllTime: 87,
    ...overrides,
  }
}

describe('ProfileStats', () => {
  it('renders three cards', () => {
    render(<ProfileStats stats={makeStats()} />)

    expect(screen.getAllByTestId('card')).toHaveLength(3)
  })

  it('renders the "This week" card with its count', () => {
    render(<ProfileStats stats={makeStats({ completionsThisWeek: 3 })} />)

    expect(screen.getByText('This week')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('renders the "This month" card with its count', () => {
    render(<ProfileStats stats={makeStats({ completionsThisMonth: 12 })} />)

    expect(screen.getByText('This month')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('renders the "All time" card with its count', () => {
    render(<ProfileStats stats={makeStats({ completionsAllTime: 87 })} />)

    expect(screen.getByText('All time')).toBeInTheDocument()
    expect(screen.getByText('87')).toBeInTheDocument()
  })
})
