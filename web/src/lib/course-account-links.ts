import { safeReturnPath } from './return-path';
import { ssoHandoffHref } from './family-links';

/** Course IDs are data, never redirect destinations. */
export function courseAccountLinks(courseId: string) {
  const next = encodeURIComponent('/course/' + encodeURIComponent(courseId));
  return { login: '/login?next=' + next, signup: '/login?mode=signup&next=' + next };
}

/** The hub receives an approved consumer URL, with a separately encoded local return. */
export function courseSsoHref(candidate: string | null): string {
  const receiver = new URL('/api/auth/sso', 'https://sikhiuni.com');
  receiver.searchParams.set('return', candidate === null ? '/dashboard.html' : safeReturnPath(candidate));
  return ssoHandoffHref(receiver.href);
}
