import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import SettingsError from './error'

function makeError(): Error & { digest?: string } {
  return Object.assign(new Error('boom'), { digest: 'abc123' })
}

describe('SettingsError', () => {
  it('renders fallback', () => {
    const error = makeError()
    render(<SettingsError error={error} reset={() => {}} />)
    expect(screen.getByText('Failed to load settings')).toBeInTheDocument()
  })

  it('invokes reset on retry click', async () => {
    const reset = vi.fn()
    render(<SettingsError error={makeError()} reset={reset} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalledOnce()
  })
})
