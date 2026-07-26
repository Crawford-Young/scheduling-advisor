import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindFirst = vi.hoisted(() => vi.fn())
vi.mock('@/db', () => ({ db: { query: { accounts: { findFirst: mockFindFirst } } } }))

import { getCalendarConnection } from '@/server/queries/google-calendar-connection'

const FULL_SCOPE =
  'openid email profile https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy'

describe('getCalendarConnection', () => {
  beforeEach(() => vi.clearAllMocks())

  it('connected when refresh token + all calendar scopes present', async () => {
    mockFindFirst.mockResolvedValue({ refresh_token: 'v1:x', scope: FULL_SCOPE })
    expect(await getCalendarConnection('u1')).toBe('connected')
  })
  it('not_connected when refresh token missing', async () => {
    mockFindFirst.mockResolvedValue({ refresh_token: null, scope: FULL_SCOPE })
    expect(await getCalendarConnection('u1')).toBe('not_connected')
  })
  it('not_connected when a calendar scope missing', async () => {
    mockFindFirst.mockResolvedValue({ refresh_token: 'v1:x', scope: 'openid email profile' })
    expect(await getCalendarConnection('u1')).toBe('not_connected')
  })
  it('not_connected when no google account row', async () => {
    mockFindFirst.mockResolvedValue(undefined)
    expect(await getCalendarConnection('u1')).toBe('not_connected')
  })
})
