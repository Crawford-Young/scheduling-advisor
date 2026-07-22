import { describe, it, expect, vi, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../tests/mocks/server'
import type { GeoPoint, TravelTimeInput } from '../interfaces/travel'

const mockEnv = vi.hoisted(() => ({
  GOOGLE_MAPS_API_KEY: 'test-key' as string | undefined,
}))
vi.mock('@/env', () => ({ env: mockEnv }))

const mockWarn = vi.hoisted(() => vi.fn())
vi.mock('@/lib/logger', () => ({ logger: { warn: mockWarn } }))

import { googleMapsTravelService } from './google-maps'

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json'
const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes'

const origin: GeoPoint = { lat: 40.7128, lng: -74.006 }
const destination: GeoPoint = { lat: 40.73, lng: -73.99 }

beforeEach(() => {
  mockEnv.GOOGLE_MAPS_API_KEY = 'test-key'
  mockWarn.mockClear()
})

describe('googleMapsTravelService.geocode', () => {
  it('returns the first result location on OK and sends address + key query params', async () => {
    let captured: URL | undefined
    server.use(
      http.get(GEOCODE_URL, ({ request }) => {
        captured = new URL(request.url)
        return HttpResponse.json({
          status: 'OK',
          results: [{ geometry: { location: { lat: 40.7, lng: -74.0 } } }],
        })
      }),
    )

    const result = await googleMapsTravelService.geocode('123 Main St, NY')

    expect(result).toEqual({ lat: 40.7, lng: -74.0 })
    expect(captured?.searchParams.get('address')).toBe('123 Main St, NY')
    expect(captured?.searchParams.get('key')).toBe('test-key')
  })

  it('returns null on ZERO_RESULTS', async () => {
    server.use(
      http.get(GEOCODE_URL, () => HttpResponse.json({ status: 'ZERO_RESULTS', results: [] })),
    )
    expect(await googleMapsTravelService.geocode('nowhere')).toBeNull()
  })

  it('returns null and logs a warning on HTTP 500', async () => {
    server.use(http.get(GEOCODE_URL, () => new HttpResponse(null, { status: 500 })))
    expect(await googleMapsTravelService.geocode('boom')).toBeNull()
    expect(mockWarn).toHaveBeenCalled()
  })

  it('returns null and logs a warning when the request itself fails', async () => {
    server.use(http.get(GEOCODE_URL, () => HttpResponse.error()))
    expect(await googleMapsTravelService.geocode('boom')).toBeNull()
    expect(mockWarn).toHaveBeenCalled()
  })

  it('throws when GOOGLE_MAPS_API_KEY is missing', async () => {
    mockEnv.GOOGLE_MAPS_API_KEY = undefined
    await expect(googleMapsTravelService.geocode('123 Main St')).rejects.toThrow(
      'GOOGLE_MAPS_API_KEY is required for the google-maps travel service',
    )
  })
})

describe('googleMapsTravelService.getTravelTime', () => {
  it('computes a route and sends the field mask header + TRAFFIC_UNAWARE body for driving without departureTime', async () => {
    let capturedFieldMask: string | null = null
    let capturedBody: Record<string, unknown> = {}
    server.use(
      http.post(ROUTES_URL, async ({ request }) => {
        capturedFieldMask = request.headers.get('X-Goog-FieldMask')
        capturedBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ routes: [{ duration: '1500s', distanceMeters: 12000 }] })
      }),
    )

    const result = await googleMapsTravelService.getTravelTime({
      origin,
      destination,
      mode: 'driving',
    })

    expect(result).toEqual({ durationMin: 25, distanceMeters: 12000, trafficAware: false })
    expect(capturedFieldMask).toBe('routes.duration,routes.distanceMeters')
    expect(capturedBody.routingPreference).toBe('TRAFFIC_UNAWARE')
    expect(capturedBody.travelMode).toBe('DRIVE')
    expect('departureTime' in capturedBody).toBe(false)
  })

  it('is traffic-aware for driving with a departureTime and sends an ISO departureTime', async () => {
    let capturedBody: Record<string, unknown> = {}
    server.use(
      http.post(ROUTES_URL, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ routes: [{ duration: '1500s', distanceMeters: 12000 }] })
      }),
    )
    const departureTime = new Date('2026-08-01T13:00:00.000Z')

    const input: TravelTimeInput = { origin, destination, mode: 'driving', departureTime }
    const result = await googleMapsTravelService.getTravelTime(input)

    expect(result?.trafficAware).toBe(true)
    expect(capturedBody.routingPreference).toBe('TRAFFIC_AWARE')
    expect(capturedBody.departureTime).toBe('2026-08-01T13:00:00.000Z')
  })

  it('omits routingPreference entirely for non-driving modes', async () => {
    let capturedBody: Record<string, unknown> = {}
    server.use(
      http.post(ROUTES_URL, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ routes: [{ duration: '600s', distanceMeters: 800 }] })
      }),
    )

    await googleMapsTravelService.getTravelTime({ origin, destination, mode: 'walking' })

    expect('routingPreference' in capturedBody).toBe(false)
    expect(capturedBody.travelMode).toBe('WALK')
  })

  it('sends departureTime for transit but stays non-traffic-aware and omits routingPreference', async () => {
    let capturedBody: Record<string, unknown> = {}
    server.use(
      http.post(ROUTES_URL, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ routes: [{ duration: '900s', distanceMeters: 4000 }] })
      }),
    )
    const departureTime = new Date('2026-08-01T13:00:00.000Z')

    const result = await googleMapsTravelService.getTravelTime({
      origin,
      destination,
      mode: 'transit',
      departureTime,
    })

    expect(result?.trafficAware).toBe(false)
    expect('routingPreference' in capturedBody).toBe(false)
    expect(capturedBody.travelMode).toBe('TRANSIT')
    expect(capturedBody.departureTime).toBe('2026-08-01T13:00:00.000Z')
  })

  it('omits departureTime for non-driving, non-transit modes even when one is supplied', async () => {
    let capturedBody: Record<string, unknown> = {}
    server.use(
      http.post(ROUTES_URL, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ routes: [{ duration: '900s', distanceMeters: 4000 }] })
      }),
    )

    await googleMapsTravelService.getTravelTime({
      origin,
      destination,
      mode: 'bicycling',
      departureTime: new Date('2026-08-01T13:00:00.000Z'),
    })

    expect('departureTime' in capturedBody).toBe(false)
    expect(capturedBody.travelMode).toBe('BICYCLE')
  })

  it('returns null when the routes array is empty', async () => {
    server.use(http.post(ROUTES_URL, () => HttpResponse.json({ routes: [] })))
    expect(
      await googleMapsTravelService.getTravelTime({ origin, destination, mode: 'driving' }),
    ).toBeNull()
  })

  it('returns null and logs a warning on HTTP 429', async () => {
    server.use(http.post(ROUTES_URL, () => new HttpResponse(null, { status: 429 })))
    expect(
      await googleMapsTravelService.getTravelTime({ origin, destination, mode: 'driving' }),
    ).toBeNull()
    expect(mockWarn).toHaveBeenCalled()
  })

  it('returns null and logs a warning when the request itself fails', async () => {
    server.use(http.post(ROUTES_URL, () => HttpResponse.error()))
    expect(
      await googleMapsTravelService.getTravelTime({ origin, destination, mode: 'driving' }),
    ).toBeNull()
    expect(mockWarn).toHaveBeenCalled()
  })

  it('throws when GOOGLE_MAPS_API_KEY is missing', async () => {
    mockEnv.GOOGLE_MAPS_API_KEY = undefined
    await expect(
      googleMapsTravelService.getTravelTime({ origin, destination, mode: 'driving' }),
    ).rejects.toThrow('GOOGLE_MAPS_API_KEY is required for the google-maps travel service')
  })
})
