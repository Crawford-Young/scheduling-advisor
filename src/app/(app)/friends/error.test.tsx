import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import FriendsError from './error'

function makeError(): Error & { digest?: string } {
  return Object.assign(new Error('boom'), { digest: 'abc123' })
}

describe('FriendsError', () => {
  it('renders fallback', () => {
    const error = makeError()
    render(<FriendsError error={error} reset={() => {}} />)
    expect(screen.getByText('Failed to load friends')).toBeInTheDocument()
  })

  it('invokes reset on retry click', async () => {
    const reset = vi.fn()
    render(<FriendsError error={makeError()} reset={reset} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalledOnce()
  })
})
