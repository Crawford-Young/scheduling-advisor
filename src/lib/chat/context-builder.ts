import { auth } from '@/auth'
import { getUserTasks } from '@/server/queries/tasks'
import { getUserCheckIns } from '@/server/queries/check-ins'
import { getTokenBalance } from '@/server/queries/tokens'

export async function buildContextBlock(timezone: string, now: Date = new Date()): Promise<string> {
  const session = await auth()
  const userId = session?.user?.id ?? ''

  const [tasks, checkIns, balance] = await Promise.all([
    getUserTasks(),
    getUserCheckIns(50),
    getTokenBalance(userId),
  ])

  // Use Intl to get today's date in the user's timezone
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone })
  const todayStr = formatter.format(now) // returns YYYY-MM-DD format

  // Compute week bounds in user's timezone
  const nowInTz = new Date(now.toLocaleString('en-US', { timeZone: timezone }))
  const day = nowInTz.getDay()
  const mondayInTz = new Date(nowInTz)
  mondayInTz.setDate(nowInTz.getDate() - ((day + 6) % 7))
  const sundayInTz = new Date(mondayInTz)
  sundayInTz.setDate(mondayInTz.getDate() + 6)
  const mondayStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(mondayInTz)
  const sundayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(sundayInTz)
  const weekRange = `${mondayStr} – ${sundayFmt}`

  const checkInMap = new Map(
    checkIns
      .filter((c) => {
        if (!c.taskId) return false
        const ciDate = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(
          c.scheduledAt,
        )
        return ciDate === todayStr
      })
      .map((c) => [c.taskId, c.completedAt ? 'done' : c.skippedAt ? 'skipped' : 'pending']),
  )

  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const itemLines = tasks
    .filter((t) => {
      if (t.startAt) return formatter.format(t.startAt) === todayStr
      if (t.targetDate) return formatter.format(t.targetDate) === todayStr
      return true // dateless backlog items stay visible
    })
    .map((t) => {
      const status = checkInMap.get(t.id) ?? 'pending'
      const timeStr = t.startAt
        ? ` · ${timeFormatter.format(t.startAt)}`
        : t.targetDate
          ? ` · due ${formatter.format(t.targetDate)}`
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
