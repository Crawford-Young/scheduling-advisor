import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./impl/travel-stub', () => ({
  travelStubService: { geocode: vi.fn(), getTravelTime: vi.fn() },
}))

vi.mock('./impl/google-maps', () => ({
  googleMapsTravelService: { geocode: vi.fn(), getTravelTime: vi.fn() },
}))

import { getTravelService, _resetServices } from './index'

describe('getTravelService', () => {
  beforeEach(() => {
    _resetServices()
    vi.unstubAllEnvs()
  })

  it('returns the stub impl by default', async () => {
    const svc = await getTravelService()
    expect(svc).toBeDefined()
    expect(typeof svc.geocode).toBe('function')
    expect(typeof svc.getTravelTime).toBe('function')
  })

  it('returns the google-maps impl when TRAVEL_SERVICE_IMPL is google-maps', async () => {
    vi.stubEnv('TRAVEL_SERVICE_IMPL', 'google-maps')
    const { googleMapsTravelService } = await import('./impl/google-maps')
    const svc = await getTravelService()
    expect(svc).toBe(googleMapsTravelService)
  })

  it('returns the cached instance on the second call', async () => {
    const svc1 = await getTravelService()
    const svc2 = await getTravelService()
    expect(svc1).toBe(svc2)
  })

  it('throws for an unknown impl', async () => {
    vi.stubEnv('TRAVEL_SERVICE_IMPL', 'unknown')
    await expect(getTravelService()).rejects.toThrow('Unknown TRAVEL_SERVICE_IMPL: unknown')
  })
})
