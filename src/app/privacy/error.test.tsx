import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import PrivacyError from './error'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
import * as Sentry from '@sentry/nextjs'

function makeError(): Error & { digest?: string } {
  return Object.assign(new Error('boom'), { digest: 'abc123' })
}

describe('PrivacyError', () => {
  it('renders fallback and captures to Sentry', () => {
    const error = makeError()
    render(<PrivacyError error={error} reset={() => {}} />)
    expect(screen.getByText('Failed to load privacy')).toBeInTheDocument()
    expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledWith(error)
  })

  it('invokes reset on retry click', async () => {
    const reset = vi.fn()
    render(<PrivacyError error={makeError()} reset={reset} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalledOnce()
  })
})
