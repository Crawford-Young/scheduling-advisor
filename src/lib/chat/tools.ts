import { tool, jsonSchema, type Tool } from 'ai'
import { z } from 'zod'
import { and, asc, eq, gte, lt } from 'drizzle-orm'
import { db } from '@/db'
import { events, calendarPrefs } from '@/db/schema'
import { localWeekBounds } from '@/lib/weekly-fit'
import { getUserActivities } from '@/server/queries/activities'
import { createActivity } from '@/server/actions/activities'
import { createEvent, updateEvent, deleteEvent } from '@/server/actions/events'
import { createEvents } from '@/server/actions/chat-mutations'
import {
  getUserTravelPlan,
  resolveLocation,
  getCachedTravelTime,
  getLiveTravelTime,
  TRAFFIC_AWARE_WINDOW_HOURS,
} from '@/server/travel'
import type { TravelMode, TravelTimeInput } from '@/server/services/interfaces/travel'

export const CHAT_TOOL_NAMES = [
  'getWeekSchedule',
  'getActivities',
  'getTravelTime',
  'createActivity',
  'createEvent',
  'createEvents',
  'updateEvent',
  'deleteEvent',
  'proposeAction',
  'proposeEvent',
  'showWeekCalendar',
  'showScheduleSuggestion',
  'showLifeBalance',
] as const

export type ChatToolName = (typeof CHAT_TOOL_NAMES)[number]
export type ChatToolSet = Record<ChatToolName, Tool>

const MINUTES_IN_DAY = 1440
const MS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const TRAFFIC_AWARE_WINDOW_MS =
  TRAFFIC_AWARE_WINDOW_HOURS * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND
const DEFAULT_TRAVEL_MODE: TravelMode = 'driving'
const TRAVEL_MODE_ROW_LIMIT = 1

const scheduleSlotSchema = z.object({
  day: z.number().int().min(0).max(6).describe('weekday, 0=Sunday … 6=Saturday'),
  startMinutes: z
    .number()
    .int()
    .min(0)
    .max(MINUTES_IN_DAY - 1)
    .describe('minutes since local midnight'),
  durationMin: z.number().int().positive(),
})

const eventInputSchema = z.object({
  title: z.string(),
  activityId: z.string().optional().describe('link this event to an activity template'),
  startAt: z.string().optional().describe('ISO 8601 start instant'),
  endAt: z.string().optional().describe('ISO 8601 end instant'),
  allDay: z.boolean().optional(),
  color: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
})

const travelTimeInputSchema = z.object({
  origin: z
    .string()
    .describe('Origin location: a saved place name (e.g. "home"), event location, or address'),
  destination: z
    .string()
    .describe('Destination location: a saved place name, event location, or address'),
  mode: z
    .enum(['driving', 'walking', 'bicycling', 'transit'])
    .optional()
    .describe("Travel mode; defaults to the user's saved travel preference"),
  departureTimeIso: z
    .string()
    .optional()
    .describe(
      'ISO 8601 departure instant — only pass this for imminent departures, to get a traffic-aware estimate',
    ),
})

interface TravelTimeError {
  readonly error: string
}

interface TravelTimeSuccess {
  readonly durationMin: number
  readonly distanceMeters: number
  readonly mode: TravelMode
  readonly trafficAware: boolean
  readonly origin: string
  readonly destination: string
}

type TravelTimeResult = TravelTimeError | TravelTimeSuccess

function clarifyLocationError(rawText: string): TravelTimeError {
  return {
    error: `Couldn't find a location for '${rawText}'. Ask the user to clarify or save it as a place.`,
  }
}

async function resolveTravelMode(userId: string): Promise<TravelMode> {
  const rows = await db
    .select()
    .from(calendarPrefs)
    .where(eq(calendarPrefs.userId, userId))
    .limit(TRAVEL_MODE_ROW_LIMIT)
  const row = rows[0] as { travelMode: TravelMode } | undefined
  return row?.travelMode ?? DEFAULT_TRAVEL_MODE
}

