import type { GeoPoint, TravelEstimate, TravelService, TravelTimeInput } from '../interfaces/travel'

const MODE_SPEED_KMH: Record<TravelTimeInput['mode'], number> = {
  driving: 40,
  walking: 5,
  bicycling: 15,
  transit: 25,
}
const EARTH_RADIUS_KM = 6371
const BASE_LAT = 40
const BASE_LNG = -74
const HASH_SPREAD_DEG = 0.5
const HASH_MODULO = 1000
const HASH_SHIFT = 10
const HASH_MULTIPLIER = 31
const DEGREES_PER_HALF_CIRCLE = 180
const MINUTES_PER_HOUR = 60
const METERS_PER_KM = 1000
const MIN_DURATION_MIN = 1

function hashString(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash * HASH_MULTIPLIER + input.charCodeAt(i)) | 0
  }
  return hash
}

function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number): number => (deg * Math.PI) / DEGREES_PER_HALF_CIRCLE
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

export const travelStubService: TravelService = {
  async geocode(address: string): Promise<GeoPoint | null> {
    if (!address.trim()) return null
    const h = hashString(address.trim().toLowerCase())
    return {
      lat: BASE_LAT + ((h % HASH_MODULO) / HASH_MODULO) * HASH_SPREAD_DEG,
      lng: BASE_LNG + (((h >> HASH_SHIFT) % HASH_MODULO) / HASH_MODULO) * HASH_SPREAD_DEG,
    }
  },
  async getTravelTime(input: TravelTimeInput): Promise<TravelEstimate | null> {
    const km = haversineKm(input.origin, input.destination)
    const speed = MODE_SPEED_KMH[input.mode]
    return {
      durationMin: Math.max(MIN_DURATION_MIN, Math.round((km / speed) * MINUTES_PER_HOUR)),
      distanceMeters: Math.round(km * METERS_PER_KM),
      trafficAware: false,
    }
  },
}
