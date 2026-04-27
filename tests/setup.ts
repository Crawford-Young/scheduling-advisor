import '@testing-library/jest-dom/vitest'
import { configureAxe, toHaveNoViolations } from 'jest-axe'
import { expect } from 'vitest'

expect.extend(toHaveNoViolations)
configureAxe({ rules: { region: { enabled: false } } })