// Server-enforced traffic policy: a departure only qualifies for a live,
// traffic-aware lookup when it parses AND falls within the next
// TRAFFIC_AWARE_WINDOW_HOURS from now (future-side only). Past or
// unparseable input is treated as absent — never thrown.
function resolveDepartureTime(departureTimeIso: string | undefined): Date | undefined {
  if (!departureTimeIso) return undefined
  const parsed = new Date(departureTimeIso)
  if (Number.isNaN(parsed.getTime())) return undefined
  const deltaMs = parsed.getTime() - Date.now()
  if (deltaMs < 0 || deltaMs > TRAFFIC_AWARE_WINDOW_MS) return undefined
  return parsed
}

/**
 * `getTravelTime` tool implementation. `userId` is the route's
 * already-authenticated session id (never client/model-supplied) — the
 * traffic policy below is likewise decided server-side from
 * `departureTimeIso` vs now, never trusted from the model's choice.
 */
export async function executeGetTravelTime(
  userId: string,
  props: z.infer<typeof travelTimeInputSchema>,
): Promise<TravelTimeResult> {
  const hasPlan = await getUserTravelPlan(userId)
  if (!hasPlan) return { error: 'Travel estimates require a subscription.' }

  const origin = await resolveLocation(userId, props.origin)
  if (!origin) return clarifyLocationError(props.origin)

  const destination = await resolveLocation(userId, props.destination)
  if (!destination) return clarifyLocationError(props.destination)

  const mode = props.mode ?? (await resolveTravelMode(userId))
  const departureTime = resolveDepartureTime(props.departureTimeIso)

  const input: TravelTimeInput = { origin: origin.point, destination: destination.point, mode }
  const estimate = departureTime
    ? await getLiveTravelTime(userId, { ...input, departureTime })
    : await getCachedTravelTime(userId, input)

  if (!estimate) return { error: 'Travel time is unavailable right now.' }

  return {
    durationMin: estimate.durationMin,
    distanceMeters: estimate.distanceMeters,
    mode,
    trafficAware: estimate.trafficAware,
    origin: origin.label,
    destination: destination.label,
  }
}

/**
 * Chat tool factory. `userId` is the route's already-authenticated session id
 * (never client-supplied) and is used ONLY to scope the getWeekSchedule read;
 * every mutation tool delegates to a 'use server' action that re-derives
 * identity from auth() itself.
 */
