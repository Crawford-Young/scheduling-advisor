import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { UpgradeButton, ManageSubscriptionButton } from './upgrade-actions'

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

vi.mock('lucide-react', () => ({
  Zap: () => null,
  Settings: () => null,
}))

const originalLocation = window.location

beforeEach(() => {
  Object.defineProperty(window, 'location', {
    value: { href: '' },
    writable: true,
  })
})

afterEach(() => {
  Object.defineProperty(window, 'location', {
    value: originalLocation,
    writable: true,
  })
  vi.restoreAllMocks()
})

describe('UpgradeButton', () => {
  it('renders upgrade label', () => {
    render(<UpgradeButton />)
    expect(screen.getByRole('button', { name: /upgrade to pro/i })).toBeInTheDocument()
  })

  it('calls checkout API with correct subscription body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ url: 'https://checkout.stripe.com/pay/cs_live_test' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<UpgradeButton />)
    fireEvent.click(screen.getByRole('button'))

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'subscription', tier: 'pro' }),
      })
    })
  })

  it('redirects to stripe url on success', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        json: () => Promise.resolve({ url: 'https://checkout.stripe.com/pay/cs_live_test' }),
      }),
    )

    render(<UpgradeButton />)
    fireEvent.click(screen.getByRole('button'))

    await vi.waitFor(() => {
      expect(window.location.href).toBe('https://checkout.stripe.com/pay/cs_live_test')
    })
  })

  it('does not redirect when no url returned', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({ json: () => Promise.resolve({ error: 'Unauthorized' }) }),
    )

    render(<UpgradeButton />)
    fireEvent.click(screen.getByRole('button'))

    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: /upgrade to pro/i })).not.toBeDisabled()
    })
    expect(window.location.href).toBe('')
  })

  it('shows loading state while fetching', async () => {
    let resolveJson!: (v: unknown) => void
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        json: () =>
          new Promise((res) => {
            resolveJson = res
          }),
      }),
    )

    render(<UpgradeButton />)
    fireEvent.click(screen.getByRole('button'))

    expect(await screen.findByRole('button', { name: /redirecting/i })).toBeDisabled()
    resolveJson({ url: undefined })
  })
})

describe('ManageSubscriptionButton', () => {
  it('renders manage label', () => {
    render(<ManageSubscriptionButton />)
    expect(screen.getByRole('button', { name: /manage subscription/i })).toBeInTheDocument()
  })

  it('calls portal API on click', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ url: 'https://billing.stripe.com/portal/test' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<ManageSubscriptionButton />)
    fireEvent.click(screen.getByRole('button'))

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/stripe/portal', { method: 'POST' })
    })
  })

  it('redirects to portal url on success', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        json: () => Promise.resolve({ url: 'https://billing.stripe.com/portal/test' }),
      }),
    )

    render(<ManageSubscriptionButton />)
    fireEvent.click(screen.getByRole('button'))

    await vi.waitFor(() => {
      expect(window.location.href).toBe('https://billing.stripe.com/portal/test')
    })
  })

  it('shows loading state while fetching', async () => {
    let resolveJson!: (v: unknown) => void
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        json: () =>
          new Promise((res) => {
            resolveJson = res
          }),
      }),
    )

    render(<ManageSubscriptionButton />)
    fireEvent.click(screen.getByRole('button'))

    expect(await screen.findByRole('button', { name: /redirecting/i })).toBeDisabled()
    resolveJson({ url: undefined })
  })
})
