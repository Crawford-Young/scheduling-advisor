import { z } from 'zod'
import type { places } from '@/db/schema'

const NAME_MAX = 60
const ADDRESS_MAX = 300

export const placeInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(NAME_MAX),
  address: z.string().trim().min(1).max(ADDRESS_MAX),
})

export type PlaceInput = z.infer<typeof placeInputSchema>

export const travelModeSchema = z.object({
  travelMode: z.enum(['driving', 'walking', 'bicycling', 'transit']),
})

export type TravelModeInput = z.infer<typeof travelModeSchema>

export const deletePlaceInputSchema = z.object({
  id: z.string().min(1),
})

export type DeletePlaceInput = z.infer<typeof deletePlaceInputSchema>

export type PlaceRow = (typeof places)['$inferSelect']
