import * as React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ModelTierSelect } from './model-tier-select'

let triggerAriaLabel: string | undefined

vi.mock('@/lib/ui', () => ({
  Select: ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value: string
    onValueChange: (value: string) => void
    disabled?: boolean
    children: React.ReactNode
  }) => (
    <select
      data-testid="model-select"
      value={value}
      disabled={disabled}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ 'aria-label': ariaLabel }: { 'aria-label'?: string }) => {
    triggerAriaLabel = ariaLabel
    return null
  },
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}))

function select(): HTMLSelectElement {
  return screen.getByTestId('model-select') as HTMLSelectElement
}

describe('ModelTierSelect', () => {
  beforeEach(() => {
    triggerAriaLabel = undefined
  })

  it('renders the stored tier as the selected value', () => {
    render(<ModelTierSelect value="opus" onChange={() => {}} />)
    expect(select().value).toBe('opus')
  })

  it('renders both tiers with multiplier-suffixed labels', () => {
    render(<ModelTierSelect value="sonnet" onChange={() => {}} />)
    expect(screen.getByRole('option', { name: 'Sonnet ×1' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Opus ×2' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Haiku ×0.33' })).not.toBeInTheDocument()
  })

  it('fires onChange with the chosen tier', () => {
    const onChange = vi.fn()
    render(<ModelTierSelect value="sonnet" onChange={onChange} />)
    fireEvent.change(select(), { target: { value: 'opus' } })
    expect(onChange).toHaveBeenCalledWith('opus')
  })

  it('labels the trigger "Model"', () => {
    render(<ModelTierSelect value="sonnet" onChange={() => {}} />)
    expect(triggerAriaLabel).toBe('Model')
  })

  it('is enabled by default', () => {
    render(<ModelTierSelect value="sonnet" onChange={() => {}} />)
    expect(select().disabled).toBe(false)
  })

  it('disables the select when disabled is true', () => {
    render(<ModelTierSelect value="sonnet" onChange={() => {}} disabled />)
    expect(select().disabled).toBe(true)
  })
})
