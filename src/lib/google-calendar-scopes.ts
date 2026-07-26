export const GOOGLE_CALENDAR_SCOPES: readonly string[] = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
]

export const BASE_SIGNIN_SCOPE = 'openid email profile'

export const CALENDAR_CONNECT_SCOPE = `${BASE_SIGNIN_SCOPE} ${GOOGLE_CALENDAR_SCOPES.join(' ')}`

function tokens(scope: string | null | undefined): string[] {
  return scope ? scope.split(' ').filter(Boolean) : []
}

export function hasCalendarScopes(scope: string | null | undefined): boolean {
  const present = new Set(tokens(scope))
  return GOOGLE_CALENDAR_SCOPES.every((s) => present.has(s))
}

export function stripCalendarScopes(scope: string | null): string {
  const calendar = new Set(GOOGLE_CALENDAR_SCOPES)
  return tokens(scope)
    .filter((s) => !calendar.has(s))
    .join(' ')
}

export function mergeScopes(existing: string | null, incoming: string | null | undefined): string {
  const merged = tokens(existing)
  const seen = new Set(merged)
  for (const s of tokens(incoming)) {
    if (!seen.has(s)) {
      merged.push(s)
      seen.add(s)
    }
  }
  return merged.join(' ')
}
