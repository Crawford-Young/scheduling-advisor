'use server'
import * as Sentry from '@sentry/nextjs'
import { auth } from '@/auth'
import { generateEvents } from '@/server/generation'

/**
 * Read-path-safe wrapper: never throws. Mirrors `safeExtendSeries`
 * (`src/server/actions/series-mutations.ts`) so a broken generation sweep
 * cannot crash a calendar/activities page render. Zero-arg by design — the
 * userId is derived from the session HERE, never accepted as an argument, so
 * this 'use server' export (client-callable as a POST endpoint) can never be
 * driven with an attacker-chosen identity. `generateEvents`/
 * `generateEventsForActivity` (`src/server/generation.ts`) are a plain,
 * non-'use server' module for exactly this reason — they are reachable only
 * by import, never as an endpoint.
 */
export async function safeGenerateEvents(): Promise<void> {
  try {
    const session = await auth()
    if (!session?.user?.id) return
    await generateEvents(session.user.id)
  } catch (err) {
    Sentry.captureException(err)
  }
}
