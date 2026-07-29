import type { MetadataRoute } from 'next'

import { SITE_URL } from '@/lib/site-routes'

/**
 * Unlike the other hosts, this one has authenticated surfaces. They already
 * redirect signed-out visitors to `/login`, so a crawler never sees content
 * there — this list keeps them out of the crawl budget and out of search
 * results. Keep it describing the same set as the matcher in `src/proxy.ts`.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/login', '/privacy', '/terms'],
        disallow: [
          '/api/',
          '/activities',
          '/calendar',
          '/chat',
          '/feed',
          '/reflections',
          '/settings',
          '/tokens',
          '/u/',
          '/upgrade',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
