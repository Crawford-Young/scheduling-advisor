import { describe, it, expect } from 'vitest'
import { globalSearchSchema, SEARCH_QUERY_MIN_LENGTH } from '@/lib/schemas/search'

describe('globalSearchSchema', () => {
  it('accepts a valid query and trims it', () => {
    const parsed = globalSearchSchema.safeParse({ query: '  dinner  ' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.query).toBe('dinner')
  })

  it('rejects a query shorter than the minimum after trimming', () => {
    expect(globalSearchSchema.safeParse({ query: ' a ' }).success).toBe(false)
    expect(SEARCH_QUERY_MIN_LENGTH).toBe(2)
  })

  it('rejects a query longer than 100 characters', () => {
    expect(globalSearchSchema.safeParse({ query: 'x'.repeat(101) }).success).toBe(false)
  })
})
