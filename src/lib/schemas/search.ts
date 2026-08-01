import { z } from 'zod'

export const SEARCH_QUERY_MIN_LENGTH = 2
export const SEARCH_QUERY_MAX_LENGTH = 100

export const globalSearchSchema = z.object({
  query: z.string().trim().min(SEARCH_QUERY_MIN_LENGTH).max(SEARCH_QUERY_MAX_LENGTH),
  // Caller intent for user search only (the add-friend dialog): drop the
  // viewer's own row server-side. Ignored by the events/activities groups.
  excludeSelf: z.boolean().optional(),
})

export interface EventSearchResult {
  readonly id: string
  readonly title: string
  readonly startAt: Date | null
  readonly location: string | null
}

export interface ActivitySearchResult {
  readonly id: string
  readonly title: string
}

export interface ReflectionSearchResult {
  readonly id: string
  readonly title: string
}

export interface GlobalSearchData {
  readonly events: readonly EventSearchResult[]
  readonly activities: readonly ActivitySearchResult[]
  readonly reflections: readonly ReflectionSearchResult[]
}
