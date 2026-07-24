import { describe, it, expect } from 'vitest'
import { visibilitySchema } from '@/lib/schemas/visibility'

describe('visibilitySchema', () => {
  it.each(['public', 'busy', 'private'] as const)('accepts "%s"', (value) => {
    const r = visibilitySchema.safeParse(value)
    expect(r.success).toBe(true)
  })

  it('rejects an unknown value', () => {
    const r = visibilitySchema.safeParse('secret')
    expect(r.success).toBe(false)
  })

  it('rejects a non-string value', () => {
    const r = visibilitySchema.safeParse(42)
    expect(r.success).toBe(false)
  })
})
