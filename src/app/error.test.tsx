import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import RootError from './error'

function makeError(): Error & { digest?: string } {
  return Object.assign(new Error('boom'), { digest: 'abc123' })
}

describe('RootError', () => {
  it('renders fallback', () => {
    const error = makeError()
    render(<RootError error={error} reset={() => {}} />)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('invokes reset on retry click', async () => {
    const reset = vi.fn()
    render(<RootError error={makeError()} reset={reset} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalledOnce()
  })
})
