import type { APIRoute } from 'astro';
import { professorList, profSlug, isThinProfessor, profBio } from '../../lib/data';
import { siteBase, urlsetXml, professorLastmod } from '../../lib/sitemap';

export const GET: APIRoute = ({ site }) =>
  urlsetXml(
    siteBase(site),
    professorList()
      .filter(({ name, courses }) => !isThinProfessor(name, courses.length))
      .map(({ name, courses }) => ({ path: `/professor/${profSlug(name)}`, priority: '0.5', lastmod: professorLastmod(profSlug(name), profBio(name), courses) })),
  );
