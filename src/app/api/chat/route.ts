import { type NextRequest } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { users, messages } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { decrypt } from '@/lib/encryption'
import { ratelimit } from '@/lib/redis'
import { createAnthropic } from '@ai-sdk/anthropic'
import { streamText, tool } from 'ai'
import { z } from 'zod'
import { systemPrompt } from '@/lib/chat/system-prompt'
import { chatRequestSchema } from '@/lib/schemas/chat'
import { logger } from '@/lib/logger'
import { getCalendarService } from '@/server/services'
import { getUserTasks } from '@/server/queries/tasks'
import { getUserCheckIns } from '@/server/queries/check-ins'
import { taskCardPropsSchema } from '@/components/cards/task-card'
import { habitCardPropsSchema } from '@/components/cards/habit-card'
import { goalCardPropsSchema } from '@/components/cards/goal-card'
import { scheduleSuggestionPropsSchema } from '@/components/cards/schedule-suggestion'
import { reflectionCardPropsSchema } from '@/components/cards/reflection-card'
import { weekCalendarViewPropsSchema } from '@/components/cards/week-calendar-view'
import { lifeBalanceViewPropsSchema } from '@/components/cards/life-balance-view'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) {
    return Response.json({ error: 'Rate limited' }, { status: 429 })
  }

  const parseResult = chatRequestSchema.safeParse(await req.json())
  if (!parseResult.success) {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }
  const { messages: incomingMessages, conversationId } = parseResult.data

  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id) })
  if (!user?.anthropicApiKey) {
    return Response.json({ error: 'no_api_key' }, { status: 400 })
  }

  const decryptedKey = decrypt(user.anthropicApiKey)
  const lastMessage = incomingMessages[incomingMessages.length - 1]

  await db.insert(messages).values({
    conversationId,
    role: lastMessage.role,
    content: lastMessage.content,
  })

  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(50)

  const contextMessages = history.reverse().map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content as string,
  }))

  const userId = session.user.id
  const anthropic = createAnthropic({ apiKey: decryptedKey })

  const result = streamText({
    model: anthropic(user.preferredModel),
    system: systemPrompt,
    messages: contextMessages,
    maxSteps: 5,
    tools: {
      getCalendarEvents: tool({
        description: 'Get calendar events for a date range',
        parameters: z.object({ start: z.string(), end: z.string() }),
        execute: async ({ start, end }) => {
          const service = await getCalendarService()
          return service.getEvents(userId, new Date(start), new Date(end))
        },
      }),
      createCalendarEvent: tool({
        description: 'Create a calendar event',
        parameters: z.object({ title: z.string(), start: z.string(), end: z.string() }),
        execute: async ({ title, start, end }) => {
          const service = await getCalendarService()
          return service.createEvent(userId, { title, start: new Date(start), end: new Date(end) })
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
      showTaskCard: tool({
        description: 'Display a task, goal, or habit card',
        parameters: taskCardPropsSchema,
        execute: async (props) => props,
      }),
      showHabitCard: tool({
        description: 'Display a habit tracking card',
        parameters: habitCardPropsSchema,
        execute: async (props) => props,
      }),
      showGoalCard: tool({
        description: 'Display a goal progress card',
        parameters: goalCardPropsSchema,
        execute: async (props) => props,
      }),
      showScheduleSuggestion: tool({
        description: 'Display scheduling time slot suggestions',
        parameters: scheduleSuggestionPropsSchema,
        execute: async (props) => props,
      }),
      showReflectionCard: tool({
        description: 'Display a check-in reflection prompt',
        parameters: reflectionCardPropsSchema,
        execute: async (props) => props,
      }),
      showWeekCalendar: tool({
        description: 'Display a week calendar view',
        parameters: weekCalendarViewPropsSchema,
        execute: async (props) => props,
      }),
      showLifeBalance: tool({
        description: 'Display a life balance pie chart',
        parameters: lifeBalanceViewPropsSchema,
        execute: async (props) => props,
      }),
    },
    onFinish: async ({ response }) => {
      const assistantMsg = response.messages[response.messages.length - 1]
      if (assistantMsg) {
        try {
          await db.insert(messages).values({
            conversationId,
            role: 'assistant',
            content: assistantMsg.content as unknown as Record<string, unknown>,
          })
        } catch (err) {
          logger.error({ err, conversationId }, 'Failed to persist assistant message')
        }
      }
    },
  })

  return result.toDataStreamResponse()
}
