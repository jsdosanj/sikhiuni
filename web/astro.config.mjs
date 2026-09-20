import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// Static build; the existing Cloudflare Worker serves the output and handles /api/*.
export default defineConfig({
  site: 'https://sikhiuni.com',
  outDir: './dist',
  build: { format: 'file' },
  redirects: {
    // The Language & Literature department split into two schools (2026-08).
    '/departments/language-and-literature': '/departments/language',
    // The Wootz Workshop moved from the Institute of Technology to the
    // Department of Martial Arts, where it belongs (2026-08).
    '/technology/workshop': '/departments/martial-arts/workshop',
    '/technology/workshop/[slug]': '/departments/martial-arts/workshop/[slug]',
  },
  // assetsInlineLimit 0: never inline bundled scripts into HTML. Every hoisted
  // script ships as an external file (covered by CSP script-src 'self'), so
  // build-csp only hashes the few deliberate is:inline pre-paint scripts —
  // Cloudflare rejects any _headers line over 2000 chars, and 31 inlined-script
  // hashes blew past that at deploy time.
  vite: {
    plugins: [tailwindcss()],
    build: { assetsInlineLimit: 0 },
    // The Code Lab's runner workers get a STABLE path (/_lab/…, no content
    // hash) so worker.js + wrangler `run_worker_first` can hand them a
    // widened CSP: the JS runner needs 'unsafe-eval' (new Function on the
    // learner's snippet), the Python runner loads Pyodide from jsDelivr.
    worker: {
      format: 'es',
      rollupOptions: {
        output: { entryFileNames: '_lab/[name].js', chunkFileNames: '_lab/[name].js' },
      },
    },
  },
});
