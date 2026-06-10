import { test, expect } from '@playwright/test'

test.describe('Onboarding flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('/api/calendar/events*', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ event: { id: 'new-evt', title: 'Run 5k' } }),
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          events: [
            {
              id: 'standup',
              title: 'Team standup',
              start: new Date().toISOString(),
              end: new Date(Date.now() + 30 * 60000).toISOString(),
              calendarId: 'primary',
            },
          ],
        }),
      })
    })

    await page.route('/api/calendar/free-slots*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slots: [
            {
              start: new Date(Date.now() + 24 * 3600000).toISOString(),
              end: new Date(Date.now() + 25 * 3600000).toISOString(),
              durationMinutes: 60,
            },
          ],
        }),
      }),
    )
  })

  test('login page renders and has Google sign-in button', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Cybond' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible()
  })

  test('unauthenticated user redirected to login from /', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })
})
