import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '@/lib/chat/system-prompt'

describe('buildSystemPrompt', () => {
  it('is stable — contains no dates (prompt-caching requirement)', () => {
    const sys = buildSystemPrompt()
    expect(sys).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('directs events through proposeEvent, never proposeAction or createEvent directly', () => {
    const sys = buildSystemPrompt()
    expect(sys).toMatch(/`proposeEvent`/)
    expect(sys).toMatch(/never.*`proposeAction`.*entityType.*event/i)
    expect(sys).toMatch(/never.*`createEvent`/i)
  })

  it('documents [CONFIRMED] semantics: the event already exists, do not call a creation tool', () => {
    const sys = buildSystemPrompt()
    expect(sys).toContain('[CONFIRMED]')
    expect(sys).toMatch(/already exists/i)
    expect(sys).toMatch(/do not call any creation tool/i)
  })

  it('no longer lists the direct event-create tools as advisor mutation tools', () => {
    const sys = buildSystemPrompt()
    // Calendar events are created via proposeEvent's approval card, so createEvent/
    // createEvents are not presented as directly-callable mutation tools.
    expect(sys).not.toContain('createEvent(title, startAt')
    expect(sys).not.toContain('createEvents(events[])')
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
