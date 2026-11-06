import { describe, expect, it } from 'vitest';
import { urlsetXml } from '../web/src/lib/sitemap';
import { protectedLearningPath } from '../functions/api/_course-access.js';
import { GET as pages } from '../web/src/pages/sitemaps/pages.xml';
import { GET as technology } from '../web/src/pages/sitemaps/technology.xml';

const base = 'https://sikhiuni.com';
const locations = (xml: string) => [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => new URL(m[1]).pathname);

describe('public sitemaps', () => {
  it('filters entries using the same policy that protects learning content', async () => {
    const paths = ['/catalog', '/technology/track/test', '/technology/lesson/test/one', '/technology/dojo/test', '/technology/capstone/test', '/technology/guide/test', '/institute/exam/test', '/departments/martial-arts/workshop/test', '/santhiya', '/muharni', '/baal-updesh', '/read', '/technology/lesson/test/one.html', '/technology/%6cesson/test/one'];
    const xml = await urlsetXml(base, paths.map(path => ({ path, priority: '0.5' }))).text();
    expect(locations(xml)).toEqual(paths.filter(path => !protectedLearningPath(path)));
    expect(xml).toContain('/catalog</loc>');
  });

  it.each([['pages', pages], ['technology', technology]] as const)('%s child contains public URLs only', async (_name, route) => {
    const response = await route({ site: new URL(base) } as any);
    const paths = locations(await response.text());
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.filter(protectedLearningPath)).toEqual([]);
    expect(paths).toContain(_name === 'pages' ? '/catalog' : '/technology');
  });
});
