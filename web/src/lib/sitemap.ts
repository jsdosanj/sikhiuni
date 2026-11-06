import { protectedLearningPath } from '../../../functions/api/_course-access.js';

// Shared helpers for the sitemap index + child sitemaps under /sitemaps/.
// The site is fully prerendered, so "last modified" is the build date — real,
// not hand-maintained (the old sitemap hardcoded a date that went stale).
export const BUILD_DATE = new Date().toISOString().slice(0, 10);

export type UrlEntry = {
  path: string;
  priority: string;
  lastmod?: string;
  // Google image-sitemap extension entries (absolute or site-relative locs).
  images?: { loc: string; title?: string }[];
};

export function siteBase(site: URL | undefined): string {
  return (site?.toString() || 'https://sikhiuni.com').replace(/\/$/, '');
}

// One invalid character in a <loc> makes search engines reject the WHOLE child
// sitemap, so every URL is entity-escaped (ids/slugs are catalogue data and
// could someday contain & or quotes).
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function urlsetXml(base: string, entries: UrlEntry[]): Response {
  // Reuse the serving policy so all child sitemaps omit sign-in-only content,
  // including new protected routes added to that policy in future.
  entries = entries.filter((entry) => !protectedLearningPath(entry.path));
  const hasImages = entries.some((e) => e.images && e.images.length);
  const imageXml = (e: UrlEntry) =>
    (e.images || [])
      .map(
        (im) =>
          `<image:image><image:loc>${xmlEscape(im.loc.startsWith('http') ? im.loc : base + im.loc)}</image:loc>${im.title ? `<image:title>${xmlEscape(im.title)}</image:title>` : ''}</image:image>`,
      )
      .join('');
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${hasImages ? ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"' : ''}>\n` +
    entries
      .map(
        (e) =>
          `  <url><loc>${xmlEscape(base + e.path)}</loc><lastmod>${e.lastmod || BUILD_DATE}</lastmod><priority>${e.priority}</priority>${imageXml(e)}</url>`,
      )
      .join('\n') +
    `\n</urlset>\n`;
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
}
