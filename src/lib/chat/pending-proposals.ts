import { z } from 'zod'
import { dayOfWeekSchema } from '@/lib/schemas/task'
import type { EventProposal } from '@/components/chat/tool-result-renderer'

// One-shot sessionStorage handoff for pending event proposals across the chat
// popup → /chat "Expand" navigation. Persisted chat history is text-only (the
// proposeEvent tool blocks are deliberately never stored — dangling tool_use
// blocks 400 the Anthropic API), so an unresolved ✓/✗ card would be lost on
// expand. This carries the live card across the reload without persisting any
// tool block. Keyed by conversation id; the /chat surface reads then clears once.
const STORAGE_KEY_PREFIX = 'chat-pending-proposals:'

const recurrenceFrequencySchema = z.enum(['daily', 'weekly', 'monthly'])

// Mirrors the EventProposal shape (tool-result-renderer). Zod-validated on read
// per the system-boundary rule — sessionStorage is untrusted input.
const pendingProposalSchema = z.object({
  toolCallId: z.string(),
  title: z.string(),
  date: z.string(),
  start: z.string(),
  end: z.string(),
  description: z.string().optional(),
  recurrence: recurrenceFrequencySchema.optional(),
  recurrenceDays: z.array(dayOfWeekSchema).readonly().optional(),
  recurrenceCount: z.number().optional(),
})

const pendingProposalsSchema = z.array(pendingProposalSchema).readonly()

function storageKey(conversationId: string): string {
  return `${STORAGE_KEY_PREFIX}${conversationId}`
}

/** Serialize unresolved proposals for `conversationId`. No-op under SSR or when empty. */
export function writePendingProposals(
  conversationId: string,
  proposals: readonly EventProposal[],
): void {
  if (typeof window === 'undefined') return
  if (proposals.length === 0) return
  window.sessionStorage.setItem(storageKey(conversationId), JSON.stringify(proposals))
}

/** Read the carried proposals for `conversationId`. Returns [] under SSR, absent key, or invalid data. Does NOT delete. */
export function readPendingProposals(conversationId: string): readonly EventProposal[] {
  if (typeof window === 'undefined') return []
  const raw = window.sessionStorage.getItem(storageKey(conversationId))
  if (raw === null) return []
  try {
    return pendingProposalsSchema.parse(JSON.parse(raw))
  } catch {
    return []
  }
}

/** Remove the carried proposals for `conversationId`. No-op under SSR. */
export function clearPendingProposals(conversationId: string): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(storageKey(conversationId))
}
