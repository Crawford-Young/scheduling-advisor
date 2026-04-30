import * as Sentry from '@sentry/nextjs'
import { env } from '@/env'

Sentry.init({
  dsn: env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  debug: false,
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  integrations: [Sentry.replayIntegration()],
})
