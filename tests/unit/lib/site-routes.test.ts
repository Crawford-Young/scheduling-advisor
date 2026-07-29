import { describe, it, expect } from 'vitest'

import { SITE_URL, siteRoutes, buildSitemap } from '@/lib/site-routes'

describe('site-routes', () => {
  it('points at the cybond subdomain', () => {
    expect(SITE_URL).toBe('https://cybond.crawfordyoung.dev')
  })

  it('lists only the public routes', () => {
    expect(siteRoutes()).toEqual(['/login', '/privacy', '/terms'])
  })

  it('omits the authenticated app root and its segments', () => {
    expect(siteRoutes()).not.toContain('/')
    expect(siteRoutes()).not.toContain('/calendar')
  })

  it('builds absolute urls', () => {
    const now = new Date('2026-07-28T00:00:00.000Z')
    expect(buildSitemap(now)).toEqual([
      { url: 'https://cybond.crawfordyoung.dev/login', lastModified: now },
      { url: 'https://cybond.crawfordyoung.dev/privacy', lastModified: now },
      { url: 'https://cybond.crawfordyoung.dev/terms', lastModified: now },
    ])
  })
})
