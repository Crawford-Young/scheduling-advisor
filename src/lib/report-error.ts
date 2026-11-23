/**
 * The one seam for errors that are handled (reported, then swallowed) rather
 * than thrown. Sentry was dropped ahead of the GCP move.
 *
 * Deliberately console-based, not the Pino logger: `calendar-windows.ts` also
 * reaches the client bundle (settings-form imports a constant from it), and
 * Pino's dev transport is server-only. On Cloud Run, stderr lands in Cloud
 * Logging at ERROR severity, and Error Reporting picks up the stack trace.
 * When the migration picks a reporting client, wire it in here.
 */
export function reportError(error: unknown): void {
  // eslint-disable-next-line no-console -- the reporting seam; see above
  console.error(error)
}

/** A handled, non-exceptional problem worth surfacing (e.g. corrupt stored prefs). */
export function reportMessage(message: string): void {
  // eslint-disable-next-line no-console -- the reporting seam; see above
  console.warn(message)
}
