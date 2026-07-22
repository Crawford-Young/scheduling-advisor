import { describe, it, expect } from 'vitest'
import { placeInputSchema, travelModeSchema, deletePlaceInputSchema } from '@/lib/schemas/place'

describe('placeInputSchema', () => {
  it('accepts a valid name + address with no id (create)', () => {
    const result = placeInputSchema.safeParse({ name: 'Home', address: '1 Main St' })
    expect(result.success).toBe(true)
  })

  it('accepts an id for update', () => {
    const result = placeInputSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Home',
      address: '1 Main St',
    })
    expect(result.success).toBe(true)
  })

  it('trims name and address', () => {
    const result = placeInputSchema.safeParse({ name: '  Home  ', address: '  1 Main St  ' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('Home')
      expect(result.data.address).toBe('1 Main St')
    }
  })

  it('rejects an empty name', () => {
    const result = placeInputSchema.safeParse({ name: '', address: '1 Main St' })
    expect(result.success).toBe(false)
  })

  it('rejects a name over 60 characters', () => {
    const result = placeInputSchema.safeParse({ name: 'a'.repeat(61), address: '1 Main St' })
    expect(result.success).toBe(false)
  })

  it('rejects an empty address', () => {
    const result = placeInputSchema.safeParse({ name: 'Home', address: '' })
    expect(result.success).toBe(false)
  })

  it('rejects an address over 300 characters', () => {
    const result = placeInputSchema.safeParse({ name: 'Home', address: 'a'.repeat(301) })
    expect(result.success).toBe(false)
  })

  it('rejects a missing name', () => {
    const result = placeInputSchema.safeParse({ address: '1 Main St' })
    expect(result.success).toBe(false)
  })

  it('rejects a missing address', () => {
    const result = placeInputSchema.safeParse({ name: 'Home' })
    expect(result.success).toBe(false)
  })
})

describe('travelModeSchema', () => {
  it.each(['driving', 'walking', 'bicycling', 'transit'])('accepts mode %s', (mode) => {
    const result = travelModeSchema.safeParse({ travelMode: mode })
    expect(result.success).toBe(true)
  })

  it('rejects an unknown mode', () => {
    const result = travelModeSchema.safeParse({ travelMode: 'flying' })
    expect(result.success).toBe(false)
  })

  it('rejects a missing travelMode', () => {
    const result = travelModeSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe('deletePlaceInputSchema', () => {
  it('accepts a valid id', () => {
    const result = deletePlaceInputSchema.safeParse({ id: '550e8400-e29b-41d4-a716-446655440000' })
    expect(result.success).toBe(true)
  })

  it('rejects a missing id', () => {
    const result = deletePlaceInputSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects an empty id', () => {
    const result = deletePlaceInputSchema.safeParse({ id: '' })
    expect(result.success).toBe(false)
  })
})
