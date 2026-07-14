import { describe, expect, it } from 'vitest'
import { PROFILE_BIO_MAX, PROFILE_NAME_MAX, updateProfileSchema } from './profile'

describe('updateProfileSchema', () => {
  it('trims whitespace from name and bio', () => {
    const result = updateProfileSchema.parse({ name: '  Crawford  ', bio: '  hello there  ' })
    expect(result.name).toBe('Crawford')
    expect(result.bio).toBe('hello there')
  })

  it('rejects bio longer than PROFILE_BIO_MAX', () => {
    const result = updateProfileSchema.safeParse({
      name: 'Crawford',
      bio: 'a'.repeat(PROFILE_BIO_MAX + 1),
    })
    expect(result.success).toBe(false)
  })

  it('transforms empty-string bio to null', () => {
    const result = updateProfileSchema.parse({ name: 'Crawford', bio: '' })
    expect(result.bio).toBeNull()
  })

  it('transforms whitespace-only bio to null after trim', () => {
    const result = updateProfileSchema.parse({ name: 'Crawford', bio: '   ' })
    expect(result.bio).toBeNull()
  })

  it('rejects empty name', () => {
    const result = updateProfileSchema.safeParse({ name: '', bio: '' })
    expect(result.success).toBe(false)
  })

  it('rejects name longer than PROFILE_NAME_MAX', () => {
    const result = updateProfileSchema.safeParse({
      name: 'a'.repeat(PROFILE_NAME_MAX + 1),
      bio: '',
    })
    expect(result.success).toBe(false)
  })
})
