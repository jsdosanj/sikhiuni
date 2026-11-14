import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { selectedLesson, lessonBookmarkKey } from '../web/src/lib/focused-course';
describe('focused course selection', () => {
 it('validates hashes and preserves lesson zero', () => {
  expect(selectedLesson('#lesson-0', 3, 2)).toBe(0);
  expect(selectedLesson('#lesson-2', 3, 0)).toBe(2);
  for (const hash of ['#lesson--1', '#lesson-99', '#lesson-1x', '#other']) expect(selectedLesson(hash, 3, 1)).toBe(1);
 });
 it('clamps resumes and handles empty courses', () => {
  expect(selectedLesson('', 3, 99)).toBe(2);
  expect(selectedLesson('', 0, 99)).toBe(-1);
 });
 it('separates local bookmarks by course', () => {
  expect(lessonBookmarkKey('japji')).not.toBe(lessonBookmarkKey('ai'));
 });
});

describe('public course shell', () => {
 const source = readFileSync(new URL('../web/src/pages/course/[id].astro', import.meta.url), 'utf8');
 it('has one ordinary content request and no anonymous lesson dock or sign-in placeholders', () => {
  expect(source.match(/const initialCourse =/g)).toHaveLength(1);
  expect(source).not.toContain('Sign in to read this lesson.');
  expect(source).not.toContain('id="lq-dock"');
  expect(source).toContain('id="focused-lessons" class="mb-8" hidden={!c.gated}');
  expect(source).toContain('id="course-tools" class="wrap pb-14" hidden');
 });
});

describe('small mobile university navigation', () => {
 const nav=readFileSync(new URL('../web/src/components/Nav.astro',import.meta.url),'utf8');
 it('fits narrow phones while retaining a 44px menu target',()=>{
  expect(nav).toContain('@media (max-width:360px)');
  expect(nav).toContain('font-size:20px !important');
  expect(nav).toContain('width:44px; height:44px');
 });
});
