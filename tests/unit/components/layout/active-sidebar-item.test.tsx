import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActiveSidebarItem } from '@/components/layout/active-sidebar-item'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn().mockReturnValue('/goals'),
}))

vi.mock('@/lib/ui', () => ({
  SidebarItem: ({
    label,
    isActive,
  }: {
    icon: React.ReactNode
    label: string
    href: string
    isActive: boolean
  }) => (
    <div data-testid="sidebar-item" data-active={isActive}>
      {label}
    </div>
  ),
}))

describe('ActiveSidebarItem', () => {
  it('renders the label', () => {
    render(<ActiveSidebarItem icon={null} label="Goals" href="/goals" />)
    expect(screen.getByText('Goals')).toBeInTheDocument()
  })

  it('is active when pathname matches href', () => {
    render(<ActiveSidebarItem icon={null} label="Goals" href="/goals" />)
    expect(screen.getByTestId('sidebar-item')).toHaveAttribute('data-active', 'true')
  })

  it('is not active when pathname does not match', () => {
    render(<ActiveSidebarItem icon={null} label="Calendar" href="/calendar" />)
    expect(screen.getByTestId('sidebar-item')).toHaveAttribute('data-active', 'false')
  })

  it('root "/" is only active when pathname is exactly "/"', async () => {
    const { usePathname } = await import('next/navigation')
    vi.mocked(usePathname).mockReturnValue('/goals')
    render(<ActiveSidebarItem icon={null} label="Home" href="/" />)
    expect(screen.getByTestId('sidebar-item')).toHaveAttribute('data-active', 'false')
  })
})
