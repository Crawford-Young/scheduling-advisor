'use client'
import { z } from 'zod'
import { useMemo } from 'react'

export const weekCalendarViewPropsSchema = z.object({
  weekStart: z.string(),
  events: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      start: z.string(),
      end: z.string(),
      type: z.enum(['calendar', 'task', 'goal', 'habit']),
      streak: z.number().optional(),
      activityType: z.string().optional(),
      visibility: z.string().optional(),
      status: z.string().optional(),
    }),
  ),
})

export type CalendarEvent = z.infer<typeof weekCalendarViewPropsSchema>['events'][number]

export type WeekCalendarViewProps = z.infer<typeof weekCalendarViewPropsSchema> & {
  readonly onEventClick?: (event: CalendarEvent) => void
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOUR_START = 8
const HOUR_COUNT = 14

function getWeekDays(weekStart: string): Date[] {
  const start = new Date(weekStart)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function WeekCalendarView({ weekStart, events, onEventClick }: WeekCalendarViewProps) {
  const days = useMemo(() => getWeekDays(weekStart), [weekStart])

  return (
    <div
      className="bg-card text-card-foreground overflow-auto rounded-md border"
      role="region"
      aria-label="Week calendar"
    >
      <div className="grid grid-cols-[3rem_repeat(7,1fr)] border-b" aria-hidden>
        <div className="border-r" />
        {days.map((day, i) => (
          <div key={i} className="border-r py-2 text-center text-xs font-medium last:border-r-0">
            <div>{DAY_LABELS[i]}</div>
            <div className="text-muted-foreground">{day.getDate()}</div>
          </div>
        ))}
      </div>

      <div className="relative grid grid-cols-[3rem_repeat(7,1fr)]">
        <div className="flex flex-col">
          {Array.from({ length: HOUR_COUNT }, (_, i) => (
            <div
              key={i}
              className="text-muted-foreground flex h-14 items-start justify-end border-r border-b pr-1 text-[10px]"
              aria-hidden
            >
              {((HOUR_START + i) % 12 || 12).toString()}
              {HOUR_START + i < 12 ? 'am' : 'pm'}
            </div>
          ))}
        </div>

        {days.map((day, dayIdx) => {
          const dayEvents = events.filter((e) => isSameDay(new Date(e.start), day))
          return (
            <div key={dayIdx} className="relative border-r last:border-r-0">
              {Array.from({ length: HOUR_COUNT }, (_, i) => (
                <div key={i} className="h-14 border-b" />
              ))}
              {dayEvents.map((evt) => {
                const start = new Date(evt.start)
                const end = new Date(evt.end)
                const top =
                  ((start.getHours() - HOUR_START + start.getMinutes() / 60) / HOUR_COUNT) * 100
                const height = Math.max(
                  ((end.getTime() - start.getTime()) / (HOUR_COUNT * 3600000)) * 100,
                  2,
                )
                return (
                  <div
                    key={evt.id}
                    className={`absolute right-0 left-0 mx-0.5 overflow-hidden rounded px-1 text-[10px] font-medium ${
                      evt.type === 'task'
                        ? 'bg-primary/20 text-primary'
                        : evt.type === 'goal'
                          ? 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400'
                          : evt.type === 'habit'
                            ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                            : 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                    } ${onEventClick ? 'cursor-pointer' : ''}`}
                    style={{ top: `${top}%`, height: `${height}%` }}
                    aria-label={evt.title}
                    role={onEventClick ? 'button' : undefined}
                    tabIndex={onEventClick ? 0 : undefined}
                    onClick={() => onEventClick?.(evt)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') onEventClick?.(evt)
                    }}
                  >
                    {evt.title}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
