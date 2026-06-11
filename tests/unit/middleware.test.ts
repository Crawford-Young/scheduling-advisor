import { describe, it, expect } from 'vitest'

describe('middleware matcher', () => {
  it('excludes api/auth routes from protection', () => {
    const excluded = ['/api/auth/callback/google', '/api/auth/signin']
    const matcher = /^(?!\/api\/auth|\/login|\/favicon\.ico|\/_next)(.*)/
    for (const path of excluded) {
      expect(matcher.test(path)).toBe(false)
    }
  })

  it('protects app routes', () => {
    const protected_ = ['/dashboard', '/api/calendar/events']
    const matcher = /^(?!\/api\/auth|\/login|\/favicon\.ico|\/(?:_next|static))(.*)/
    for (const path of protected_) {
      expect(matcher.test(path)).toBe(true)
    }
  })
})
