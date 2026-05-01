import { describe, it, expect, vi } from 'vitest'

vi.mock('@/env', () => ({
  env: {
    ENCRYPTION_KEY: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  },
}))

import { encrypt, decrypt } from '@/lib/encryption'

describe('encrypt', () => {
  it('returns a colon-separated iv:authTag:ciphertext string', () => {
    const result = encrypt('sk-ant-test')
    const parts = result.split(':')
    expect(parts).toHaveLength(3)
    expect(parts[0]).toMatch(/^[0-9a-f]+$/)
    expect(parts[1]).toMatch(/^[0-9a-f]+$/)
    expect(parts[2]).toMatch(/^[0-9a-f]+$/)
  })

  it('produces a different ciphertext each call (random IV)', () => {
    const a = encrypt('same-input')
    const b = encrypt('same-input')
    expect(a).not.toBe(b)
  })
})

describe('decrypt', () => {
  it('recovers the original plaintext', () => {
    const plaintext = 'sk-ant-api01-real-key-here'
    expect(decrypt(encrypt(plaintext))).toBe(plaintext)
  })

  it('throws when ciphertext is malformed (missing colons)', () => {
    expect(() => decrypt('bad-format')).toThrow('Invalid ciphertext format')
  })

  it('throws when the ciphertext is tampered (auth tag mismatch)', () => {
    const encrypted = encrypt('secret')
    const parts = encrypted.split(':')
    const tampered = [parts[0], parts[1], 'deadbeefdeadbeef'].join(':')
    expect(() => decrypt(tampered)).toThrow()
  })
})
