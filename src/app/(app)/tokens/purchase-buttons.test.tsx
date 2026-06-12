import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { CheckoutButton, ManageSubscriptionButton } from './purchase-buttons'

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

describe('CheckoutButton', () => {
  it('renders the provided label', () => {
    render(
      <CheckoutButton payload={{ type: 'subscription', tier: 'starter' }} label="Get Starter" />,
    )
    expect(screen.getByRole('button', { name: /get starter/i })).toBeInTheDocument()
  })

  it('posts the correct subscription payload to /api/stripe/checkout', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ url: 'https://checkout.stripe.com/pay/cs_test' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<CheckoutButton payload={{ type: 'subscription', tier: 'growth' }} label="Get Growth" />)
    fireEvent.click(screen.getByRole('button'))

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'subscription', tier: 'growth' }),
      })
    })
  })

  it('posts the correct pack payload to /api/stripe/checkout', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ url: 'https://checkout.stripe.com/pay/cs_test' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<CheckoutButton payload={{ type: 'pack', pack: 'medium' }} label="Medium pack" />)
    fireEvent.click(screen.getByRole('button'))

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'pack', pack: 'medium' }),
      })
    })
  })

  it('redirects to stripe url on success', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        json: () => Promise.resolve({ url: 'https://checkout.stripe.com/pay/cs_test' }),
      }),
    )

    render(<CheckoutButton payload={{ type: 'subscription', tier: 'pro' }} label="Get Pro" />)
    fireEvent.click(screen.getByRole('button'))

    await vi.waitFor(() => {
      expect(window.location.href).toBe('https://checkout.stripe.com/pay/cs_test')
    })
  })

  it('does not redirect when no url returned', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({ json: () => Promise.resolve({ error: 'Unauthorized' }) }),
    )

    render(<CheckoutButton payload={{ type: 'pack', pack: 'small' }} label="Small pack" />)
    fireEvent.click(screen.getByRole('button'))

    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: /small pack/i })).not.toBeDisabled()
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

    render(
      <CheckoutButton payload={{ type: 'subscription', tier: 'starter' }} label="Get Starter" />,
    )
    fireEvent.click(screen.getByRole('button'))

    expect(await screen.findByRole('button', { name: /redirecting/i })).toBeDisabled()
    resolveJson({ url: undefined })
  })

  it('is disabled while loading', async () => {
    let resolveJson!: (v: unknown) => void
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        json: () =>
          new Promise((res) => {
            resolveJson = res
          }),
      }),
    )

    render(<CheckoutButton payload={{ type: 'pack', pack: 'large' }} label="Large pack" />)
    fireEvent.click(screen.getByRole('button'))

    const btn = await screen.findByRole('button', { name: /redirecting/i })
    expect(btn).toBeDisabled()
    resolveJson({ url: undefined })
  })
})

describe('ManageSubscriptionButton', () => {
  it('renders manage subscription label', () => {
    render(<ManageSubscriptionButton />)
    expect(screen.getByRole('button', { name: /manage subscription/i })).toBeInTheDocument()
  })

  it('calls /api/stripe/portal on click', async () => {
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
