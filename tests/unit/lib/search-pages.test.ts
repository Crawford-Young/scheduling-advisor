import { describe, it, expect } from 'vitest'
import { PAGE_INDEX, filterPages } from '@/lib/search-pages'

describe('PAGE_INDEX', () => {
  it('carries the seven static routes', () => {
    expect(PAGE_INDEX.map((p) => p.route)).toEqual([
      '/calendar',
      '/activities',
      '/feed',
      '/reflections',
      '/tokens',
      '/settings',
      '/',
    ])
  })
})

describe('filterPages', () => {
  it('returns all entries for an empty query', () => {
    expect(filterPages('', PAGE_INDEX)).toEqual(PAGE_INDEX)
  })

  it('matches case-insensitively on label from the first character', () => {
    expect(filterPages('c', PAGE_INDEX).map((p) => p.label)).toContain('Calendar')
  })

  it('matches on keywords', () => {
    expect(filterPages('conversations', PAGE_INDEX).map((p) => p.label)).toContain('Reflections')
  })

  it('returns empty when nothing matches', () => {
    expect(filterPages('zzzz', PAGE_INDEX)).toEqual([])
  })

  it('filters caller-appended dynamic entries too', () => {
    const entries = [...PAGE_INDEX, { label: 'My profile', route: '/u/crawford', keywords: ['me'] }]
    expect(filterPages('profile', entries).map((p) => p.route)).toContain('/u/crawford')
  })
})
