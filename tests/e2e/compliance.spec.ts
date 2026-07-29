import { test, expect } from '@playwright/test'

import { SITE_URL } from '@/lib/site-routes'

const PUBLISHER_LINE = 'google.com, pub-4628379278051632, DIRECT, f08c47fec0942fa0'

test('ads.txt serves the publisher line as plain text', async ({ request }) => {
  const response = await request.get('/ads.txt')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('text/plain')
  expect(await response.text()).toContain(PUBLISHER_LINE)
})

test('robots.txt is served and references the sitemap', async ({ request }) => {
  const response = await request.get('/robots.txt')
  expect(response.status()).toBe(200)
  expect(await response.text()).toContain('Sitemap:')
})

test('robots.txt keeps crawlers out of the authenticated app', async ({ request }) => {
  const body = await (await request.get('/robots.txt')).text()
  for (const segment of ['/calendar', '/settings', '/api/']) {
    expect(body).toContain(`Disallow: ${segment}`)
  }
})

test('sitemap.xml is served and lists the privacy page', async ({ request }) => {
  const response = await request.get('/sitemap.xml')
  expect(response.status()).toBe(200)
  expect(await response.text()).toContain('/privacy')
})

test('sitemap.xml never advertises an authenticated route', async ({ request }) => {
  const body = await (await request.get('/sitemap.xml')).text()
  expect(body).not.toContain('/calendar')
  expect(body).not.toContain(`<loc>${SITE_URL}/</loc>`)
})

test('privacy page is reachable', async ({ page }) => {
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { name: /privacy policy/i, level: 1 })).toBeVisible()
})

test('terms page is reachable', async ({ page }) => {
  await page.goto('/terms')
  await expect(page.getByRole('heading', { name: /terms of service/i, level: 1 })).toBeVisible()
})

// The policy pages must be reachable by following links, not only by typing the
// URL — AdSense review crawls the live site. /login is the only page a
// signed-out visitor can reach, so it is the only place these links can live
// until W5 makes / a public landing page.
test('the policy pages are reachable from the login page', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('link', { name: 'Privacy', exact: true }).click()
  await expect(page).toHaveURL('/privacy')

  await page.goto('/login')
  await page.getByRole('link', { name: 'Terms', exact: true }).click()
  await expect(page).toHaveURL('/terms')
})

// The two regression guards for the narrowed proxy matcher. Before it, every
// path returned HTTP 200 and served the app shell — an infinite soft-404
// surface, and no reachable ads.txt. This test fails if a future wave widens
// the matcher back into a catch-all.
test('unknown paths return a real 404 status', async ({ request }) => {
  expect((await request.get('/definitely-not-a-real-page')).status()).toBe(404)
})

// ...and this one fails if it is narrowed so far that authenticated surfaces leak.
test('protected routes still redirect to login', async ({ page }) => {
  await page.goto('/calendar')
  await expect(page).toHaveURL(/\/login/)
})
