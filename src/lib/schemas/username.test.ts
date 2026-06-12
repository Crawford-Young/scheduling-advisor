import { describe, expect, it } from 'vitest'
import { usernameSchema } from './username'

describe('usernameSchema', () => {
  it('accepts 3-20 char lowercase alphanumeric with underscores', () => {
    expect(usernameSchema.safeParse('crawford_young').success).toBe(true)
    expect(usernameSchema.safeParse('abc').success).toBe(true)
  })
  it('rejects too short, too long, uppercase, symbols', () => {
    expect(usernameSchema.safeParse('ab').success).toBe(false)
    expect(usernameSchema.safeParse('a'.repeat(21)).success).toBe(false)
    expect(usernameSchema.safeParse('Crawford').success).toBe(false)
    expect(usernameSchema.safeParse('craw ford').success).toBe(false)
  })
})
