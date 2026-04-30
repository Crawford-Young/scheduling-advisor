import '@testing-library/jest-dom/vitest'
import { configureAxe, toHaveNoViolations } from 'jest-axe'
import { expect, beforeAll, afterAll, afterEach } from 'vitest'
import { server } from './mocks/server'

expect.extend(toHaveNoViolations)
configureAxe({ rules: { region: { enabled: false } } })

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
