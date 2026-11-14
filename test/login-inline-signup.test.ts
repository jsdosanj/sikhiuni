import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('../web/src/pages/login.astro', import.meta.url), 'utf8');
function fixture() {
  const nodes = new Map<string, any>();
  function node(id: string) {
    if (!nodes.has(id)) {
      const classes = new Set<string>();
      const listeners = new Map<string, Function>();
      nodes.set(id, { value: '', checked: false, disabled: false, textContent: '', innerHTML: '',
        classList: { toggle: (name: string, on: boolean) => on ? classes.add(name) : classes.delete(name), contains: (name: string) => classes.has(name) },
        setAttribute: vi.fn(), addEventListener: (event: string, fn: Function) => listeners.set(event, fn),
        fire: (event: string) => listeners.get(event)?.({ preventDefault() {} }),
      });
    }
    return nodes.get(id);
  }
  const fetch = vi.fn();
  const location = { search: '', href: '/login.html' };
  const script = source.match(/<script>([\s\S]*?)<\/script>/)![1].replace(/import \{ safeReturnPath \} from [^;]+;/, 'const safeReturnPath = () => "/dashboard.html";').replace(/import \{ courseSsoHref \} from [^;]+;/, 'const courseSsoHref = () => "https://sikhi.io";');
  runInNewContext(transformSync(script, { loader: 'ts' }).code, { document: { getElementById: node }, location, URLSearchParams, fetch });
  node('mode-toggle').fire('click');
  node('reg-username').value = 'harjit';
  node('reg-email').value = 'dummy@example.test';
  const respond = (ok: boolean, data: unknown) => fetch.mockResolvedValueOnce({ ok, json: async () => data });
  return { node, fetch, location, respond, submit: () => node('password-form').fire('submit') };
}

describe('signup resend recovery', () => {
  it('recovers from resend network failure without losing the inline form', async () => {
    const f = fixture();
    f.respond(true, {}); await f.submit();
    f.node('reg-code').value = '123456';
    f.fetch.mockRejectedValueOnce(new Error('offline'));
    await f.node('reg-resend').fire('click');
    expect(f.node('password-btn').disabled).toBe(false);
    expect(f.node('out').innerHTML).toContain('Network error. Please try again.');
    expect(f.node('reg-step-2').classList.contains('hidden')).toBe(false);
    expect(f.node('reg-code').value).toBe('123456');
    expect(f.location.href).toBe('/login.html');
  });
});

describe('signup submit network recovery', () => {
  it.each(['signin', 'details', 'code'])('keeps form usable after %s failure', async step => {
    const f = fixture();
    if (step === 'signin') { f.node('mode-toggle').fire('click'); f.node('identifier').value = 'dummy@example.test'; f.node('password').value = 'unchanged'; }
    if (step === 'code') { f.respond(true, {}); await f.submit(); f.node('reg-code').value = '123456'; }
    f.fetch.mockRejectedValueOnce(new Error('offline'));
    await f.submit();
    expect(f.node('password-btn').disabled).toBe(false);
    expect(f.node('out').innerHTML).toContain('Network error. Please try again.');
    expect(f.location.href).toBe('/login.html');
    if (step === 'code') expect(f.node('reg-code').value).toBe('123456');
  });
});
