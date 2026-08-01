import * as React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { UserSearchResult } from '@/server/queries/profile'
import { PersonCard } from './person-card'

vi.mock('@/lib/ui', () => ({
  Card: ({ children, ...rest }: React.ComponentProps<'div'>) => <div {...rest}>{children}</div>,
  CardContent: ({ children, ...rest }: React.ComponentProps<'div'>) => (
    <div {...rest}>{children}</div>
  ),
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

function makeResult(overrides: Partial<UserSearchResult> = {}): UserSearchResult {
  return {
    id: 'user-ada',
    username: 'ada',
    name: 'Ada Lovelace',
    image: null,
    ...overrides,
  }
}

describe('PersonCard', () => {
  it('links to the person’s public profile', () => {
    render(<PersonCard result={makeResult({ username: 'ada' })} />)

    expect(screen.getByRole('link')).toHaveAttribute('href', '/u/ada')
  })

  it('renders the display name and @username when name is present', () => {
    render(<PersonCard result={makeResult({ name: 'Ada Lovelace', username: 'ada' })} />)

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('@ada')).toBeInTheDocument()
  })

  it('falls back the display name to @username when name is null', () => {
    render(<PersonCard result={makeResult({ name: null, username: 'carol' })} />)

    expect(screen.getAllByText('@carol')).toHaveLength(2)
  })

  it('renders initials from the first two words of the name, uppercased', () => {
    render(<PersonCard result={makeResult({ name: 'Ada Lovelace' })} />)

    expect(screen.getByTestId('avatar-fallback')).toHaveTextContent('AL')
  })

  it('falls back to the first two characters of the username, uppercased, when name is null', () => {
    render(<PersonCard result={makeResult({ name: null, username: 'carol' })} />)

    expect(screen.getByTestId('avatar-fallback')).toHaveTextContent('CA')
  })

  it('does not render an avatar image when image is null', () => {
    render(<PersonCard result={makeResult({ image: null })} />)

    expect(screen.queryByTestId('avatar-image')).not.toBeInTheDocument()
  })

  it('renders an avatar image with the given src when image is present', () => {
    render(<PersonCard result={makeResult({ image: 'https://example.com/ada.png' })} />)

    expect(screen.getByTestId('avatar-image')).toHaveAttribute('src', 'https://example.com/ada.png')
  })
})
