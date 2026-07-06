import { type NextRequest } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { users, messages } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { ratelimit } from '@/lib/redis'
import { streamText } from 'ai'
import { getMode } from '@/lib/chat/modes'
import { buildChatTools, pickTools } from '@/lib/chat/tools'
import { chatRequestSchema } from '@/lib/schemas/chat'
import { logger } from '@/lib/logger'
import { getTokenBalance, deductTokens } from '@/server/queries/tokens'
import { bumpConversationExpiry } from '@/server/actions/conversations'

const MIN_CREDITS = 1

interface Turn {
  readonly role: 'user' | 'assistant'
  readonly content: string
}

export async function POST(req: NextRequest): Promise<Response> {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const balance = await getTokenBalance(session.user.id)
  if (balance < MIN_CREDITS) {
    return Response.json({ error: 'insufficient_tokens' }, { status: 402 })
  }

  const { success } = await ratelimit.limit(session.user.id)
  if (!success) {
    return Response.json({ error: 'Rate limited' }, { status: 429 })
  }

  const parseResult = chatRequestSchema.safeParse(await req.json())
  if (!parseResult.success) {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }
  const { messages: incomingMessages, conversationId, mode: requestedMode } = parseResult.data

  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id) })
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const mode = getMode(requestedMode === 'quick-schedule' ? 'quick-schedule' : 'advisor')

  let turns: Turn[]
  if (mode.persisted) {
    // conversationId is guaranteed defined for persisted mode by the schema refine.
    const persistedConversationId = conversationId as string
    // messages is guaranteed non-empty (schema `.min(1)`), so the last element is defined.
    const lastMessage = incomingMessages[incomingMessages.length - 1]!
    await db.insert(messages).values({
      conversationId: persistedConversationId,
      role: lastMessage.role,
      content: lastMessage.content,
    })

    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, persistedConversationId))
      .orderBy(desc(messages.createdAt))
      .limit(mode.historyLimit)

    turns = history.reverse().map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content as string,
    }))
  } else {
    turns = incomingMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))
  }

  const [stableSystem, contextBlock] = [mode.buildSystem(), await mode.buildContext(user.timezone)]

  const result = streamText({
    model: mode.model,
    maxSteps: mode.maxSteps,
    tools: pickTools(buildChatTools(userId), mode.toolNames),
    messages: [
      {
        role: 'system',
        content: stableSystem,
        providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
      },
      { role: 'system', content: contextBlock },
      ...turns,
    ],
    onError: ({ error }) => {
      logger.error({ error }, 'streamText error')
    },
    onFinish: async ({ response, usage }) => {
      if (mode.persisted) {
        const persistedConversationId = conversationId as string
        const assistantMsg = response.messages[response.messages.length - 1]
        if (assistantMsg) {
          try {
            await db.insert(messages).values({
              conversationId: persistedConversationId,
              role: 'assistant',
              content: assistantMsg.content as unknown as Record<string, unknown>,
            })
          } catch (err) {
            logger.error({ err, conversationId }, 'Failed to persist assistant message')
          }
        }
      }

      if (usage) {
        try {
          await deductTokens(userId, usage.promptTokens + usage.completionTokens)
        } catch (err) {
          logger.error({ err, userId }, 'Failed to deduct tokens — user may have free usage')
        }
      }

      if (mode.persisted) {
        try {
          await bumpConversationExpiry(conversationId as string)
        } catch (err) {
          logger.error({ err, conversationId }, 'Failed to bump conversation expiry')
        }
      }
    },
  })

  return result.toDataStreamResponse({
    getErrorMessage: (error) => {
      logger.error({ error }, 'chat stream error')
      return error instanceof Error ? error.message : String(error)
    },
  })
}
