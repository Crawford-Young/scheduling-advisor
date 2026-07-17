import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ProfileError from './error'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
import * as Sentry from '@sentry/nextjs'

function makeError(): Error & { digest?: string } {
  return Object.assign(new Error('boom'), { digest: 'abc123' })
}

describe('ProfileError', () => {
  it('renders fallback and captures to Sentry', () => {
    const error = makeError()
    render(<ProfileError error={error} reset={() => {}} />)
    expect(screen.getByText('Failed to load profile')).toBeInTheDocument()
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(error)
  })

  it('invokes reset on retry click', async () => {
    const reset = vi.fn()
    render(<ProfileError error={makeError()} reset={reset} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalledOnce()
  })
})
