import { z } from 'zod'

export const sendFriendRequestSchema = z.object({ addresseeId: z.string().uuid() })
export type SendFriendRequestInput = z.infer<typeof sendFriendRequestSchema>

export const friendshipTargetSchema = z.object({ friendshipId: z.string().uuid() })
export type FriendshipTargetInput = z.infer<typeof friendshipTargetSchema>
