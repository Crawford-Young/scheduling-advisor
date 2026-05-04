import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import { LifeBalanceView, lifeBalanceViewPropsSchema } from '@/components/cards/life-balance-view'

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  PieChart: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  Pie: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  Cell: () => null,
  Tooltip: ({ formatter }: { formatter?: (v: number) => string }) => {
    formatter?.(300)
    return null
  },
  Legend: () => null,
}))

const baseProps = {
  categories: [
    { label: 'Health', minutes: 300, color: '#22c55e' },
    { label: 'Work', minutes: 480, color: '#3b82f6' },
    { label: 'Learning', minutes: 120, color: '#f59e0b' },
    { label: 'Rest', minutes: 480, color: '#8b5cf6' },
  ],
}

describe('LifeBalanceView', () => {
  it('renders category labels', () => {
    render(<LifeBalanceView {...baseProps} />)
    expect(screen.getByText('Health')).toBeInTheDocument()
    expect(screen.getByText('Work')).toBeInTheDocument()
  })

  it('renders hours from minutes', () => {
    render(<LifeBalanceView {...baseProps} />)
    expect(screen.getByText('5.0h')).toBeInTheDocument()
  })

  it('passes axe accessibility check', async () => {
    const { container } = render(<LifeBalanceView {...baseProps} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('lifeBalanceViewPropsSchema', () => {
  it('validates correct props', () => {
    expect(lifeBalanceViewPropsSchema.safeParse(baseProps).success).toBe(true)
  })

  it('rejects negative minutes', () => {
    const bad = { categories: [{ label: 'X', minutes: -1, color: '#fff' }] }
    expect(lifeBalanceViewPropsSchema.safeParse(bad).success).toBe(false)
  })
})
