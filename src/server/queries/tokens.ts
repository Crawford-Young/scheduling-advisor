import { db } from '@/db'
import { tokenLedger } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'

export async function getTokenBalance(userId: string): Promise<number> {
  const [row] = await db
    .select({ balance: sql<number>`COALESCE(SUM(${tokenLedger.amount}), 0)` })
    .from(tokenLedger)
    .where(eq(tokenLedger.userId, userId))
  return Number(row?.balance) || 0
}

export async function deductTokens(userId: string, totalTokens: number): Promise<void> {
  const credits = Math.ceil(totalTokens / 1000)
  await db.insert(tokenLedger).values({ userId, type: 'usage', amount: -credits })
}
