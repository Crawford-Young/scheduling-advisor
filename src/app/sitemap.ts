import type { MetadataRoute } from 'next'

import { buildSitemap } from '@/lib/site-routes'

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap(new Date())
}
