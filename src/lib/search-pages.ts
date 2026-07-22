export interface PageSearchEntry {
  readonly label: string
  readonly route: string
  readonly keywords: readonly string[]
}

export const PAGE_INDEX: readonly PageSearchEntry[] = [
  { label: 'Calendar', route: '/calendar', keywords: ['week', 'schedule', 'events'] },
  { label: 'Activities', route: '/activities', keywords: ['templates', 'sessions', 'habits'] },
  { label: 'Feed', route: '/feed', keywords: ['people', 'social'] },
  { label: 'Reflections', route: '/reflections', keywords: ['chat', 'conversations', 'cy'] },
  { label: 'Tokens', route: '/tokens', keywords: ['balance', 'billing', 'plan'] },
  { label: 'Settings', route: '/settings', keywords: ['preferences', 'account', 'calendar'] },
  { label: 'Home', route: '/', keywords: ['dashboard', 'start'] },
]

export function filterPages(
  query: string,
  entries: readonly PageSearchEntry[],
): readonly PageSearchEntry[] {
  const q = query.trim().toLowerCase()
  if (q === '') return entries
  return entries.filter(
    (page) =>
      page.label.toLowerCase().includes(q) || page.keywords.some((keyword) => keyword.includes(q)),
  )
}
