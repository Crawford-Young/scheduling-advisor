import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test',
      AUTH_SECRET: process.env.AUTH_SECRET ?? 'playwright-test-secret-at-least-32-chars-long',
      AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID ?? 'playwright-google-id',
      AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET ?? 'playwright-google-secret',
      UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL ?? 'https://playwright.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN ?? 'playwright-redis-token',
      VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY ?? 'playwright-vapid-private',
      VAPID_EMAIL: process.env.VAPID_EMAIL ?? 'playwright@example.com',
      TRIGGER_API_KEY: process.env.TRIGGER_API_KEY ?? 'playwright-trigger-key',
      NEXT_PUBLIC_TAMBO_API_KEY: process.env.NEXT_PUBLIC_TAMBO_API_KEY ?? 'playwright-tambo-key',
      NEXT_PUBLIC_TAMBO_URL: process.env.NEXT_PUBLIC_TAMBO_URL ?? 'https://playwright.tambo.co',
      NEXT_PUBLIC_VAPID_PUBLIC_KEY:
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? 'playwright-vapid-public',
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    },
  },
})
