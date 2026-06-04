'use server'
import { auth } from '@/auth'
import { getTokenBalance } from '@/server/queries/tokens'

export async function getTokenBalanceAction(): Promise<number> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')
  return getTokenBalance(session.user.id)
}
