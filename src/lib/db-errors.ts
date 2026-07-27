// Postgres SQLSTATE 23505 = unique_violation.
//
// Shape verified against the INSTALLED stack (username-w1 T3), not memory:
//   - @neondatabase/serverless 1.x throws `NeonDbError` with a public
//     `code: string | undefined` — index.d.ts:795-813.
//   - drizzle-orm 0.45.2 catches every driver error in
//     PgPreparedQuery.queryWithCache and re-throws
//     `new DrizzleQueryError(queryString, params, e)` — pg-core/session.js:36-98;
//     that class assigns the driver error to `cause` — errors.js:10-20.
//   - The neon-http UPDATE path carries no `fields` (no .returning()), so it
//     routes through queryWithCache — neon-http/session.js:33-42.
// Both the bare driver error and the wrapped error are therefore matched. A
// bare `error.code === '23505'` check would never fire in this stack.
const UNIQUE_VIOLATION = '23505'

function sqlStateOf(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { code } = value as { readonly code?: unknown }
  return typeof code === 'string' ? code : undefined
}

export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  if (sqlStateOf(error) === UNIQUE_VIOLATION) return true
  return sqlStateOf((error as { readonly cause?: unknown }).cause) === UNIQUE_VIOLATION
}
