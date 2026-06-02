import { vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { configureAxe, toHaveNoViolations } from 'jest-axe'
import { expect, beforeAll, afterAll, afterEach } from 'vitest'
import { server } from './mocks/server'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ get: vi.fn(), set: vi.fn() })),
}))

expect.extend(toHaveNoViolations)
configureAxe({ rules: { region: { enabled: false } } })

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
