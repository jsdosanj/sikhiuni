import { describe, expect, it } from 'vitest';
import { courseAccountLinks, courseSsoHref } from '../web/src/lib/course-account-links';
import { safeReturnPath } from '../web/src/lib/return-path';
describe('course welcome account actions', () => {
 it('returns both account modes to the same local course', () => {
  const links = courseAccountLinks('japji-100');
  for (const href of Object.values(links)) {
   const url = new URL(href, 'https://sikhiuni.com');
   expect(safeReturnPath(url.searchParams.get('next'))).toBe('/course/japji-100');
  }
  expect(new URL(links.signup, 'https://sikhiuni.com').searchParams.get('mode')).toBe('signup');
 });
 it('encodes untrusted IDs and rejects encoded redirect separators', () => {
  const next = new URL(courseAccountLinks('//evil.test?x=1').login, 'https://sikhiuni.com').searchParams.get('next');
  expect(next).toBe('/course/%2F%2Fevil.test%3Fx%3D1');
  expect(safeReturnPath(next)).toBe('/dashboard');
 });
});

it('preserves a legitimate encoded unicode course identifier', () => {
 const id='ਪੰਜਾਬੀ ਪਾਠ';
 const next=new URL(courseAccountLinks(id).login,'https://sikhiuni.com').searchParams.get('next');
 expect(safeReturnPath(next)).toBe('/course/'+encodeURIComponent(id));
});

describe('course SSO destination', () => {
 it('keeps a local course destination through both encoded SSO hops', () => {
  const hub = new URL(courseSsoHref('/course/ai-foundations?view=one#lesson-2'));
  expect(hub.origin).toBe('https://sikhi.io');
  const receiver = new URL(hub.searchParams.get('return')!);
  expect(receiver.origin).toBe('https://sikhiuni.com');
  expect(receiver.pathname).toBe('/api/auth/sso');
  expect(receiver.searchParams.get('return')).toBe('/course/ai-foundations?view=one#lesson-2');
 });
 it.each(['https://evil.test', '//evil.test', '/\\evil.test'])('rejects offsite SSO destinations %s', candidate => {
  const hub = new URL(courseSsoHref(candidate));
  expect(new URL(hub.searchParams.get('return')!).searchParams.get('return')).toBe('/dashboard');
 });
 it('preserves the established default dashboard when next is absent', () => {
  const hub = new URL(courseSsoHref(null));
  expect(new URL(hub.searchParams.get('return')!).searchParams.get('return')).toBe('/dashboard.html');
 });
});
