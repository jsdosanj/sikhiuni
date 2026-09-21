import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const read = (file: string) => readFileSync(new URL(`../web/src/${file}`, import.meta.url), 'utf8');

describe('current campus navigation and dashboard contract', () => {
  it('links desktop and mobile navigation to the learning workspace', () => {
    expect(read('components/Nav.astro').match(/href="\/dashboard"/g)?.length).toBeGreaterThanOrEqual(2);
  });
  it('renders each child dashboard route through its matching section', () => {
    const dashboard = read('pages/dashboard.astro');
    expect(dashboard).toContain("Astro.props.section || 'studio'");
    expect(dashboard).toContain("section === 'studio' && <LearningStudio");
    expect(dashboard).toContain("section === 'library' && <LearningLibrary");
    for (const section of ['focus', 'learning', 'library', 'profile']) {
      expect(read(`pages/dashboard/${section}.astro`)).toContain(`<Dashboard section="${section}"`);
      expect(dashboard).toContain(`section === '${section}'`);
      expect(dashboard).toContain(`/dashboard/${section}`);
    }
  });
  it('routes teacher roles to the section that loads the account dashboard', () => {
    expect(read('components/Nav.astro')).toContain('/dashboard/learning?view=teacher');
    expect(read('pages/dashboard.astro')).not.toContain('/dashboard?demo=');
    expect(read('pages/dashboard.astro')).toContain('href="/dashboard/learning${v');
    expect(read('pages/dashboard.astro')).not.toContain('href="/dashboard${v');
  });
  it('keeps signup privilege intent removed while retaining registration verification', () => {
    const login = read('pages/login.astro');
    expect(login).not.toContain('value="teacher"');
    expect(login).not.toContain('su_v1_signup_intent');
    expect(login).toContain('/api/auth/register-complete');
    expect(login).toContain('/dashboard.html');
  });
});
