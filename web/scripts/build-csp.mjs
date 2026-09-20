// Harden the CSP: replace `script-src '... unsafe-inline'` with an exact SHA-256 hash of
// every EXECUTABLE inline <script> in the built site, so injected inline scripts (the XSS
// amplifier) can no longer run. Runs AFTER `astro build`, reading the exact bytes that
// ship, so the hash set is always complete and self-maintaining — change a script and the
// next build recomputes it. Non-executable data blocks (application/ld+json, /json) are
// NOT hashed: browsers don't execute them, so script-src never blocks them. `style-src`
// keeps 'unsafe-inline' because inline style="" attributes (2000+ of them) cannot be
// hashed by CSP. Fails LOUD (non-zero exit) if _headers is missing, so a silent
// regression can't ship an un-hardened policy.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.html')) out.push(p);
  }
  return out;
}

const HEADERS = 'dist/_headers';
let hdr;
try { hdr = readFileSync(HEADERS, 'utf-8'); }
catch { console.error('build-csp: dist/_headers not found — did astro build run?'); process.exit(1); }

const hashes = new Set();
const scriptRe = /<script([^>]*)>([\s\S]*?)<\/script>/g;
for (const f of walk('dist')) {
  const html = readFileSync(f, 'utf-8');
  let m;
  while ((m = scriptRe.exec(html)) !== null) {
    const attrs = m[1], body = m[2];
    if (/\bsrc=/.test(attrs)) continue;                                   // external — covered by 'self'
    if (!body.trim()) continue;                                           // empty
    if (/type\s*=\s*["'](application\/(ld\+json|json))/i.test(attrs)) continue; // data, not executed
    hashes.add(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
  }
}

if (!hashes.size) { console.error('build-csp: no inline scripts found — refusing to write an empty script-src'); process.exit(1); }
// Match script-src ONLY on the real Content-Security-Policy header line, not
// anywhere in the file — a comment mentioning "script-src" (e.g. explaining
// this very hardening) ABOVE that line previously got matched first and
// silently left the real directive un-hardened (confirmed live 2026-09-05:
// the placeholder 'unsafe-inline' shipped to production instead of the real
// hash allowlist). /m so ^ anchors to the header line specifically.
const CSP_LINE_RE = /^(\s*Content-Security-Policy:.*?)script-src[^;]*/m;
if (!CSP_LINE_RE.test(hdr)) { console.error('build-csp: no script-src directive on a Content-Security-Policy line in _headers to harden'); process.exit(1); }

// 'wasm-unsafe-eval' (NOT 'unsafe-eval' -- a much narrower CSP-3 directive
// that permits ONLY WebAssembly.instantiate, no string-eval'd JS at all) is
// required by <model-viewer>'s glTF texture transcoder (KTX2/Basis textures
// decode via a WASM module) -- without it every texture on the crest/emblem
// 3D models silently fails to load (THREE.GLTFLoader logs "Couldn't load
// texture", the model renders as a flat white silhouette). Found live on
// sikhiuni.com 2026-09-05: the crest had rendered correctly in every local/
// dev check because dev servers don't enforce this hardened CSP at all --
// only a real deployed build does.
// https://static.cloudflareinsights.com is Cloudflare's own Web Analytics
// beacon, injected at the edge (not a script this repo authors) -- allowed
// as a real external source alongside the hashed inline scripts, same as
// 'wasm-unsafe-eval' above. Found live 2026-09-06: this const used to
// rebuild script-src from just 'self' + 'wasm-unsafe-eval' + hashes,
// silently dropping any other literal source someone added to the
// _headers template (including this one, the first time it was added).
const scriptSrc = "script-src 'self' 'wasm-unsafe-eval' https://static.cloudflareinsights.com " + [...hashes].sort().join(' ');
hdr = hdr.replace(CSP_LINE_RE, `$1${scriptSrc}`);

// Cloudflare's API rejects any _headers line over 2000 characters — and only at
// DEPLOY time, after CI is already green. Fail the build here instead. If this
// trips, too many scripts are being inlined into HTML: astro.config.mjs sets
// vite build.assetsInlineLimit 0 to keep hoisted scripts external ('self');
// only deliberate is:inline scripts should contribute hashes.
const CF_LINE_LIMIT = 2000;
const over = hdr.split('\n').filter((l) => l.length > CF_LINE_LIMIT);
if (over.length) {
  console.error(`build-csp: _headers line exceeds Cloudflare's ${CF_LINE_LIMIT}-char limit (${over[0].length} chars, ${hashes.size} hashes) — deploy would fail`);
  process.exit(1);
}

writeFileSync(HEADERS, hdr);
console.log(`build-csp: hardened script-src with ${hashes.size} inline-script hashes (unsafe-inline removed from scripts; kept for styles)`);
