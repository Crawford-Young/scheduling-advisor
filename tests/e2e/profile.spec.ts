import { test, expect } from '@playwright/test'

test.describe('Profile pages', () => {
  test('unauthenticated user redirected to login from /u/someone', async ({ page }) => {
    await page.goto('/u/someone')
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated user redirected to login from /feed', async ({ page }) => {
    await page.goto('/feed')
    await expect(page).toHaveURL(/\/login/)
  })
})
