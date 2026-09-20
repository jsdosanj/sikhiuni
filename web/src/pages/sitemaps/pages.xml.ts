import type { APIRoute } from 'astro';
import { siteBase, urlsetXml } from '../../lib/sitemap';
import deptData from '../../data/departments.json';
import { workshops } from '../../data/workshops';

// Static content pages. Priority reflects how central a page is to the site;
// admin/auth/utility routes (login, dashboard, admin, verify, etc.) are
// intentionally excluded — they're not indexable content.
const STATIC_PATHS: [string, string][] = [
  ['/', '1.0'],
  ['/catalog', '0.9'],
  ['/departments', '0.9'],
  ['/programs', '0.8'],
  ['/professors', '0.7'],
  ['/about', '0.7'],
  ['/integrity', '0.6'],
  ['/search', '0.5'],
  ['/santhiya', '0.7'],
  ['/muharni', '0.6'],
  ['/baal-updesh', '0.6'],
  ['/teach', '0.5'],
  ['/ai-policy', '0.3'],
  ['/legal', '0.3'],
];

// The homepage entry carries the brand images (Google image-sitemap extension)
// so crawlers pick up the crest logo and social card alongside the JSON-LD
// Organization.logo in Base.astro.
const HOME_IMAGES = [
  { loc: '/assets/logo.png', title: 'Sikhi University logo' },
  { loc: '/assets/og-image.png', title: 'Sikhi University — free, open learning in Sikhi' },
];

const DEPT_PATHS: [string, string][] = (deptData as any).departments.map(
  (d: { slug: string }) => [`/departments/${d.slug}`, '0.8'],
);

// The Wootz Workshop and any siblings live under the Department of Martial Arts.
const WORKSHOP_PATHS: [string, string][] = [
  ['/departments/martial-arts/workshop', '0.6'],
  ...workshops.map((w): [string, string] => [`/departments/martial-arts/workshop/${w.slug}`, '0.6']),
];

export const GET: APIRoute = ({ site }) =>
  urlsetXml(
    siteBase(site),
    [...STATIC_PATHS, ...DEPT_PATHS, ...WORKSHOP_PATHS].map(([path, priority]) => ({
      path,
      priority,
      images: path === '/' ? HOME_IMAGES : undefined,
    })),
  );
