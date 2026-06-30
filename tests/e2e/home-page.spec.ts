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

  // Goals/Habits/Tasks were unified into /activities (Wave 2). The auth proxy
  // redirects every unauthenticated path to /login before routing resolves, so a
  // removed route is indistinguishable from a protected one here (both 200 the
  // login page) — a 404 is unobservable in the deliberately-unauthenticated suite
  // (see AGENTS.md). Removal itself is verified at build/grep level; here we assert
  // the old paths no longer serve their own page and behave like any gated route.
  for (const route of ['/goals', '/habits', '/tasks']) {
    test(`removed route ${route} redirects to login`, async ({ page }) => {
      await page.goto(route)
      await expect(page).toHaveURL(/\/login/)
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
    await expect(page.getByText('Cybond')).toBeVisible()
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
