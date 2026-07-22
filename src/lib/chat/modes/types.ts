import type { LanguageModelV1 } from 'ai'
import type { ChatToolName } from '@/lib/chat/tools'

export type ChatMode = 'advisor'

export interface ModeConfig {
  readonly name: ChatMode
  readonly model: LanguageModelV1
  readonly maxSteps: number
  readonly historyLimit: number
  readonly persisted: boolean // false → no DB reads/writes for messages
  readonly toolNames: readonly ChatToolName[]
  buildSystem(): string // STABLE prefix only — no dates, no user data
  buildContext(timezone: string): Promise<string> // volatile block, travels outside the cached prefix
}
