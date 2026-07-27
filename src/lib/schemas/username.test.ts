import { describe, expect, it } from 'vitest'
import {
  isReservedUsername,
  RESERVED_USERNAMES,
  sanitizeUsernameInput,
  USERNAME_MIN,
  USERNAME_RENAME_WINDOW_DAYS,
  USERNAME_RENAME_WINDOW_MS,
  usernameSchema,
} from './username'

describe('usernameSchema', () => {
  it('accepts 3-20 char lowercase alphanumeric with underscores', () => {
    expect(usernameSchema.safeParse('crawford_young').success).toBe(true)
    expect(usernameSchema.safeParse('abc').success).toBe(true)
  })
  it('rejects too short, too long, uppercase, symbols', () => {
    expect(usernameSchema.safeParse('ab').success).toBe(false)
    expect(usernameSchema.safeParse('a'.repeat(21)).success).toBe(false)
    expect(usernameSchema.safeParse('Crawford').success).toBe(false)
    expect(usernameSchema.safeParse('craw ford').success).toBe(false)
  })
})

describe('sanitizeUsernameInput', () => {
  it('lowercases uppercase letters', () => {
    expect(sanitizeUsernameInput('Crawford')).toBe('crawford')
  })
  it('strips invalid characters', () => {
    expect(sanitizeUsernameInput('craw ford!')).toBe('crawford')
  })
  it('lowercases and strips mixed input', () => {
    expect(sanitizeUsernameInput('Ada-Lovelace_99')).toBe('adalovelace_99')
  })
  it('slices over-length input to the 20-char max', () => {
    expect(sanitizeUsernameInput('a'.repeat(25))).toBe('a'.repeat(20))
  })
  it('passes already-valid input through unchanged', () => {
    expect(sanitizeUsernameInput('crawford_young')).toBe('crawford_young')
  })
  it('returns an empty string for empty input', () => {
    expect(sanitizeUsernameInput('')).toBe('')
  })
})

describe('isReservedUsername', () => {
  it('matches a reserved name exactly', () => {
    expect(isReservedUsername('admin')).toBe(true)
    expect(isReservedUsername('cybond')).toBe(true)
    expect(isReservedUsername('settings')).toBe(true)
  })

  it('does not match a name that merely contains a reserved word', () => {
    expect(isReservedUsername('adminlover')).toBe(false)
    expect(isReservedUsername('the_admin')).toBe(false)
    expect(isReservedUsername('notarobot')).toBe(false)
  })

  it('carries every entry of the approved list', () => {
    expect(RESERVED_USERNAMES.size).toBe(39)
  })
})

describe('rename window constants', () => {
  it('is 14 days, also expressed in milliseconds', () => {
    expect(USERNAME_RENAME_WINDOW_DAYS).toBe(14)
    expect(USERNAME_RENAME_WINDOW_MS).toBe(14 * 24 * 60 * 60 * 1000)
  })
})

describe('USERNAME_MIN', () => {
  it('is exported so the client can disable Save below the floor', () => {
    expect(USERNAME_MIN).toBe(3)
  })
})
