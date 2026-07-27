import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FriendRow, friendDisplayName } from './friend-row'

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

function makeUser(overrides: Partial<Parameters<typeof FriendRow>[0]['user']> = {}) {
  return {
    userId: 'user-1',
    username: 'ada',
    name: 'Ada Lovelace',
    image: null,
    ...overrides,
  }
}

describe('friendDisplayName', () => {
  it('returns the name when present', () => {
    expect(friendDisplayName(makeUser({ name: 'Ada Lovelace', username: 'ada' }))).toBe(
      'Ada Lovelace',
    )
  })

  it('falls back to the username when name is null', () => {
    expect(friendDisplayName(makeUser({ name: null, username: 'carol' }))).toBe('carol')
  })

  it('falls back to "Unknown user" when both name and username are null', () => {
    expect(friendDisplayName(makeUser({ name: null, username: null }))).toBe('Unknown user')
  })
})

describe('FriendRow', () => {
  it('renders the display name', () => {
    render(<FriendRow user={makeUser()} />)
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
  })

  it('renders @username as plain text, not a link', () => {
    render(<FriendRow user={makeUser({ username: 'ada' })} />)
    expect(screen.getByText('@ada')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '@ada' })).not.toBeInTheDocument()
  })

  it('renders a whole-row overlay link to /u/[username] with an accessible name', () => {
    render(<FriendRow user={makeUser({ username: 'ada', name: 'Ada Lovelace' })} />)
    const link = screen.getByRole('link', { name: "View Ada Lovelace's profile" })
    expect(link).toHaveAttribute('href', '/u/ada')
  })

  it('does not render any link when username is null', () => {
    render(<FriendRow user={makeUser({ username: null })} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('does not render an avatar image when image is null', () => {
    render(<FriendRow user={makeUser({ image: null })} />)
    expect(screen.queryByTestId('avatar-image')).not.toBeInTheDocument()
  })

  it('renders an avatar image with the given src when image is present', () => {
    render(<FriendRow user={makeUser({ image: 'https://example.com/ada.png' })} />)
    expect(screen.getByTestId('avatar-image')).toHaveAttribute('src', 'https://example.com/ada.png')
  })

  it('falls back to the username as the display name when name is null', () => {
    render(<FriendRow user={makeUser({ name: null, username: 'carol' })} />)
    expect(screen.getByText('carol')).toBeInTheDocument()
  })

  it('falls back to "Unknown user" when both name and username are null', () => {
    render(<FriendRow user={makeUser({ name: null, username: null })} />)
    expect(screen.getByText('Unknown user')).toBeInTheDocument()
  })

  it('renders initials from the first two words of the name', () => {
    render(<FriendRow user={makeUser({ name: 'Ada Lovelace' })} />)
    expect(screen.getByText('AL')).toBeInTheDocument()
  })

  it('renders initials from the username when name is null', () => {
    render(<FriendRow user={makeUser({ name: null, username: 'carol' })} />)
    expect(screen.getByText('CA')).toBeInTheDocument()
  })

  it('renders a "?" initial fallback when both name and username are null', () => {
    render(<FriendRow user={makeUser({ name: null, username: null })} />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })

  it('renders children as an action slot', () => {
    render(
      <FriendRow user={makeUser()}>
        <button type="button">Accept</button>
      </FriendRow>,
    )
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument()
  })
})
