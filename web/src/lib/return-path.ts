export function safeReturnPath(candidate: string | null): string {
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) return '/dashboard';
  try {
    const url = new URL(candidate, 'https://sikhiuni.com');
    return url.origin === 'https://sikhiuni.com' ? url.pathname + url.search + url.hash : '/dashboard';
  } catch { return '/dashboard'; }
}
