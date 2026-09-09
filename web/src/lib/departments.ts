// Academic departments — a grouping layer over the course topics. Data in
// web/src/data/departments.json; topics + courses come from lib/data.ts.
import raw from '../data/departments.json';
import { published, topics, topicName, type Course } from './data';

export interface Pillar {
  title: string;
  body: string;
}
export interface DeptImage {
  position?: string;
  license?: string;
  licenseUrl?: string;
  src: string;
  credit: string;
  source: string;
}
export interface CurriculumSection {
  heading: string;
  body: string[];
  list?: { term: string; detail: string }[];
}
export interface CurriculumTopic {
  id: string;
  name: string;
  icon: string;
  summary: string;
  sections: CurriculumSection[];
}
export interface Department {
  id: string;
  name: string;
  slug: string;
  topics: string[];
  accent: string;
  tagline: string;
  blurb: string;
  stance: string;
  pillars: Pillar[];
  featured: string[];
  image: DeptImage;
  // A standalone department has no course catalogue yet: it renders a bespoke
  // page from `curriculum` instead of the shared DeptSections, and shows
  // `catalogueNote` wherever a course count would normally go.
  standalone?: boolean;
  catalogueNote?: string;
  curriculum?: CurriculumTopic[];
  caveat?: string;
  sources?: { label: string; url: string }[];
  book?: { title: string; authors: string; note: string; url: string };
}
export interface Wing {
  id: string;
  name: string;
  href: string;
  accent: string;
  tagline: string;
  blurb: string;
  image?: DeptImage;
}

export const departments: Department[] = (raw as any).departments;
export const wing: Wing = (raw as any).wing;

// topic id -> department (every topic belongs to exactly one). Built once.
const topicToDept = new Map<string, Department>();
for (const d of departments) for (const t of d.topics) topicToDept.set(t, d);

// Fail the build loudly if a topic is orphaned or double-mapped — the nav and
// /departments pages assume total, non-overlapping coverage.
{
  const seen = new Set<string>();
  for (const d of departments) {
    for (const t of d.topics) {
      if (seen.has(t)) throw new Error(`departments.json: topic "${t}" is in more than one department`);
      seen.add(t);
    }
  }
  for (const t of topics) {
    if (!seen.has(t.id)) throw new Error(`departments.json: topic "${t.id}" is not in any department`);
  }
  const slugs = new Set(departments.map((d) => d.slug));
  if (slugs.size !== departments.length) throw new Error('departments.json: duplicate slug');
}

// Academic schools shown on the homepage portal + /departments (the tech wing
// is counted separately). Spelled out for the "N schools, one university" copy.
const COUNT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const schoolCount = departments.length;
export const schoolCountWord =
  (COUNT_WORDS[schoolCount] ?? String(schoolCount)).replace(/^./, (c) => c.toUpperCase());

// Label for a department's "front door" — a course count, or the standalone note.
export const departmentEntryLabel = (d: Department): string =>
  d.standalone && d.catalogueNote ? d.catalogueNote : `${departmentCourseCount(d)} courses`;

export const departmentOf = (topicId: string): Department | undefined => topicToDept.get(topicId);
export const departmentBySlug = (slug: string): Department | undefined =>
  departments.find((d) => d.slug === slug);

export const coursesInDepartment = (d: Department): Course[] =>
  published.filter((c) => d.topics.includes(c.topic));

export const departmentCourseCount = (d: Department): number => coursesInDepartment(d).length;

// Topics of a department, with their course counts, biggest first.
export const departmentTopics = (d: Department): { id: string; name: string; count: number }[] =>
  d.topics
    .map((id) => ({
      id,
      name: topicName(id),
      count: published.filter((c) => c.topic === id).length,
    }))
    .sort((a, b) => b.count - a.count);
