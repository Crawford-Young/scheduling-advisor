import { describe, it, expect } from 'vitest'
import { extractText } from '@/lib/chat/message-content'

describe('extractText', () => {
  it('passes a string through unchanged', () => {
    expect(extractText('hello world')).toBe('hello world')
  })

  it('extracts only text parts from a mixed content array, dropping tool-call blocks', () => {
    const content = [
      { type: 'tool-call', toolCallId: 't1', toolName: 'proposeEvent', args: { title: 'x' } },
      { type: 'text', text: 'hi' },
    ]
    expect(extractText(content)).toBe('hi')
  })

  it('concatenates multiple text parts in order', () => {
    const content = [
      { type: 'text', text: 'Here is ' },
      { type: 'tool-call', toolCallId: 't1', toolName: 'proposeEvent', args: {} },
      { type: 'text', text: 'the event' },
    ]
    expect(extractText(content)).toBe('Here is the event')
  })

  it('returns empty string for an all-tool-block array (no text)', () => {
    const content = [{ type: 'tool-call', toolCallId: 't1', toolName: 'proposeEvent', args: {} }]
    expect(extractText(content)).toBe('')
  })

  it('ignores malformed parts (non-object, null, missing text) in an array', () => {
    const content = [null, 'stray', { type: 'text' }, { type: 'text', text: 'ok' }]
    expect(extractText(content)).toBe('ok')
  })

  it('returns empty string for a non-array, non-string value', () => {
    expect(extractText({ foo: 'bar' })).toBe('')
    expect(extractText(undefined)).toBe('')
    expect(extractText(null)).toBe('')
  })
})
