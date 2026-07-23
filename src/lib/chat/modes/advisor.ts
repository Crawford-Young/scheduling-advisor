import { MODEL_TIERS } from '@/lib/chat/model-tiers'
import type { ChatToolName } from '@/lib/chat/tools'
import { buildSystemPrompt } from '@/lib/chat/system-prompt'
import { buildContextBlock } from '@/lib/chat/context-builder'
import type { ModeConfig } from './types'

const ADVISOR_HISTORY_LIMIT = 50
const ADVISOR_MAX_STEPS = 5

// Explicit literal allowlist — NOT an alias of CHAT_TOOL_NAMES. Advisor drops
// the direct event-creation tools (createEvent/createEvents): calendar events
// go through proposeEvent for user approval, whose card creates them. It keeps
// createActivity/updateEvent/deleteEvent (proposeAction-gated) and proposeEvent.
const ADVISOR_TOOL_NAMES: readonly ChatToolName[] = [
  'getWeekSchedule',
  'getActivities',
  'getTravelTime',
  'showWeekCalendar',
  'showScheduleSuggestion',
  'showLifeBalance',
  'proposeAction',
  'proposeEvent',
  'createActivity',
  'updateEvent',
  'deleteEvent',
] as const

export const advisorMode: ModeConfig = {
  name: 'advisor',
  model: MODEL_TIERS.sonnet.model,
  maxSteps: ADVISOR_MAX_STEPS,
  historyLimit: ADVISOR_HISTORY_LIMIT,
  persisted: true,
  toolNames: ADVISOR_TOOL_NAMES,
  buildSystem: () => buildSystemPrompt(),
  buildContext: (timezone) => buildContextBlock(timezone),
}
