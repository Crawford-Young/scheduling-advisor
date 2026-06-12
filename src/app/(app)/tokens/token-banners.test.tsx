import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'jest-axe'
import { describe, expect, it, vi } from 'vitest'
import { TokenBanners } from './token-banners'

vi.mock('@/lib/ui', () => ({
  Alert: ({ children, className }: React.HTMLAttributes<HTMLDivElement>) => (
    <div role="alert" className={className}>
      {children}
    </div>
  ),
  AlertDescription: ({ children }: React.HTMLAttributes<HTMLParagraphElement>) => <p>{children}</p>,
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
  X: () => <span data-testid="x-icon" />,
}))

describe('TokenBanners', () => {
  it('renders nothing when success and canceled are both false', () => {
    const { container } = render(<TokenBanners success={false} canceled={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders success message when success is true', () => {
    render(<TokenBanners success canceled={false} />)
    expect(screen.getByText(/tokens added to your account/i)).toBeInTheDocument()
  })

  it('does not render success message when success is false', () => {
    render(<TokenBanners success={false} canceled={false} />)
    expect(screen.queryByText(/tokens added/i)).not.toBeInTheDocument()
  })

  it('renders canceled message when canceled is true', () => {
    render(<TokenBanners success={false} canceled />)
    expect(screen.getByText(/checkout canceled/i)).toBeInTheDocument()
  })

  it('dismisses the canceled banner on button click', () => {
    render(<TokenBanners success={false} canceled />)
    const dismissBtn = screen.getByRole('button', { name: /dismiss/i })
    fireEvent.click(dismissBtn)
    expect(screen.queryByText(/checkout canceled/i)).not.toBeInTheDocument()
  })

  it('can show both banners simultaneously', () => {
    render(<TokenBanners success canceled />)
    expect(screen.getByText(/tokens added to your account/i)).toBeInTheDocument()
    expect(screen.getByText(/checkout canceled/i)).toBeInTheDocument()
  })

  it('passes axe accessibility check', async () => {
    const { container } = render(<TokenBanners success canceled={false} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
