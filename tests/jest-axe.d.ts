import 'vitest'

// jest-axe ships no types and `@types/jest-axe` only augments Jest's own
// `jest.Matchers` / `@jest/expect`. vitest 5 dropped the `jest.Matchers` bridge
// its assertions used to inherit from, so the matcher registered in
// `tests/setup.ts` (`expect.extend(toHaveNoViolations)`) is typed here, on the
// `Matchers` interface vitest documents for custom matchers. The type
// parameters must stay identical to vitest's own declaration, which is why `T`
// is declared here without being used.
declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- must mirror vitest's signature
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> {
    toHaveNoViolations(): R
  }
}
