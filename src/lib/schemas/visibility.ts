import { z } from 'zod'

// Per-event/series read-visibility (Profile v2, wave visibility): who can see
// an occurrence when it surfaces on someone else's profile view.
export const visibilitySchema = z.enum(['public', 'friends', 'busy', 'private'])
export type Visibility = z.infer<typeof visibilitySchema>
