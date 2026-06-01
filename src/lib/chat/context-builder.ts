import { getUserTasks } from '@/server/queries/tasks'
import { getUserCheckIns } from '@/server/queries/check-ins'
import { getTokenBalance } from '@/server/queries/tokens'

export async function buildContextBlock(
  userId: string,
  timezone: string,
  now: Date = new Date(),
): Promise<string> {
  const [tasks, checkIns, balance] = await Promise.all([
    getUserTasks(),
    getUserCheckIns(50),
    getTokenBalance(userId),
  ])

  const todayStr = now.toISOString().split('T')[0]

  const monday = new Date(now)
  const day = monday.getDay()
  monday.setDate(now.getDate() - ((day + 6) % 7))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const weekRange = `${monday.toISOString().split('T')[0]} – ${sunday.toISOString().split('T')[0]}`

  const checkInMap = new Map(
    checkIns
      .filter((c) => c.taskId && c.scheduledAt.toISOString().startsWith(todayStr))
      .map((c) => [c.taskId, c.completedAt ? 'done' : c.skippedAt ? 'skipped' : 'pending']),
  )

  const itemLines = tasks
    .map((t) => {
      const status = checkInMap.get(t.id) ?? 'pending'
      const timeStr = t.startAt
        ? ` · ${t.startAt.toISOString().slice(11, 16)} UTC`
        : t.targetDate
          ? ` · due ${t.targetDate.toISOString().split('T')[0]}`
          : ''
      return `  [${t.type}:${t.id}] ${t.title}${timeStr} — ${status}`
    })
    .join('\n')

  return `--- Current Context ---
Date: ${todayStr}
Week: ${weekRange}
Timezone: ${timezone}
Credits remaining: ${balance}

Today's items:
${itemLines || '  (none)'}
--- End Context ---`
}
