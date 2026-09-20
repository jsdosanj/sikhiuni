import type { APIRoute } from 'astro';
import { tracks, trackSlug, capstones, schools } from '../../lib/institute';
import { siteBase, urlsetXml } from '../../lib/sitemap';
import capstoneBriefs from '../../data/institute/capstone/briefs.json';

// The Institute of Technology wing — /technology/*. The hub, the section
// pages, every track and lesson, the dojos and capstone briefs. The exam
// forms (/technology/exam/*), the personal certificate view and the lab demo
// stay out — thin / per-user / utility, and they carry noindex.
const lessonIndexes = import.meta.glob('../../data/institute/imported/*/index.json', { eager: true });

export const GET: APIRoute = ({ site }) => {
  const entries: { path: string; priority: string }[] = [
    { path: '/technology', priority: '0.9' },
    { path: '/technology/catalog', priority: '0.7' },
    { path: '/technology/explore', priority: '0.6' },
    { path: '/technology/resources', priority: '0.6' },
    { path: '/technology/atlas', priority: '0.6' },
    { path: '/technology/licenses', priority: '0.4' },
    { path: '/technology/guide/claude-code', priority: '0.7' },
    { path: '/technology/claude', priority: '0.7' },
  ];

  for (const s of schools) {
    entries.push({ path: `/technology/school/${s.slug}`, priority: '0.8' });
  }

  for (const t of tracks) {
    if (t.status !== 'published') continue;
    entries.push({ path: `/technology/track/${trackSlug(t)}`, priority: '0.7' });
    if (t.kind === 'dojo') entries.push({ path: `/technology/dojo/${t.id}`, priority: '0.6' });
  }

  for (const b of (capstoneBriefs as { briefs: { slug: string }[] }).briefs) {
    if (capstones.some((c) => c.status === 'published')) {
      entries.push({ path: `/technology/capstone/${b.slug}`, priority: '0.6' });
    }
  }

  for (const [file, mod] of Object.entries(lessonIndexes)) {
    const m = file.match(/imported\/([^/]+)\/index\.json$/);
    if (!m) continue;
    const idx = (mod as any).default ?? mod;
    for (const l of idx.lessons || []) {
      entries.push({ path: `/technology/lesson/${m[1]}/${l.slug}`, priority: '0.5' });
    }
  }

  return urlsetXml(siteBase(site), entries);
};
