import type { ChatMode, ModeConfig } from './types'
import { advisorMode } from './advisor'
import { quickScheduleMode } from './quick-schedule'

const REGISTRY: Record<ChatMode, ModeConfig> = {
  advisor: advisorMode,
  'quick-schedule': quickScheduleMode,
}

export function getMode(name: ChatMode): ModeConfig {
  return REGISTRY[name]
}
export type { ChatMode, ModeConfig } from './types'
