import { describe, it, expect } from 'vitest'
import { travelStubService } from './travel-stub'
import type { GeoPoint } from '../interfaces/travel'

describe('travelStubService.geocode', () => {
  it('is deterministic: same input yields the same point', async () => {
    const a = await travelStubService.geocode('123 Main St')
    const b = await travelStubService.geocode('123 Main St')
    expect(a).toEqual(b)
    expect(a).not.toBeNull()
  })

  it('is case- and whitespace-insensitive for the same address', async () => {
    const a = await travelStubService.geocode('123 Main St')
    const b = await travelStubService.geocode('  123 MAIN st  ')
    expect(a).toEqual(b)
  })

  it('yields distinct points for distinct inputs', async () => {
    const a = await travelStubService.geocode('123 Main St')
    const b = await travelStubService.geocode('456 Oak Ave')
    expect(a).not.toEqual(b)
  })

  it('returns null for empty string', async () => {
    expect(await travelStubService.geocode('')).toBeNull()
  })

  it('returns null for whitespace-only input', async () => {
    expect(await travelStubService.geocode('   ')).toBeNull()
  })
})

describe('travelStubService.getTravelTime', () => {
  const origin: GeoPoint = { lat: 40.7128, lng: -74.006 }
  const destination: GeoPoint = { lat: 40.73, lng: -73.99 }

  it('returns non-traffic-aware estimates', async () => {
    const est = await travelStubService.getTravelTime({ origin, destination, mode: 'driving' })
    expect(est?.trafficAware).toBe(false)
  })

  it('floors durationMin to at least 1 for identical points', async () => {
    const est = await travelStubService.getTravelTime({
      origin,
      destination: origin,
      mode: 'driving',
    })
    expect(est?.durationMin).toBeGreaterThanOrEqual(1)
  })

  it('makes walking slower than driving for the same pair', async () => {
    const driving = await travelStubService.getTravelTime({ origin, destination, mode: 'driving' })
    const walking = await travelStubService.getTravelTime({ origin, destination, mode: 'walking' })
    expect(walking!.durationMin).toBeGreaterThan(driving!.durationMin)
  })

  it('reports distance in meters as a non-negative integer', async () => {
    const est = await travelStubService.getTravelTime({ origin, destination, mode: 'driving' })
    expect(est?.distanceMeters).toBeGreaterThanOrEqual(0)
    expect(Number.isInteger(est?.distanceMeters)).toBe(true)
  })
})
