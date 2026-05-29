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

  test('unauthenticated user redirected to login from /goals', async ({ page }) => {
    await page.goto('/goals')
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated user redirected to login from /habits', async ({ page }) => {
    await page.goto('/habits')
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated user redirected to login from /settings', async ({ page }) => {
    await page.goto('/settings')
    await expect(page).toHaveURL(/\/login/)
  })

  test('login page shows app name and Google sign-in', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByText('CyRein')).toBeVisible()
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
