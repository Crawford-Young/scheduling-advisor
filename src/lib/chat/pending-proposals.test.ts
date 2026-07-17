import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import {
  writePendingProposals,
  readPendingProposals,
  clearPendingProposals,
} from './pending-proposals'
import type { EventProposal } from '@/components/chat/tool-result-renderer'

const CONVERSATION_A = 'conv-a'
const CONVERSATION_B = 'conv-b'
const STORAGE_KEY_A = 'chat-pending-proposals:conv-a'

const singleProposal: EventProposal = {
  toolCallId: 'call-1',
  title: 'Dentist',
  date: '2026-06-03',
  start: '14:00',
  end: '15:00',
}

const recurringProposal: EventProposal = {
  toolCallId: 'call-2',
  title: 'Standup',
  date: '2026-06-01',
  start: '09:00',
  end: '09:15',
  description: 'daily sync',
  recurrence: 'weekly',
  recurrenceDays: ['Mon', 'Fri'],
  recurrenceCount: 8,
}

describe('pending-proposals', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('write → read round-trip', () => {
    it('preserves all fields including recurrence metadata', () => {
      writePendingProposals(CONVERSATION_A, [singleProposal, recurringProposal])
      expect(readPendingProposals(CONVERSATION_A)).toEqual([singleProposal, recurringProposal])
    })

    it('serializes under the conversation-scoped storage key', () => {
      writePendingProposals(CONVERSATION_A, [singleProposal])
      expect(window.sessionStorage.getItem(STORAGE_KEY_A)).toBe(JSON.stringify([singleProposal]))
    })
  })

  describe('writePendingProposals', () => {
    it('writes nothing for an empty array (key stays absent)', () => {
      writePendingProposals(CONVERSATION_A, [])
      expect(window.sessionStorage.getItem(STORAGE_KEY_A)).toBeNull()
    })

    it('is a no-op under SSR (no window)', () => {
      vi.stubGlobal('window', undefined)
      // Guard returns before any storage access; nothing throws.
      expect(() => writePendingProposals(CONVERSATION_A, [singleProposal])).not.toThrow()
    })
  })

  describe('readPendingProposals', () => {
    it('returns [] when the key is absent', () => {
      expect(readPendingProposals(CONVERSATION_A)).toEqual([])
    })

    it('returns [] for malformed JSON', () => {
      window.sessionStorage.setItem(STORAGE_KEY_A, '{not valid json')
      expect(readPendingProposals(CONVERSATION_A)).toEqual([])
    })

    it('returns [] for a schema-invalid payload', () => {
      window.sessionStorage.setItem(STORAGE_KEY_A, JSON.stringify([{ toolCallId: 42 }]))
      expect(readPendingProposals(CONVERSATION_A)).toEqual([])
    })

    it('returns [] under SSR (no window)', () => {
      vi.stubGlobal('window', undefined)
      expect(readPendingProposals(CONVERSATION_A)).toEqual([])
    })
  })

  describe('clearPendingProposals', () => {
    it('removes the key', () => {
      writePendingProposals(CONVERSATION_A, [singleProposal])
      clearPendingProposals(CONVERSATION_A)
      expect(window.sessionStorage.getItem(STORAGE_KEY_A)).toBeNull()
    })

    it('is a no-op under SSR (no window)', () => {
      vi.stubGlobal('window', undefined)
      expect(() => clearPendingProposals(CONVERSATION_A)).not.toThrow()
    })
  })

  describe('keyed isolation', () => {
    it('does not surface conversation A proposals under conversation B', () => {
      writePendingProposals(CONVERSATION_A, [singleProposal])
      expect(readPendingProposals(CONVERSATION_B)).toEqual([])
    })
  })
})
