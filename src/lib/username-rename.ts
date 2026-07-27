import { USERNAME_RENAME_WINDOW_MS } from '@/lib/schemas/username'

export interface RenameGateInput {
  /** The caller's CURRENT stored username. `null` = they have never set one. */
  readonly currentUsername: string | null
  /** `users.lastUsernameChangeAt`. `null` on rows predating username-w1. */
  readonly lastChangeAt: Date | null
  readonly now: Date
}

/**
 * STRICT rule (approved 2026-07-27): the first-ever set is free, and every
 * later write waits out the full window measured from the previous stamp — a
 * typo fixed moments after the first set is not exempt.
 *
 * A null `lastChangeAt` on a user who ALREADY has a username is the
 * pre-migration backfill case. It reads as "no recorded prior change", so that
 * user gets exactly ONE un-gated rename; that write stamps the column and puts
 * them on the normal clock from then on. Neither "blocked forever" nor "always
 * free" — this is a deliberate plan decision, not an accident of null handling.
 *
 * PENDING USER DECISION: the onboarding wave argues for a one-change grace
 * (don't stamp until the SECOND successful write). If approved, the change is
 * confined to this file, its test file, and the labelled stamp expression in
 * `setUsername` — nothing else.
 */
export function isRenameBlocked(input: RenameGateInput): boolean {
  const { currentUsername, lastChangeAt, now } = input
  if (currentUsername === null) return false
  if (lastChangeAt === null) return false
  return now.getTime() - lastChangeAt.getTime() < USERNAME_RENAME_WINDOW_MS
}
