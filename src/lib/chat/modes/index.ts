import type { ChatMode, ModeConfig } from './types'
import { advisorMode } from './advisor'

const REGISTRY: Record<ChatMode, ModeConfig> = {
  advisor: advisorMode,
}

export function getMode(name: ChatMode): ModeConfig {
  return REGISTRY[name]
}
export type { ChatMode, ModeConfig } from './types'
