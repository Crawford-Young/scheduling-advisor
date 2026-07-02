import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── db mock ───────────────────────────────────────────────────────────────────
const mockFindFirst = vi.fn()

vi.mock('@/db', () => ({
  db: {
    query: {
      users: {
        findFirst: mockFindFirst,
      },
    },
  },
}))

vi.mock('@/db/schema', () => ({
  users: {},
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => val),
}))

// ── auth mock ─────────────────────────────────────────────────────────────────
vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

// ── query mocks ───────────────────────────────────────────────────────────────
vi.mock('@/server/queries/tokens', () => ({
  getTokenBalance: vi.fn(),
}))

vi.mock('@/server/queries/token-ledger', () => ({
  getTokenLedger: vi.fn(),
}))

// ── component mocks ───────────────────────────────────────────────────────────
vi.mock('@/lib/ui', () => ({
  Card: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
    <div data-testid="card" {...rest}>
      {children}
    </div>
  ),
  CardHeader: ({ children }: React.HTMLAttributes<HTMLDivElement>) => <div>{children}</div>,
  CardTitle: ({ children }: React.HTMLAttributes<HTMLHeadingElement>) => <h2>{children}</h2>,
  CardContent: ({ children }: React.HTMLAttributes<HTMLDivElement>) => <div>{children}</div>,
  TokenChip: ({ balance }: { balance: number }) => (
    <span data-testid="token-chip">{balance} tokens</span>
  ),
  Badge: ({ children }: React.HTMLAttributes<HTMLDivElement>) => (
    <span data-testid="badge">{children}</span>
  ),
  Separator: () => <hr />,
}))

vi.mock('./purchase-buttons', () => ({
  CheckoutButton: ({
    label,
    payload,
  }: {
    label: string
    payload: { type: string; tier?: string; pack?: string }
  }) => (
    <button data-testid="checkout-button" data-payload={JSON.stringify(payload)}>
      {label}
    </button>
  ),
  ManageSubscriptionButton: () => (
    <button data-testid="manage-subscription-button">Manage subscription</button>
  ),
}))

vi.mock('./token-banners', () => ({
  TokenBanners: ({ success, canceled }: { success: boolean; canceled: boolean }) => (
    <div
      data-testid="token-banners"
      data-success={String(success)}
      data-canceled={String(canceled)}
    >
      {success && <span>Tokens added!</span>}
      {canceled && <span>Checkout canceled.</span>}
    </div>
  ),
}))

// ── helpers ───────────────────────────────────────────────────────────────────
import { auth } from '@/auth'
import { getTokenBalance } from '@/server/queries/tokens'
import { getTokenLedger } from '@/server/queries/token-ledger'

const mockLedger = [
  {
    id: 'led-1',
    type: 'monthly_grant' as const,
    amount: 100,
    createdAt: new Date('2026-06-10T12:00:00Z'),
  },
  {
    id: 'led-2',
    type: 'usage' as const,
    amount: -5,
    createdAt: new Date('2026-06-09T08:00:00Z'),
  },
]

beforeEach(() => {
  vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never)
  vi.mocked(getTokenBalance).mockResolvedValue(250)
  vi.mocked(getTokenLedger).mockResolvedValue(mockLedger)
  mockFindFirst.mockResolvedValue({
    id: 'user-1',
    plan: 'growth',
    tokenResetAt: new Date('2026-07-01'),
    stripeCustomerId: 'cus_test',
  })
})

describe('TokensPage', () => {
  it('renders the token balance via TokenChip', async () => {
    const { default: TokensPage } = await import('./page')
    render(await TokensPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByTestId('token-chip')).toHaveTextContent('250')
  })

  it('renders all three tier names', async () => {
    const { default: TokensPage } = await import('./page')
    render(await TokensPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByRole('heading', { name: /starter/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /growth/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /pro/i })).toBeInTheDocument()
  })

  it('renders all three pack names', async () => {
    const { default: TokensPage } = await import('./page')
    render(await TokensPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByRole('heading', { name: /small pack/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /medium pack/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /large pack/i })).toBeInTheDocument()
  })

  it('renders ledger rows', async () => {
    const { default: TokensPage } = await import('./page')
    render(await TokensPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText(/monthly grant/i)).toBeInTheDocument()
    expect(screen.getByText(/ai usage/i)).toBeInTheDocument()
    expect(screen.getByText('+100')).toBeInTheDocument()
    expect(screen.getByText('-5')).toBeInTheDocument()
  })

  it('passes success=true to TokenBanners when ?success=1', async () => {
    const { default: TokensPage } = await import('./page')
    render(await TokensPage({ searchParams: Promise.resolve({ success: '1' }) }))
    const banners = screen.getByTestId('token-banners')
    expect(banners).toHaveAttribute('data-success', 'true')
    expect(screen.getByText('Tokens added!')).toBeInTheDocument()
  })

  it('passes success=false to TokenBanners when no success param', async () => {
    const { default: TokensPage } = await import('./page')
    render(await TokensPage({ searchParams: Promise.resolve({}) }))
    const banners = screen.getByTestId('token-banners')
    expect(banners).toHaveAttribute('data-success', 'false')
  })

  it('passes canceled=true to TokenBanners when ?canceled=1', async () => {
    const { default: TokensPage } = await import('./page')
    render(await TokensPage({ searchParams: Promise.resolve({ canceled: '1' }) }))
    const banners = screen.getByTestId('token-banners')
    expect(banners).toHaveAttribute('data-canceled', 'true')
  })

  it('highlights the current plan tier with Current badge', async () => {
    const { default: TokensPage } = await import('./page')
    render(await TokensPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByTestId('badge')).toHaveTextContent('Current')
  })

  it('shows ManageSubscriptionButton when user has a paid plan', async () => {
    const { default: TokensPage } = await import('./page')
    render(await TokensPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByTestId('manage-subscription-button')).toBeInTheDocument()
  })

  it('does not show ManageSubscriptionButton when user has no plan', async () => {
    mockFindFirst.mockResolvedValueOnce({
      id: 'user-1',
      plan: null,
      tokenResetAt: null,
      stripeCustomerId: null,
    })
    const { default: TokensPage } = await import('./page')
    render(await TokensPage({ searchParams: Promise.resolve({}) }))
    expect(screen.queryByTestId('manage-subscription-button')).not.toBeInTheDocument()
  })

  it('shows empty ledger message when no entries', async () => {
    vi.mocked(getTokenLedger).mockResolvedValueOnce([])
    const { default: TokensPage } = await import('./page')
    render(await TokensPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText(/no token transactions yet/i)).toBeInTheDocument()
  })

  it('redirects to /login when not authenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never)
    const { redirect } = await import('next/navigation')
    vi.mocked(redirect).mockImplementationOnce(() => {
      throw new Error('NEXT_REDIRECT')
    })
    const { default: TokensPage } = await import('./page')
    await expect(TokensPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/login')
  })
})
