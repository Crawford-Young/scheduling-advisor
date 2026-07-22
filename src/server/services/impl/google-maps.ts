import { env } from '@/env'
import { logger } from '@/lib/logger'
import type { GeoPoint, TravelEstimate, TravelService, TravelTimeInput } from '../interfaces/travel'

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json'
const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes'
const ROUTES_FIELD_MASK = 'routes.duration,routes.distanceMeters'
const SECONDS_PER_MINUTE = 60
const MIN_DURATION_MIN = 1

const API_MODE: Record<TravelTimeInput['mode'], string> = {
  driving: 'DRIVE',
  walking: 'WALK',
  bicycling: 'BICYCLE',
  transit: 'TRANSIT',
}

function apiKey(): string {
  if (!env.GOOGLE_MAPS_API_KEY) {
    throw new Error('GOOGLE_MAPS_API_KEY is required for the google-maps travel service')
  }
  return env.GOOGLE_MAPS_API_KEY
}

export const googleMapsTravelService: TravelService = {
  async geocode(address: string): Promise<GeoPoint | null> {
    const key = apiKey()
    try {
      const url = `${GEOCODE_URL}?address=${encodeURIComponent(address)}&key=${key}`
      const res = await fetch(url)
      if (!res.ok) {
        logger.warn({ status: res.status }, 'Geocoding API HTTP error')
        return null
      }
      const data = (await res.json()) as {
        status: string
        results: Array<{ geometry: { location: { lat: number; lng: number } } }>
      }
      const first = data.results[0]
      if (data.status !== 'OK' || !first) return null
      return { lat: first.geometry.location.lat, lng: first.geometry.location.lng }
    } catch (err) {
      logger.warn({ err }, 'Geocoding request failed')
      return null
    }
  },
  async getTravelTime(input: TravelTimeInput): Promise<TravelEstimate | null> {
    const key = apiKey()
    const trafficAware = input.mode === 'driving' && input.departureTime !== undefined
    try {
      const res = await fetch(ROUTES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': ROUTES_FIELD_MASK,
        },
        body: JSON.stringify({
          origin: {
            location: { latLng: { latitude: input.origin.lat, longitude: input.origin.lng } },
          },
          destination: {
            location: {
              latLng: { latitude: input.destination.lat, longitude: input.destination.lng },
            },
          },
          travelMode: API_MODE[input.mode],
          ...(input.mode === 'driving'
            ? { routingPreference: trafficAware ? 'TRAFFIC_AWARE' : 'TRAFFIC_UNAWARE' }
            : {}),
          ...(input.departureTime && (input.mode === 'driving' || input.mode === 'transit')
            ? { departureTime: input.departureTime.toISOString() }
            : {}),
        }),
      })
      if (!res.ok) {
        logger.warn({ status: res.status }, 'Routes API HTTP error')
        return null
      }
      const data = (await res.json()) as {
        routes?: Array<{ duration: string; distanceMeters: number }>
      }
      const route = data.routes?.[0]
      if (!route) return null
      const seconds = Number.parseInt(route.duration, 10)
      return {
        durationMin: Math.max(MIN_DURATION_MIN, Math.round(seconds / SECONDS_PER_MINUTE)),
        distanceMeters: route.distanceMeters,
        trafficAware,
      }
    } catch (err) {
      logger.warn({ err }, 'Routes request failed')
      return null
    }
  },
}
