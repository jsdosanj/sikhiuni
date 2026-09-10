// Institute of Technology — content access. Companion to lib/data.ts.
// The manifest is the spine; lesson bodies + dojo scripts load lazily at
// runtime (from R2 via /media/institute/… in prod, /data/institute/… in dev —
// wired in Wave 4). Nothing here pulls a lesson body at build time.
import manifest from '../data/institute/manifest.json';
import professorsRaw from '../data/institute/professors.json';

export type TrackKind = 'phase' | 'dojo' | 'guide' | 'capstone' | 'path';
export type TrackStatus = 'planned' | 'draft' | 'published';
export type SchoolId = 'ai' | 'cyber' | 'it' | 'design';

/** A sub-school of the Institute. All are declared in manifest.schools. */
export interface School {
  id: SchoolId;
  slug: string;
  title: string;
  label: string;
  /** A monospace type mark — the schools' equivalent of the booth motifs. */
  mark: string;
  tagline: string;
  blurb: string;
}

export interface Track {
  id: string;
  kind: TrackKind;
  school: SchoolId;
  source: 'aisf' | 'sikhi.io' | 'ours' | 'acsu' | 'niccs';
  title: string;
  summary: string;
  level: number;
  prereq: string | null;
  status: TrackStatus;
  license: string;
  professor: string;
  num?: number;
  slug?: string;
  lessonCount?: number;
  topicCount?: number;
  projectCount?: number;
  moduleCount?: number;
  engine?: 'terminal' | 'dojo';
}

/** A module of a `path` track — our teaching note plus the free labs it sends you to. */
export interface PathLab {
  title: string;
  provider: string;
  href: string;
  cost: string;
}
/**
 * A named framework reproduced inside a module — a numbered risk list, a
 * control set. Only for sources whose licence permits it (the OWASP Agentic
 * Skills Top 10 is CC BY-SA 4.0, the same licence our paths carry); anything
 * more restrictive stays a link in `labs`. `note` carries the attribution the
 * licence requires, and is rendered, not just stored.
 */
export interface PathChecklist {
  label: string;
  note: string;
  items: { id: string; title: string; note: string }[];
}

export interface PathModule {
  num: number;
  slug: string;
  title: string;
  objective: string;
  teach: string;
  checklist?: PathChecklist;
  labs: PathLab[];
}
export interface PathTrack {
  track: string;
  school: SchoolId;
  blurb: string;
  license: string;
  /** Verb for the upstream credit line — not every path *adapts* its source. */
  creditLabel?: string;
  adaptedFrom: { name: string; href: string; license: string; note: string };
  /** A standing caution shown above the modules (e.g. labs that bill your cloud account). */
  warning?: string;
  modules: PathModule[];
  bench: { title: string; provider: string; href: string; note: string }[];
}

export interface Booth {
  id: string;
  title: string;
  kind: 'booth';
  href: string;
  wave: string;
  blurb: string;
}

export interface Resource {
  id: string;
  title: string;
  kind: 'list' | 'book' | 'course';
  category: 'lists' | 'books' | 'courses';
  href: string;
  author: string;
  price: string;
  blurb: string;
}

export interface InstituteProfessor {
  name: string;
  kind: 'person' | 'org';
  role: string;
  bio: string;
  links: { label: string; href: string }[];
  license: string;
}

export const WEDGE: string = (manifest as any).wedge;
export const SHIP_SHAPE: string = (manifest as any).shipShape;
export const tracks: Track[] = (manifest as any).tracks;
export const explore: Booth[] = (manifest as any).explore;
export const resources: Resource[] = (manifest as any).resources;
export const deferred = (manifest as any).deferred as {
  phases: string[];
  atlas: string;
  booths: string[];
};
export const professors: Record<string, InstituteProfessor> = professorsRaw as any;

export const schools: School[] = (manifest as any).schools;

export const phases = tracks.filter((t) => t.kind === 'phase').sort((a, b) => (a.num ?? 0) - (b.num ?? 0));
export const dojos = tracks.filter((t) => t.kind === 'dojo');
export const guides = tracks.filter((t) => t.kind === 'guide');
export const capstones = tracks.filter((t) => t.kind === 'capstone');
/** Every `path` track, in order. Scope with `pathsOf` — two schools use them. */
export const paths = tracks.filter((t) => t.kind === 'path').sort((a, b) => (a.num ?? 0) - (b.num ?? 0));

export const trackById = (id: string): Track | undefined => tracks.find((t) => t.id === id);
export const professorOf = (t: Track): InstituteProfessor | undefined => professors[t.professor];
export const tracksOf = (id: SchoolId): Track[] => tracks.filter((t) => t.school === id);
/** One school's `path` tracks, in order. */
export const pathsOf = (id: SchoolId): Track[] => paths.filter((t) => t.school === id);

/** Route slug for a track's overview page: /technology/track/<slug>. */
export const trackSlug = (t: Track): string =>
  (t.kind === 'phase' || t.kind === 'path') && t.slug ? t.slug : t.id;

// Gurmukhi run wrapping (DESIGN-INSTITUTE.md §Non-negotiables) is site-wide,
// not Institute-only — the department heroes and course cards need it too.
// Re-exported here so existing Institute imports keep working.
export { gurmukhiHtml } from './gurmukhi';

/** Total planned lessons across the built spine (for the "N lessons" copy). */
export const totalLessons: number = phases.reduce((n, p) => n + (p.lessonCount ?? 0), 0);
