import { tool, jsonSchema, type CoreTool } from 'ai'
import { z } from 'zod'
import { getCalendarService } from '@/server/services'
import { getUserTasks } from '@/server/queries/tasks'
import { getUserCheckIns } from '@/server/queries/check-ins'
import {
  markItemComplete,
  markItemSkipped,
  rescheduleItem,
  createHabit,
  createGoal,
  createTask,
  updateItem,
} from '@/server/actions/items'

export const CHAT_TOOL_NAMES = [
  'getCalendarEvents',
  'getUserTasks',
  'getUserCheckIns',
  'showTaskCard',
  'showHabitCard',
  'showGoalCard',
  'showScheduleSuggestion',
  'showReflectionCard',
  'showWeekCalendar',
  'showLifeBalance',
  'proposeAction',
  'markItemComplete',
  'markItemSkipped',
  'rescheduleItem',
  'createCalendarEvent',
  'createHabit',
  'createGoal',
  'createTask',
  'updateItem',
] as const

export type ChatToolName = (typeof CHAT_TOOL_NAMES)[number]
export type ChatToolSet = Record<ChatToolName, CoreTool>

export function buildChatTools(userId: string): ChatToolSet {
  return {
    // ── Data tools ──────────────────────────────────────────────────────────
    getCalendarEvents: tool({
      description: 'Get calendar events for a date range',
      parameters: z.object({ start: z.string(), end: z.string() }),
      execute: async ({ start, end }) => {
        const service = await getCalendarService()
        return service.getEvents(userId, new Date(start), new Date(end))
      },
    }),
    getUserTasks: tool({
      description: 'Get the user tasks, goals, and habits',
      parameters: z.object({}),
      execute: async () => getUserTasks(),
    }),
    getUserCheckIns: tool({
      description: 'Get recent user check-ins',
      parameters: z.object({}),
      execute: async () => getUserCheckIns(),
    }),
    // ── Display tools ───────────────────────────────────────────────────────
    showTaskCard: tool({
      description: 'Display a task card',
      parameters: jsonSchema({
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          title: { type: 'string' },
          type: { type: 'string', enum: ['task', 'goal', 'habit'] },
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
          nextSlot: { type: 'string' },
        },
        required: ['taskId', 'title', 'type', 'status'],
      }),
      execute: async (props) => props,
    }),
    showHabitCard: tool({
      description: 'Display a habit tracking card',
      parameters: jsonSchema({
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          title: { type: 'string' },
          streak: { type: 'number' },
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
        },
        required: ['taskId', 'title', 'streak', 'status'],
      }),
      execute: async (props) => props,
    }),
    showGoalCard: tool({
      description: 'Display a goal progress card',
      parameters: jsonSchema({
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          title: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
          targetDate: { type: 'string' },
        },
        required: ['taskId', 'title', 'status'],
      }),
      execute: async (props) => props,
    }),
    showScheduleSuggestion: tool({
      description: 'Display scheduling time slot suggestions',
      parameters: jsonSchema({
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
    showReflectionCard: tool({
      description: 'Display a check-in reflection prompt',
      parameters: jsonSchema({
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          title: { type: 'string' },
          prompt: { type: 'string' },
        },
        required: ['taskId', 'title', 'prompt'],
      }),
      execute: async (props) => props,
    }),
    showWeekCalendar: tool({
      description: 'Display a week calendar view',
      parameters: jsonSchema({
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
                type: { type: 'string', enum: ['calendar', 'task', 'goal', 'habit'] },
              },
              required: ['id', 'title', 'start', 'end', 'type'],
            },
          },
        },
        required: ['weekStart', 'events'],
      }),
      execute: async (props) => props,
    }),
    showLifeBalance: tool({
      description: 'Display a life balance pie chart',
      parameters: jsonSchema({
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
      parameters: z.object({
        action: z.string(),
        entityType: z.enum(['habit', 'goal', 'event']),
        entityId: z.string().optional(),
        date: z.string().optional(),
        time: z.string().optional(),
        detail: z.string().optional(),
      }),
      execute: async (props) => props,
    }),
    // ── Mutation tools (only after [CONFIRM]) ───────────────────────────────
    markItemComplete: tool({
      description:
        'Mark a habit, goal, or task complete for a given date. Supports past dates for retroactive check-ins.',
      parameters: z.object({
        taskId: z.string(),
        date: z.string().describe('YYYY-MM-DD format'),
      }),
      execute: async ({ taskId, date }) => markItemComplete({ taskId, date }),
    }),
    markItemSkipped: tool({
      description: 'Mark a habit, goal, or task skipped for a given date.',
      parameters: z.object({
        taskId: z.string(),
        date: z.string().describe('YYYY-MM-DD format'),
      }),
      execute: async ({ taskId, date }) => markItemSkipped({ taskId, date }),
    }),
    rescheduleItem: tool({
      description: 'Move a task, goal, or habit to a new date and optional time.',
      parameters: z.object({
        taskId: z.string(),
        newDate: z.string().describe('YYYY-MM-DD format'),
        newTime: z.string().optional(),
      }),
      execute: async ({ taskId, newDate, newTime }) => rescheduleItem({ taskId, newDate, newTime }),
    }),
    createCalendarEvent: tool({
      description: 'Create a calendar event',
      parameters: z.object({ title: z.string(), start: z.string(), end: z.string() }),
      execute: async ({ title, start, end }) => {
        const service = await getCalendarService()
        return service.createEvent(userId, { title, start: new Date(start), end: new Date(end) })
      },
    }),
    createHabit: tool({
      description: 'Create a new recurring habit',
      parameters: z.object({
        title: z.string(),
        startDate: z.string(),
        time: z.string().optional(),
        visibility: z.enum(['everyone', 'friends', 'busy', 'only_me']),
      }),
      execute: async (props) => createHabit(props),
    }),
    createGoal: tool({
      description: 'Create a new goal with a target date',
      parameters: z.object({
        title: z.string(),
        targetDate: z.string(),
        visibility: z.enum(['everyone', 'friends', 'busy', 'only_me']),
      }),
      execute: async (props) => createGoal(props),
    }),
    createTask: tool({
      description: 'Create a new task',
      parameters: z.object({
        title: z.string(),
        dueDate: z.string(),
        dueTime: z.string().optional(),
        visibility: z.enum(['everyone', 'friends', 'busy', 'only_me']),
      }),
      execute: async (props) => createTask(props),
    }),
    updateItem: tool({
      description: 'Edit an existing task, goal, or habit',
      parameters: z.object({
        taskId: z.string(),
        fields: z.object({
          title: z.string().optional(),
          status: z.enum(['pending', 'in_progress', 'completed']).optional(),
          targetDate: z.string().optional(),
          visibility: z.enum(['everyone', 'friends', 'busy', 'only_me']).optional(),
        }),
      }),
      execute: async ({ taskId, fields }) => updateItem({ taskId, fields }),
    }),
  }
}

export function pickTools(
  all: ChatToolSet,
  names: readonly ChatToolName[],
): Record<string, CoreTool> {
  return Object.fromEntries(names.map((n) => [n, all[n]]))
}
