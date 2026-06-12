import { db } from '@/db'
import { tokenLedger } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'

export interface LedgerEntry {
  readonly id: string
  readonly type: 'monthly_grant' | 'purchase' | 'usage'
  readonly amount: number
  readonly createdAt: Date
}

export async function getTokenLedger(userId: string, limit = 50): Promise<LedgerEntry[]> {
  const rows = await db
    .select()
    .from(tokenLedger)
    .where(eq(tokenLedger.userId, userId))
    .orderBy(desc(tokenLedger.createdAt))
    .limit(limit)

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    amount: row.amount,
    createdAt: row.createdAt,
  }))
}
