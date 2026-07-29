import { USERNAME_RENAME_WINDOW_MS } from '@/lib/schemas/username'

export interface RenameGateInput {
  /** The caller's CURRENT stored username. `null` = they have never set one. */
  readonly currentUsername: string | null
  /** `users.lastUsernameChangeAt`. `null` on rows predating username-w1. */
  readonly lastChangeAt: Date | null
  readonly now: Date
}

/**
 * ONE-CHANGE-GRACE rule (user decision 2026-07-28, replacing the STRICT rule
 * approved 2026-07-27): the first-ever set does not stamp
 * `users.lastUsernameChangeAt`, so the caller gets exactly one free correction
 * of the name they just picked. That second write stamps, and every write after
 * it waits out the full window measured from the previous stamp.
 *
 * This predicate is unchanged between the two rules — a null `lastChangeAt`
 * reads as "no recorded prior change" and does not block, which is what makes
 * both the grace case and the pre-migration backfill case work. The rule lives
 * in the stamp expression in `setUsername`, not here.
 */
export function isRenameBlocked(input: RenameGateInput): boolean {
  const { currentUsername, lastChangeAt, now } = input
  if (currentUsername === null) return false
  if (lastChangeAt === null) return false
  return now.getTime() - lastChangeAt.getTime() < USERNAME_RENAME_WINDOW_MS
}
