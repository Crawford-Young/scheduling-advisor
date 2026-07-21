import { quickModel } from '@/lib/ai'
import type { ModeConfig } from './types'

const QUICK_MAX_STEPS = 2

interface TodayAndWeek {
  readonly today: string
  readonly week: string
}

function todayAndWeek(timezone: string, now: Date = new Date()): TodayAndWeek {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone })
  const today = fmt.format(now)
  const nowInTz = new Date(now.toLocaleString('en-US', { timeZone: timezone }))
  const day = nowInTz.getDay()
  const DAYS_IN_WEEK = 7
  const LAST_WEEKDAY_OFFSET = 6
  const monday = new Date(nowInTz)
  monday.setDate(nowInTz.getDate() - ((day + LAST_WEEKDAY_OFFSET) % DAYS_IN_WEEK))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + LAST_WEEKDAY_OFFSET)
  return { today, week: `${fmt.format(monday)} – ${fmt.format(sunday)}` }
}

const QUICK_SYSTEM = `You are Cybond's quick scheduler. The user states one thing to schedule; you create it — nothing else.

Rules:
1. Resolve relative dates ("a month from now", "next friday at 6pm") against the context block's date and timezone.
2. ALWAYS call proposeAction first showing exactly what you will create; wait for [CONFIRM]. On [DENY] reason: ..., revise and re-propose. proposeAction entityType 'event' — this lane only ever creates events.
3. After [CONFIRM]: one event → createEvent (default duration 60 minutes when none given); several events at once (e.g. "every weekday") → createEvents with one entry per occurrence, each an independent event.
4. One request per conversation. No advice, no reflection, no schedule review. If the request is not a scheduling request, say this input only creates events and stop.
5. Be terse: one short sentence plus the tool call.`

export const quickScheduleMode: ModeConfig = {
  name: 'quick-schedule',
  model: quickModel,
  maxSteps: QUICK_MAX_STEPS,
  historyLimit: 0,
  persisted: false,
  toolNames: ['proposeAction', 'createEvent', 'createEvents'],
  buildSystem: () => QUICK_SYSTEM,
  buildContext: (timezone) => {
    const { today, week } = todayAndWeek(timezone)
    return Promise.resolve(
      `--- Current Context ---\nDate: ${today}\nWeek: ${week}\nTimezone: ${timezone}\n--- End Context ---`,
    )
  },
}
