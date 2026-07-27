import { describe, expect, it } from 'vitest'
import { mapUsernameError, USERNAME_ERROR_FALLBACK } from '@/lib/username-errors'
import { usernameSchema } from '@/lib/schemas/username'

describe('mapUsernameError', () => {
  it('maps the rate-limit error', () => {
    expect(mapUsernameError('Too many requests')).toBe(
      'Too many attempts — wait a moment and try again.',
    )
  })

  it('maps the shared unavailable error used by reserved and taken alike', () => {
    expect(mapUsernameError('Username unavailable')).toBe(
      "That username isn't available. Try another.",
    )
  })

  it('maps the rename-limit error', () => {
    expect(mapUsernameError('Rename limit reached')).toBe(
      'You can only change your username once every 14 days.',
    )
  })

  it('maps a real flattened zod error to the format copy', () => {
    const flattened = usernameSchema.safeParse('ab').error?.flatten()
    expect(mapUsernameError(flattened)).toBe(
      '3–20 characters: lowercase letters, numbers, underscores only.',
    )
  })

  it('falls back for Unauthorized, which the user never sees', () => {
    expect(mapUsernameError('Unauthorized')).toBe(USERNAME_ERROR_FALLBACK)
  })

  it('falls back for a null error value', () => {
    expect(mapUsernameError(null)).toBe(USERNAME_ERROR_FALLBACK)
  })

  it('falls back for an object that is not a flattened zod error', () => {
    expect(mapUsernameError({ boom: true })).toBe(USERNAME_ERROR_FALLBACK)
  })

  it('exposes the fallback copy for the client catch path', () => {
    expect(USERNAME_ERROR_FALLBACK).toBe('Could not save username — try again.')
  })
})
