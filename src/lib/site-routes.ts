import type { MetadataRoute } from 'next'

/**
 * The canonical origin, hardcoded rather than read from `NEXT_PUBLIC_APP_URL`.
 * A canonical URL is a published fact about the host, not a per-env knob — the
 * carsickyak host shipped `og:url = http://localhost:3000` to production for
 * exactly that reason, invisible to every gate because the value is correct
 * locally. See the W1 issue log, issue #1.
 */
export const SITE_URL = 'https://cybond.crawfordyoung.dev'

/**
 * Only the routes a signed-out crawler can actually reach. The app root and
 * every `(app)` segment are behind the auth proxy, so they are deliberately
 * absent — listing them would advertise URLs that only ever redirect. W5 makes
 * `/` a public marketing landing and adds it here.
 */
export const STATIC_ROUTES: readonly string[] = ['/login', '/privacy', '/terms']

export function siteRoutes(): readonly string[] {
  return STATIC_ROUTES
}

export function buildSitemap(lastModified: Date): MetadataRoute.Sitemap {
  return siteRoutes().map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified,
  }))
}
