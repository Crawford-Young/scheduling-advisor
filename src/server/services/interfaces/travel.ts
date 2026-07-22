export type TravelMode = 'driving' | 'walking' | 'bicycling' | 'transit'

export interface GeoPoint {
  readonly lat: number
  readonly lng: number
}

export interface TravelTimeInput {
  readonly origin: GeoPoint
  readonly destination: GeoPoint
  readonly mode: TravelMode
  readonly departureTime?: Date
}

export interface TravelEstimate {
  readonly durationMin: number
  readonly distanceMeters: number
  readonly trafficAware: boolean
}

export interface TravelService {
  geocode(address: string): Promise<GeoPoint | null>
  getTravelTime(input: TravelTimeInput): Promise<TravelEstimate | null>
}
