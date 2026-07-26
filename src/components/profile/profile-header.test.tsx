import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ProfileIdentity } from '@/server/queries/profile'
import { ProfileHeader } from './profile-header'

vi.mock('@/lib/ui', () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="avatar">{children}</span>
  ),
  AvatarImage: ({ src, alt }: { src?: string; alt?: string }) => (
    <img data-testid="avatar-image" src={src} alt={alt} />
  ),
  AvatarFallback: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="avatar-fallback">{children}</span>
  ),
}))

function makeIdentity(overrides: Partial<ProfileIdentity> = {}): ProfileIdentity {
  return {
    id: 'user-1',
    name: 'Ada Lovelace',
    username: 'ada',
    image: null,
    bio: null,
    createdAt: new Date('2026-01-15T00:00:00.000Z'),
    isOwner: false,
    ...overrides,
  }
}

describe('ProfileHeader', () => {
  it('renders initials from the first two words of the name, uppercased', () => {
    render(<ProfileHeader identity={makeIdentity({ name: 'Ada Lovelace' })} />)

    expect(screen.getByTestId('avatar-fallback')).toHaveTextContent('AL')
  })

  it('falls back to the first two characters of the username, uppercased, when name is null', () => {
    render(<ProfileHeader identity={makeIdentity({ name: null, username: 'carol' })} />)

    expect(screen.getByTestId('avatar-fallback')).toHaveTextContent('CA')
  })

  it('renders the display name and @username when name is present', () => {
    render(<ProfileHeader identity={makeIdentity({ name: 'Ada Lovelace', username: 'ada' })} />)

    expect(screen.getByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument()
    expect(screen.getByText('@ada')).toBeInTheDocument()
  })

  it('falls back the display name to @username when name is null', () => {
    render(<ProfileHeader identity={makeIdentity({ name: null, username: 'carol' })} />)

    expect(screen.getByRole('heading', { name: '@carol' })).toBeInTheDocument()
  })

  it('does not render bio text when bio is null', () => {
    render(<ProfileHeader identity={makeIdentity({ bio: null })} />)

    expect(screen.queryByTestId('profile-bio')).not.toBeInTheDocument()
  })

  it('renders bio text when bio is present', () => {
    render(<ProfileHeader identity={makeIdentity({ bio: 'I write algorithms.' })} />)

    expect(screen.getByText('I write algorithms.')).toBeInTheDocument()
  })

  it('renders member-since text with month and year', () => {
    render(
      <ProfileHeader
        identity={makeIdentity({ createdAt: new Date('2026-03-10T00:00:00.000Z') })}
      />,
    )

    expect(screen.getByText('Member since March 2026')).toBeInTheDocument()
  })

  it('does not render an avatar image when image is null', () => {
    render(<ProfileHeader identity={makeIdentity({ image: null })} />)

    expect(screen.queryByTestId('avatar-image')).not.toBeInTheDocument()
  })

  it('renders an avatar image with the given src when image is present', () => {
    render(<ProfileHeader identity={makeIdentity({ image: 'https://example.com/ada.png' })} />)

    expect(screen.getByTestId('avatar-image')).toHaveAttribute('src', 'https://example.com/ada.png')
  })

  it('renders unchanged markup when no action is provided', () => {
    const { container } = render(<ProfileHeader identity={makeIdentity()} />)

    expect(container.querySelector('.justify-between')).toBeNull()
    expect(container.firstElementChild).toHaveClass('flex', 'items-start', 'gap-4')
  })

  it('renders the action node right-aligned when provided', () => {
    const { container } = render(
      <ProfileHeader
        identity={makeIdentity()}
        action={<div data-testid="header-action">Add friend</div>}
      />,
    )

    expect(screen.getByTestId('header-action')).toBeInTheDocument()
    expect(container.firstElementChild).toHaveClass(
      'flex',
      'items-start',
      'justify-between',
      'gap-4',
    )
  })
})
