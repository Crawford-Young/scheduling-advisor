import { type NextRequest } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { users, messages, conversations } from '@/db/schema'
import { eq, desc, and, isNull } from 'drizzle-orm'
import { ratelimit } from '@/lib/redis'
import { streamText, isStepCount, toUIMessageStream, createUIMessageStreamResponse } from 'ai'
import { getMode } from '@/lib/chat/modes'
import { buildChatTools, pickTools } from '@/lib/chat/tools'
import { computeWeightedTokens } from '@/lib/chat/token-weights'
import { MODEL_TIERS, type ModelTier, type ModelTierConfig } from '@/lib/chat/model-tiers'
import { chatRequestSchema } from '@/lib/schemas/chat'
import { extractText } from '@/lib/chat/message-content'
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
  const { messages: incomingMessages, conversationId } = parseResult.data

  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id) })
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  // Only the persisted 'advisor' mode remains after the quick-schedule teardown,
  // so the route runs a single persisted lane — no mode.persisted branching.
  const mode = getMode('advisor')

  // conversationId is a required uuid per chatRequestSchema, so it is always defined.
  // Ownership guard AND tier source: only the owning user's live conversation resolves.
  // A foreign, missing, or soft-deleted conversation yields no row → 403 (no message written).
  const [conversation] = await db
    .select({ model: conversations.model })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, userId),
        isNull(conversations.deletedAt),
      ),
    )
  if (!conversation) return Response.json({ error: 'Not found' }, { status: 403 })
  // A pre-existing row whose model is the removed 'haiku' (or otherwise unknown)
  // has no MODEL_TIERS entry — fall back to Sonnet ×1 so it bills correctly.
  const tierConfig: ModelTierConfig =
    MODEL_TIERS[conversation.model as ModelTier] ?? MODEL_TIERS.sonnet

  // messages is guaranteed non-empty (schema `.min(1)`), so the last element is defined.
  const lastMessage = incomingMessages[incomingMessages.length - 1]!
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
    .limit(mode.historyLimit)

  // Normalize every stored row through extractText: new rows are plain
  // strings, but legacy rows may carry structured content with dangling
  // proposeEvent tool-call blocks — replaying those verbatim makes the
  // Anthropic API reject the request (tool_use without tool_result). This
  // recovers already-broken conversations.
  const extracted = history
    .reverse()
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: extractText(m.content) }))
    // A legacy row that is 100% tool blocks extracts to '' — dropping it keeps
    // an empty-content turn out of the Anthropic-bound messages array.
    .filter((t) => t.content !== '')

  // Coalesce adjacent same-role turns (an empty turn dropped from between two
  // same-role turns would otherwise leave them adjacent, which the API rejects).
  const turns: Turn[] = extracted.reduce<Turn[]>((acc, t) => {
    const last = acc[acc.length - 1]
    if (last && last.role === t.role) {
      acc[acc.length - 1] = { role: last.role, content: `${last.content}\n${t.content}` }
    } else {
      acc.push(t)
    }
    return acc
  }, [])

  // Anthropic requires the first non-system message to be a user turn; a
  // truncated history window (or an empty-drop promoting an assistant turn
  // to index 0) can start on assistant, which 400s the request.
  while (turns.length > 0 && turns[0]!.role === 'assistant') {
    turns.shift()
  }

  const [stableSystem, contextBlock] = [mode.buildSystem(), await mode.buildContext(user.timezone)]

  const result = streamText({
    model: tierConfig.model,
    // The mode declares maxSteps; v7 expresses the step cap as a stop condition.
    stopWhen: isStepCount(mode.maxSteps),
    tools: pickTools(buildChatTools(userId), mode.toolNames),
    // Stable prefix (cached) + volatile context block as two system messages.
    // Keeping the volatile block OUT of the cached prefix preserves the cache
    // key across turns; the prefix carries the ephemeral cacheControl flag.
    instructions: [
      {
        role: 'system',
        content: stableSystem,
        providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
      },
      { role: 'system', content: contextBlock },
    ],
    messages: turns,
    onError: ({ error }) => {
      logger.error({ error }, 'streamText error')
    },
    onEnd: async ({ responseMessages, usage }) => {
      // Persist assistant TEXT only. A proposeEvent turn yields a multi-part
      // response (assistant tool-call + tool-result + optional final text);
      // storing those blocks persists a dangling tool_use that breaks replay.
      // The approval card is UI-only and its outcome re-enters as the user's
      // [CONFIRMED]/[DENY] text, so the model needs none of the tool blocks.
      // responseMessages aggregates every step, so multi-step tool turns still
      // yield their final assistant text.
      const assistantText = responseMessages
        .filter((m) => m.role === 'assistant')
        .map((m) => extractText(m.content))
        .join('')
        .trim()
      // Empty text (model only called the tool and said nothing) → skip the
      // insert; the [CONFIRMED]/[DENY] user message carries continuity.
      if (assistantText) {
        try {
          await db.insert(messages).values({
            conversationId,
            role: 'assistant',
            content: assistantText,
          })
        } catch (err) {
          logger.error({ err, conversationId }, 'Failed to persist assistant message')
        }
      }

      if (usage) {
        // v7 aggregates usage across ALL steps; inputTokenDetails carries the
        // cache-class split. noCacheTokens is the net-of-cache input (mirrors
        // the old promptTokens). Cache weighting × tier multiplier is ceiled
        // exactly once so the two weightings share a single rounding step.
        const rawWeighted = computeWeightedTokens({
          promptTokens: usage.inputTokenDetails.noCacheTokens ?? 0,
          completionTokens: usage.outputTokens ?? 0,
          cacheReadTokens: usage.inputTokenDetails.cacheReadTokens ?? 0,
          cacheWriteTokens: usage.inputTokenDetails.cacheWriteTokens ?? 0,
        })
        const total = Math.ceil(rawWeighted * tierConfig.multiplier)
        logger.info(
          { usage, weighted: total, tier: tierConfig.tier, mode: mode.name },
          'chat token usage',
        )
        try {
          await deductTokens(userId, total)
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

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: (error) => {
        logger.error({ error }, 'chat stream error')
        return error instanceof Error ? error.message : String(error)
      },
    }),
  })
}
