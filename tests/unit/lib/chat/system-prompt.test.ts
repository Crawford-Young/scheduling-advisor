import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '@/lib/chat/system-prompt'

describe('buildSystemPrompt', () => {
  it('is stable — contains no dates (prompt-caching requirement)', () => {
    const sys = buildSystemPrompt()
    expect(sys).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('directs events through proposeEvent, never proposeAction or createCalendarEvent', () => {
    const sys = buildSystemPrompt()
    expect(sys).toMatch(/`proposeEvent`/)
    expect(sys).toMatch(/never.*`proposeAction`.*entityType.*event/i)
    expect(sys).toMatch(/never.*`createCalendarEvent`/i)
  })

  it('documents [CONFIRMED] semantics: the event already exists, do not call a creation tool', () => {
    const sys = buildSystemPrompt()
    expect(sys).toContain('[CONFIRMED]')
    expect(sys).toMatch(/already exists/i)
    expect(sys).toMatch(/do not call any creation tool/i)
  })

  it('no longer lists createCalendarEvent as an advisor mutation tool', () => {
    const sys = buildSystemPrompt()
    expect(sys).not.toContain('createCalendarEvent(title, start, end)')
  })

  it('lists proposeEvent among the propose tools', () => {
    const sys = buildSystemPrompt()
    expect(sys).toMatch(/proposeEvent/)
  })

  it('instructs a single proposeEvent call with recurrence fields for repeated requests', () => {
    const sys = buildSystemPrompt()
    expect(sys).toMatch(/recurring|repeated/i)
    expect(sys).toMatch(/once/i)
    expect(sys).toContain('recurrence')
    expect(sys).toContain('recurrenceDays')
    expect(sys).toContain('recurrenceCount')
    expect(sys).toMatch(/never.*(per occurrence|one call per occurrence)/i)
  })
})
