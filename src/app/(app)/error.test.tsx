import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import AppShellError from './error'

function makeError(): Error & { digest?: string } {
  return Object.assign(new Error('boom'), { digest: 'abc123' })
}

describe('AppShellError', () => {
  it('renders fallback', () => {
    const error = makeError()
    render(<AppShellError error={error} reset={() => {}} />)
    expect(screen.getByText('Failed to load this page')).toBeInTheDocument()
  })

  it('invokes reset on retry click', async () => {
    const reset = vi.fn()
    render(<AppShellError error={makeError()} reset={reset} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalledOnce()
  })
})
