'use client'
import { TamboProvider as BaseTamboProvider, defineTool } from '@tambo-ai/react'
import type { TamboComponent } from '@tambo-ai/react'
import { z } from 'zod'
import { env } from '@/env'
import type { ReactNode } from 'react'
import { TaskCard, taskCardPropsSchema } from '@/components/cards/task-card'
import { HabitCard, habitCardPropsSchema } from '@/components/cards/habit-card'
import { GoalCard, goalCardPropsSchema } from '@/components/cards/goal-card'
import {
  ScheduleSuggestion,
  scheduleSuggestionPropsSchema,
} from '@/components/cards/schedule-suggestion'
import { ReflectionCard, reflectionCardPropsSchema } from '@/components/cards/reflection-card'
import {
  WeekCalendarView,
  weekCalendarViewPropsSchema,
} from '@/components/cards/week-calendar-view'
import { LifeBalanceView, lifeBalanceViewPropsSchema } from '@/components/cards/life-balance-view'

const tamboComponents: TamboComponent[] = [
  {
    name: 'TaskCard',
    description:
      'Displays a single task, goal, or habit with its status and next scheduled slot. Use when the user asks about a specific item.',
    component: TaskCard,
    propsSchema: taskCardPropsSchema,
  },
  {
    name: 'HabitCard',
    description:
      'Shows a habit tracker with streak count and completion rate progress bar. Use for habit-related queries.',
    component: HabitCard,
    propsSchema: habitCardPropsSchema,
  },
  {
    name: 'GoalCard',
    description:
      'Shows a long-term goal with a progress bar and milestone checklist. Use when the user asks about goal progress.',
    component: GoalCard,
    propsSchema: goalCardPropsSchema,
  },
  {
    name: 'ScheduleSuggestion',
    description:
      'Presents one or more time slots the user can accept or skip. Use when suggesting times to schedule a task or event.',
    component: ScheduleSuggestion,
    propsSchema: scheduleSuggestionPropsSchema,
  },
  {
    name: 'ReflectionCard',
    description:
      'Prompts the user to rate (1â€“5) and write a short reflection on a check-in. Use for daily or task check-ins.',
    component: ReflectionCard,
    propsSchema: reflectionCardPropsSchema,
  },
  {
    name: 'WeekCalendarView',
    description:
      'CSS Grid week calendar showing events and tasks across 7 days. Use when the user wants to see their week.',
    component: WeekCalendarView,
    propsSchema: weekCalendarViewPropsSchema,
  },
  {
    name: 'LifeBalanceView',
    description:
      'Donut chart showing weekly time distribution across life categories. Use when the user asks about their balance or time allocation.',
    component: LifeBalanceView,
    propsSchema: lifeBalanceViewPropsSchema,
  },
]

const calendarEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  start: z.string(),
  end: z.string(),
})

const getCalendarEvents = defineTool({
  name: 'get_calendar_events',
  description: "Fetch the user's calendar events between two ISO 8601 datetimes.",
  inputSchema: z.object({
    start: z.string().datetime().describe('Range start (ISO 8601)'),
    end: z.string().datetime().describe('Range end (ISO 8601)'),
  }),
  outputSchema: z.object({ events: z.array(calendarEventSchema) }),
  tool: async ({ start, end }) => {
    const res = await fetch(`/api/calendar/events?start=${start}&end=${end}`)
    return res.json() as Promise<{ events: z.infer<typeof calendarEventSchema>[] }>
  },
})

const createCalendarEvent = defineTool({
  name: 'create_calendar_event',
  description: 'Create a calendar event for the user. Use after the user accepts a suggested slot.',
  inputSchema: z.object({
    title: z.string().describe('Event title'),
    start: z.string().datetime().describe('Start time (ISO 8601)'),
    end: z.string().datetime().describe('End time (ISO 8601)'),
  }),
  outputSchema: z.object({ event: calendarEventSchema }),
  tool: async ({ title, start, end }) => {
    const res = await fetch('/api/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, start, end }),
    })
    return res.json() as Promise<{ event: z.infer<typeof calendarEventSchema> }>
  },
})

interface TamboProviderProps {
  children: ReactNode
  userKey?: string
}

export function TamboProvider({ children, userKey }: TamboProviderProps) {
  return (
    <BaseTamboProvider
      apiKey={env.NEXT_PUBLIC_TAMBO_API_KEY}
      tamboUrl={env.NEXT_PUBLIC_TAMBO_URL}
      userKey={userKey}
      components={tamboComponents}
      tools={[getCalendarEvents, createCalendarEvent]}
    >
      {children}
    </BaseTamboProvider>
  )
}
