import { describe, it, expect } from 'vitest'
import {
  GOOGLE_CALENDAR_SCOPES,
  CALENDAR_CONNECT_SCOPE,
  hasCalendarScopes,
  stripCalendarScopes,
  mergeScopes,
} from '@/lib/google-calendar-scopes'

const EVENTS = 'https://www.googleapis.com/auth/calendar.events'
const FREEBUSY = 'https://www.googleapis.com/auth/calendar.freebusy'

describe('google-calendar-scopes', () => {
  it('connect scope contains base + both calendar scopes', () => {
    for (const s of ['openid', 'email', 'profile', EVENTS, FREEBUSY]) {
      expect(CALENDAR_CONNECT_SCOPE.split(' ')).toContain(s)
    }
  })
  it('hasCalendarScopes requires ALL calendar scopes', () => {
    expect(hasCalendarScopes(`openid ${EVENTS} ${FREEBUSY}`)).toBe(true)
    expect(hasCalendarScopes(`openid ${EVENTS}`)).toBe(false)
    expect(hasCalendarScopes(null)).toBe(false)
    expect(hasCalendarScopes(undefined)).toBe(false)
  })
  it('stripCalendarScopes removes only calendar scopes, keeps order', () => {
    expect(stripCalendarScopes(`openid email ${EVENTS} profile ${FREEBUSY}`)).toBe(
      'openid email profile',
    )
    expect(stripCalendarScopes(null)).toBe('')
  })
  it('mergeScopes unions with existing order first', () => {
    expect(mergeScopes('openid email', `email profile ${EVENTS}`)).toBe(
      `openid email profile ${EVENTS}`,
    )
    expect(mergeScopes(null, 'openid')).toBe('openid')
    expect(mergeScopes('openid', null)).toBe('openid')
    expect(mergeScopes('openid', undefined)).toBe('openid')
  })
  it('exports both scopes', () => {
    expect(GOOGLE_CALENDAR_SCOPES).toEqual([EVENTS, FREEBUSY])
  })
})
