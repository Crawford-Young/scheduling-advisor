import { type NextRequest } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { users, messages } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'
import { ratelimit } from '@/lib/redis'
import { defaultModel } from '@/lib/ai'
import { streamText } from 'ai'
import { buildSystemPrompt } from '@/lib/chat/system-prompt'
import { buildContextBlock } from '@/lib/chat/context-builder'
import { buildChatTools } from '@/lib/chat/tools'
import { chatRequestSchema } from '@/lib/schemas/chat'
import { logger } from '@/lib/logger'
import { getTokenBalance, deductTokens } from '@/server/queries/tokens'
import { bumpConversationExpiry } from '@/server/actions/conversations'

const MIN_CREDITS = 1

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
  const { messages: incomingMessages, conversationId } = parseResult.data

  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id) })
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const contextBlock = await buildContextBlock(user.timezone)
  const systemPrompt = `${buildSystemPrompt()}${contextBlock}`

  const lastMessage = incomingMessages[incomingMessages.length - 1]
  if (!lastMessage) {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

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

  const result = streamText({
    model: defaultModel,
    system: systemPrompt,
    messages: contextMessages,
    maxSteps: 5,
    tools: buildChatTools(userId),
    onError: ({ error }) => {
      logger.error({ error }, 'streamText error')
    },
    onFinish: async ({ response, usage }) => {
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

      if (usage) {
        try {
          await deductTokens(userId, usage.promptTokens + usage.completionTokens)
        } catch (err) {
          logger.error({ err, userId }, 'Failed to deduct tokens — user may have free usage')
        }
      }

      try {
        await bumpConversationExpiry(conversationId)
      } catch (err) {
        logger.error({ err, conversationId }, 'Failed to bump conversation expiry')
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
