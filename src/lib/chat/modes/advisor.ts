import { advisorModel } from '@/lib/ai'
import { CHAT_TOOL_NAMES } from '@/lib/chat/tools'
import { buildSystemPrompt } from '@/lib/chat/system-prompt'
import { buildContextBlock } from '@/lib/chat/context-builder'
import type { ModeConfig } from './types'

const ADVISOR_HISTORY_LIMIT = 50
const ADVISOR_MAX_STEPS = 5

export const advisorMode: ModeConfig = {
  name: 'advisor',
  model: advisorModel,
  maxSteps: ADVISOR_MAX_STEPS,
  historyLimit: ADVISOR_HISTORY_LIMIT,
  persisted: true,
  toolNames: CHAT_TOOL_NAMES,
  buildSystem: () => buildSystemPrompt(),
  buildContext: (timezone) => buildContextBlock(timezone),
}
