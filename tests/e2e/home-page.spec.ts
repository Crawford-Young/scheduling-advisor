import { test, expect } from '@playwright/test'

test.describe('Home page', () => {
  test('unauthenticated user redirected to login from /', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated user redirected to login from /calendar', async ({ page }) => {
    await page.goto('/calendar')
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated user redirected to login from /activities', async ({ page }) => {
    await page.goto('/activities')
    await expect(page).toHaveURL(/\/login/)
  })

  // Goals/Habits/Tasks were unified into /activities (Wave 2). These used to
  // assert a redirect to /login, because the auth proxy's catch-all matcher
  // swallowed every unrouted path and a 404 was genuinely unobservable — the
  // assertion was encoding that soft-404 bug as the expected behavior. The
  // AdSense compliance wave narrowed the matcher to an allow-list, so a removed
  // route now reaches Next's own 404 handler and this can assert removal
  // directly instead of standing in for it.
  for (const route of ['/goals', '/habits', '/tasks']) {
    test(`removed route ${route} returns a real 404`, async ({ request }) => {
      expect((await request.get(route)).status()).toBe(404)
    })
  }

  test('unauthenticated user redirected to login from /settings', async ({ page }) => {
    await page.goto('/settings')
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated user redirected to login from /tokens', async ({ page }) => {
    await page.goto('/tokens')
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated user redirected to login from /upgrade', async ({ page }) => {
    await page.goto('/upgrade')
    await expect(page).toHaveURL(/\/login/)
  })

  test('login page shows app name and Google sign-in', async ({ page }) => {
    await page.goto('/login')
    // Heading role, not getByText: the brand splash also renders "Cybond" while
    // the page compiles/loads, and two matches strict-violate.
    await expect(page.getByRole('heading', { name: 'Cybond' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible()
  })

  test('login page has no obvious accessibility violations', async ({ page }) => {
    await page.goto('/login')
    const main = page.locator('main')
    await expect(main).toBeVisible()
    // Ensure no elements with empty alt text on images
    const images = page.locator('img')
    for (const img of await images.all()) {
      const alt = await img.getAttribute('alt')
      expect(alt).not.toBeNull()
    }
  })
})
