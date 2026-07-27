import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import FriendsLoading from './loading'

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    ViewTransition: ({
      children,
      enter,
      exit,
      default: defaultTransition,
    }: {
      readonly children: React.ReactNode
      readonly enter?: string
      readonly exit?: string
      readonly default?: string
    }) => (
      <div
        data-testid="view-transition"
        data-enter={enter}
        data-exit={exit}
        data-default={defaultTransition}
      >
        {children}
      </div>
    ),
  }
})

describe('FriendsLoading', () => {
  it('wraps the skeleton in an exit ViewTransition', () => {
    render(<FriendsLoading />)

    const viewTransition = screen.getByTestId('view-transition')
    expect(viewTransition).toHaveAttribute('data-exit', 'reveal-exit')
  })

  it('renders a busy, width-matched skeleton container (heading, tab bar, search, row group)', () => {
    const { container } = render(<FriendsLoading />)

    const busyContainer = container.querySelector('[aria-busy="true"]')
    expect(busyContainer).not.toBeNull()
    expect(busyContainer).toHaveClass('mx-auto', 'max-w-5xl', 'space-y-6')
    expect(busyContainer?.children).toHaveLength(4)
  })

  it('renders four row skeletons inside the row group', () => {
    const { container } = render(<FriendsLoading />)

    const rowGroup = container.querySelector('.space-y-2')
    expect(rowGroup?.children).toHaveLength(4)
  })
})
