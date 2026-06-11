import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { UpgradeButton, ManageSubscriptionButton } from '@/components/upgrade/upgrade-actions'

vi.mock('@/lib/ui', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  ),
}))

describe('UpgradeButton', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      json: () => Promise.resolve({ url: 'https://checkout.stripe.com/test' }),
    } as unknown as Response)
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '' },
    })
  })

  it('renders upgrade button', () => {
    render(<UpgradeButton />)
    expect(screen.getByRole('button', { name: /upgrade to pro/i })).toBeInTheDocument()
  })

  it('redirects to stripe checkout url on click', async () => {
    render(<UpgradeButton />)
    fireEvent.click(screen.getByRole('button'))
    await vi.waitFor(() => {
      expect(window.location.href).toBe('https://checkout.stripe.com/test')
    })
  })

  it('does not redirect when no url in response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      json: () => Promise.resolve({}),
    } as unknown as Response)
    const prevHref = window.location.href
    render(<UpgradeButton />)
    fireEvent.click(screen.getByRole('button'))
    await vi.waitFor(() => {
      expect(window.location.href).toBe(prevHref)
    })
  })
})

describe('ManageSubscriptionButton', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      json: () => Promise.resolve({ url: 'https://billing.stripe.com/test' }),
    } as unknown as Response)
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '' },
    })
  })

  it('renders manage button', () => {
    render(<ManageSubscriptionButton />)
    expect(screen.getByRole('button', { name: /manage subscription/i })).toBeInTheDocument()
  })

  it('redirects to billing portal url on click', async () => {
    render(<ManageSubscriptionButton />)
    fireEvent.click(screen.getByRole('button'))
    await vi.waitFor(() => {
      expect(window.location.href).toBe('https://billing.stripe.com/test')
    })
  })

  it('does not redirect when no url in response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      json: () => Promise.resolve({}),
    } as unknown as Response)
    const prevHref = window.location.href
    render(<ManageSubscriptionButton />)
    fireEvent.click(screen.getByRole('button'))
    await vi.waitFor(() => {
      expect(window.location.href).toBe(prevHref)
    })
  })
})
