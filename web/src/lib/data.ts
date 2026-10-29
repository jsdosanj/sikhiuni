// Single source of content: the same courses.json the Worker serves.
import raw from '../../../site/assets/data/courses.json';
import { publicCourseCatalogue } from '../../../functions/api/_course-access.js';
import photos from '../../../site/assets/data/professors.json';

export type Term = { t: string; m: string };
export type Lesson = { title: string; summary?: string; html: string };
export type Quiz = { q: string; options: string[]; answer: number };
export type Course = {
  id: string; title: string; topic: string; level: number; professor: string;
  source?: string; aiCreated?: boolean; status: string; summary: string;
  outcomes?: string[]; terms?: Term[]; references?: string[];
  lessons?: Lesson[]; quiz?: Quiz[];
  // Institutional/paid-cohort course: full lesson/quiz content is intentionally
  // absent here (served only to entitled users via /api/course-content) — see
  // functions/api/admin/drafts-export.js.
  gated?: boolean;
  nQuiz?: number;
  sourceText?: { work: string; url: string; gurmukhi?: string; english?: string; sikhArchiveUrl?: string };
};
export type Topic = { id: string; name: string; blurb: string };
export type Path = { id: string; name: string; blurb: string; courseIds: string[] };

export const courses: Course[] = publicCourseCatalogue(raw).courses;
export const topics: Topic[] = (raw as any).topics;
export const paths: Path[] = (raw as any).paths || [];
export const professorPhotos: Record<string, { img: string; credit?: string; source?: string }> = photos as any;

export const published = courses.filter((c) => c.status === 'published');

export function topicName(id: string): string {
  const t = topics.find((x) => x.id === id);
  return t ? t.name : id;
}

// Values are icon names from web/src/lib/icons.ts (rendered via <Icon>/iconSvg).
export const TOPIC_ICONS: Record<string, string> = {
  theology: 'diya', philosophy: 'thought', history: 'scroll', literature: 'book', language: 'pen',
  spirituality: 'meditation', music: 'music', arts: 'palette', 'modern-skills': 'robot', reference: 'books',
  ethics: 'scales', rehat: 'lotus', comparative: 'globe',
  sociology: 'people', economics: 'coin', politics: 'pillar', parenting: 'child',
  apologetics: 'shield', science: 'microscope',
  finance: 'coin', gardening: 'sprout', 'mental-health': 'heart',
};

export function professorList() {
  const map: Record<string, Course[]> = {};
  for (const c of published) (map[c.professor] = map[c.professor] || []).push(c);
  return Object.keys(map)
    .sort((a, b) => (a === 'Sikhi University' ? 1 : b === 'Sikhi University' ? -1 : map[b].length - map[a].length))
    .map((name) => ({ name, courses: map[name] }));
}

const TITLES = /^(Prof\.|Dr\.|Bhai|Giani|Sant|Baba|Mahant|Pandit|Kavi|Swami|Sodhi|Subedar|Raja|Mata)\s+/i;
export function profInitials(name: string): string {
  const p = name.replace(TITLES, '').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}
const AV_PALETTE = ['#16335c', '#1d4e89', '#2f7d4f', '#8a5a14', '#5c3b8a', '#0f2547'];
export function avatarColor(name: string): string {
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997;
  return AV_PALETTE[h % AV_PALETTE.length];
}

export { PROF_BIOS, profBio } from './prof-bios';

export function profSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
export function professorBySlug(slug: string): string | undefined {
  return professorList().map((p) => p.name).find((n) => profSlug(n) === slug);
}
