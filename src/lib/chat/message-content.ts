/**
 * Extracts plain assistant text from AI-SDK message content, dropping
 * tool-call / tool-result blocks. Accepts a string (legacy user rows or
 * already-text content) or an array of content parts. Any non-text part —
 * or a non-string, non-array value — yields the empty string.
 *
 * proposeEvent tool blocks are a UI-only artifact (the approval card is
 * rendered client-side and the outcome re-enters as the user's
 * [CONFIRMED]/[DENY] text), so they must never enter persisted history or be
 * replayed to the model. This helper is the single normalizer used on both
 * the write (onFinish persist) and read (history replay) paths, which also
 * recovers already-broken conversations whose rows carry structured content.
 */
export function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter(
        (p): p is { type: 'text'; text: string } =>
          typeof p === 'object' &&
          p !== null &&
          (p as { type?: unknown }).type === 'text' &&
          typeof (p as { text?: unknown }).text === 'string',
      )
      .map((p) => p.text)
      .join('')
  }
  return ''
}
