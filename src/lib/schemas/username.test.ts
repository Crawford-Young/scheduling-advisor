import { describe, expect, it } from 'vitest'
import { sanitizeUsernameInput, usernameSchema } from './username'

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
