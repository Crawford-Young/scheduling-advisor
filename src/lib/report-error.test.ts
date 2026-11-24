import { afterEach, describe, expect, it, vi } from 'vitest'
import { reportError, reportMessage } from './report-error'

describe('report-error', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reportError writes the error itself to stderr, stack included', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('boom')
    reportError(error)
    expect(spy).toHaveBeenCalledWith(error)
  })

  it('reportMessage writes the message as a warning', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    reportMessage('corrupt prefs')
    expect(spy).toHaveBeenCalledWith('corrupt prefs')
  })
})