export function buildChatTools(userId: string): ChatToolSet {
  return {
    // ── Data tools ──────────────────────────────────────────────────────────
    getWeekSchedule: tool({
      description:
        "Get this user's events and activity templates for the week containing the given date. Prefer the context block for the current week; call this only for other weeks.",
      inputSchema: z.object({
        weekStart: z.string().describe('ISO date of any day inside the desired week'),
      }),
      execute: async ({ weekStart }) => {
        const { start, end } = localWeekBounds(new Date(weekStart))
        const [weekEvents, activities] = await Promise.all([
          db
            .select()
            .from(events)
            .where(
              and(eq(events.userId, userId), gte(events.startAt, start), lt(events.startAt, end)),
            )
            .orderBy(asc(events.startAt)),
          getUserActivities(),
        ])
        return { weekStart: start.toISOString(), activities, events: weekEvents }
      },
    }),
    getActivities: tool({
      description: 'Get all of this user’s activity templates (recurring session definitions).',
      inputSchema: z.object({}),
      execute: async () => getUserActivities(),
    }),
    getTravelTime: tool({
      description:
        'Estimate travel time between two locations. Accepts saved place names (including "home"), event locations, or addresses. Pass departureTimeIso only for imminent departures to get traffic-aware estimates.',
      inputSchema: travelTimeInputSchema,
      execute: async (props) => executeGetTravelTime(userId, props),
    }),
    // ── Display tools ───────────────────────────────────────────────────────
    showWeekCalendar: tool({
      description: 'Display a week calendar view',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          weekStart: { type: 'string' },
          events: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                start: { type: 'string' },
                end: { type: 'string' },
                type: { type: 'string', enum: ['calendar', 'event', 'activity'] },
              },
              required: ['id', 'title', 'start', 'end', 'type'],
            },
          },
        },
        required: ['weekStart', 'events'],
      }),
      execute: async (props) => props,
    }),
    showScheduleSuggestion: tool({
      description: 'Display scheduling time slot suggestions',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          taskTitle: { type: 'string' },
          slots: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                start: { type: 'string' },
                end: { type: 'string' },
                label: { type: 'string' },
              },
              required: ['start', 'end', 'label'],
            },
          },
        },
        required: ['taskId', 'taskTitle', 'slots'],
      }),
      execute: async (props) => props,
    }),
    showLifeBalance: tool({
      description:
        'Display a life balance pie chart. Populate categories from the minutes spent across this week’s events and activities.',
      inputSchema: jsonSchema({
        type: 'object',
        properties: {
          categories: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                minutes: { type: 'number' },
                color: { type: 'string' },
              },
              required: ['label', 'minutes', 'color'],
            },
          },
        },
        required: ['categories'],
      }),
      execute: async (props) => props,
    }),
    // ── Propose tool ────────────────────────────────────────────────────────
    proposeAction: tool({
      description:
        'Propose an action for user confirmation before executing. ALWAYS call this before any mutation. Renders an ActionConfirmCard in the UI.',
      inputSchema: z.object({
        action: z.string(),
        entityType: z.enum(['activity', 'event']),
        entityId: z.string().optional(),
        date: z.string().optional(),
        time: z.string().optional(),
        detail: z.string().optional(),
      }),
      execute: async (props) => props,
    }),
    proposeEvent: tool({
      description:
        'Propose a calendar event for user approval. ALWAYS use this for calendar events instead of proposeAction/createEvent. Renders an approval card with a day preview. The event is created only after the user approves. For a repeated/recurring request ("every weekday", "daily for a month"), make ONE call with the recurrence fields — NEVER multiple proposeEvent calls for individual occurrences. Set `recurrence` to daily/weekly/monthly. recurrenceCount: for weekly = number of WEEKS the pattern repeats; for daily = number of days; for monthly = number of months. Use recurrenceDays only for weekly. `date` is the first occurrence.',
      inputSchema: z
        .object({
          title: z.string().min(1),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          start: z.string().regex(/^\d{2}:\d{2}$/),
          end: z.string().regex(/^\d{2}:\d{2}$/),
          description: z.string().optional(),
          recurrence: z.enum(['daily', 'weekly', 'monthly']).optional(),
          recurrenceDays: z
            .array(z.enum(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']))
            .optional(),
          recurrenceCount: z.number().int().min(2).max(52).optional(),
        })
        .refine((v) => v.end > v.start, { message: 'end must be after start' }),
      execute: async (props) => props,
    }),
    // ── Mutation tools (only after [CONFIRM]) ───────────────────────────────
    createActivity: tool({
      description:
        'Create a recurring activity template. It fans out into concrete events on the user’s calendar per its weekly schedule.',
      inputSchema: z.object({
        title: z.string(),
        color: z.string().optional(),
        description: z.string().optional(),
        defaultLocation: z.string().optional(),
        minDurationMin: z.number().int().positive(),
        maxDurationMin: z.number().int().positive(),
        weeklyTargetSessions: z.number().int().positive(),
        schedule: z.array(scheduleSlotSchema),
        timeZone: z.string().optional().describe('IANA zone the schedule times are wall-clock in'),
      }),
      execute: async (props) => createActivity(props),
    }),
    createEvent: tool({
      description: 'Create a single standalone event on the calendar.',
      inputSchema: eventInputSchema,
      execute: async (props) => createEvent(props),
    }),
    createEvents: tool({
      description:
        'Create several independent events in one call (e.g. a workout on Mon/Wed/Fri). Each event is its own standalone row — there is no recurrence linkage between them.',
      inputSchema: z.object({ events: z.array(eventInputSchema).min(1) }),
      execute: async (props) => createEvents(props),
    }),
    updateEvent: tool({
      description:
        'Edit a single event. Only the provided fields change; siblings are never touched.',
      inputSchema: eventInputSchema.partial().extend({
        id: z.string(),
        status: z.enum(['pending', 'completed']).optional(),
        locked: z.boolean().optional(),
      }),
      execute: async (props) => updateEvent(props),
    }),
    deleteEvent: tool({
      description: 'Delete a single event.',
      inputSchema: z.object({ id: z.string() }),
      execute: async (props) => deleteEvent(props),
    }),
  }
}

export function pickTools(all: ChatToolSet, names: readonly ChatToolName[]): Record<string, Tool> {
  return Object.fromEntries(names.map((n) => [n, all[n]]))
}
