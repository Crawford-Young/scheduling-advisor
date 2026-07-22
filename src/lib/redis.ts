import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'
import { env } from '@/env'

export const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
})

export const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '10 s'),
  analytics: true,
})

// keep limit in sync with DAILY_ROUTES_LIMIT in src/server/travel.ts (no
// import — avoids module cycle)
export const travelRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(200, '1 d'),
  analytics: true,
  prefix: 'ratelimit:travel',
})
