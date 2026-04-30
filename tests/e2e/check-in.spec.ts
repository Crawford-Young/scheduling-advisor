import { test, expect } from '@playwright/test'

test.describe('Check-in flow', () => {
  test('login page is accessible', async ({ page }) => {
    await page.goto('/login')
    const main = page.locator('main')
    await expect(main).toBeVisible()
    const heading = page.getByRole('heading', { level: 1 })
    await expect(heading).toBeVisible()
  })

  test('unauthenticated user cannot access check-in routes', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })
})
