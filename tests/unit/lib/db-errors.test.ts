import { describe, expect, it } from 'vitest'
import { DrizzleQueryError } from 'drizzle-orm/errors'
import { NeonDbError } from '@neondatabase/serverless'
import { isUniqueViolation } from '@/lib/db-errors'

describe('isUniqueViolation', () => {
  it('matches the real DrizzleQueryError(NeonDbError) the UPDATE path throws', () => {
    const driverError = new NeonDbError('duplicate key value violates unique constraint')
    driverError.code = '23505'
    const thrown = new DrizzleQueryError('update "users" set "username" = $1', [], driverError)
    expect(isUniqueViolation(thrown)).toBe(true)
  })

  it('matches a bare driver error carrying the SQLSTATE', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true)
  })

  it('does not match a different SQLSTATE on the cause', () => {
    expect(isUniqueViolation({ cause: { code: '23503' } })).toBe(false)
  })

  it('does not match an error with no cause', () => {
    expect(isUniqueViolation(new Error('connection lost'))).toBe(false)
  })

  it('does not match when the cause is null', () => {
    expect(isUniqueViolation({ cause: null })).toBe(false)
  })

  it('does not match a numeric code', () => {
    expect(isUniqueViolation({ code: 23505 })).toBe(false)
  })

  it('does not match a non-object error', () => {
    expect(isUniqueViolation('23505')).toBe(false)
  })

  it('does not match null', () => {
    expect(isUniqueViolation(null)).toBe(false)
  })
})
