// Markdown -> lesson HTML for the AISF import pipeline (scripts/sync-aisf.mjs).
// The input is the published "AI Engineering from Scratch" curriculum (MIT), not
// user content — but we still scrub defensively.
//
//   ```mermaid        -> <pre class="mermaid"> (rendered client-side, lazily,
//                        from jsDelivr — the /technology/* CSP allows it)
//   ```figure NAME    -> a "see the interactive diagram in the source" note
//   ```lang           -> <pre><code class="language-lang"> (Prism-ready)
//   ![alt](../assets/x.svg) -> <figure> with the svg served from
//                        /technology-figures/x.svg (sync-aisf copies the file);
//                        the returned `assets` list tells it which
//   everything else   -> marked, GFM on
import { marked } from 'marked';

// Where the imported lesson figures are served from (sync-aisf.mjs copies the
// referenced SVGs into web/public/technology-figures/).
const FIG_BASE = '/technology-figures/';

/** Split the lesson doc into { title, tagline, meta, objectives, bodyMd }. */
export function parseLessonDoc(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  let title = '';
  while (i < lines.length && !title) {
    const m = lines[i].match(/^#\s+(.+?)\s*$/);
    if (m) title = m[1];
    i++;
  }
  let tagline = '';
  // an optional "> ..." blockquote right after the title
  while (i < lines.length && lines[i].trim() === '') i++;
  if (lines[i] && /^>\s?/.test(lines[i])) {
    tagline = lines[i].replace(/^>\s?/, '').trim();
    i++;
  }

  // the "**Type:** … **Languages:** … **Prerequisites:** … **Time:** …" block
  const meta = {};
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t === '') { i++; continue; }
    const m = t.match(/^\*\*(Type|Languages|Prerequisites|Time)\:\*\*\s*(.+?)\s*$/);
    if (!m) break;
    meta[m[1].toLowerCase()] = m[2];
    i++;
  }

  // ## Learning Objectives  -> the "- " list that follows
  const objectives = [];
  const objIdx = lines.findIndex((l, k) => k >= i && /^##\s+Learning Objectives\s*$/i.test(l));
  let bodyStart = i;
  if (objIdx !== -1) {
    let k = objIdx + 1;
    while (k < lines.length && lines[k].trim() === '') k++;
    while (k < lines.length && /^\s*[-*]\s+/.test(lines[k])) {
      objectives.push(lines[k].replace(/^\s*[-*]\s+/, '').trim());
      k++;
    }
    bodyStart = k;
  }

  const bodyMd = lines.slice(bodyStart).join('\n').trim();
  return { title, tagline, meta, objectives, bodyMd };
}

/** Convert a lesson body (markdown) to sanitized HTML. */
export function bodyToHtml(bodyMd) {
  const figures = [];

  const renderer = new marked.Renderer();
  renderer.code = ({ text, lang }) => {
    const l = (lang || '').trim().toLowerCase();
    if (l === 'mermaid') {
      // mermaid wants <br/> not literal \n inside node labels
      const src = text.replace(/\\n/g, '<br/>');
      return `<pre class="mermaid">${escapeHtml(src)}</pre>\n`;
    }
    if (l === 'figure') {
      const name = text.trim().split('\n')[0];
      figures.push(name);
      return `<p class="i-lesson-figure"><em>Diagram <code>${escapeHtml(name)}</code> — see the interactive version in the <a href="https://aiengineeringfromscratch.com">source lesson</a>.</em></p>\n`;
    }
    const cls = l ? ` class="language-${l}"` : '';
    return `<pre><code${cls}>${escapeHtml(text)}\n</code></pre>\n`;
  };

  marked.use({ gfm: true, breaks: false });
  let html = marked.parse(bodyMd, { renderer });
  html = scrub(html);

  // ---- image assets: ![alt](../assets/x.svg) -> a served <figure> ----------
  // marked emits <img src="../assets/x.svg" ...> — a relative path that 404s on
  // our site. Rewrite to /technology-figures/x.svg (sync-aisf copies the file)
  // and wrap in a <figure> with the alt as the caption. Non-svg / absolute /
  // remote images are left alone.
  const assets = [];
  html = html.replace(
    /<img\b[^>]*?src=(["'])([^"']+?)\1[^>]*>/gi,
    (tag, _q, src) => {
      const m = src.match(/(?:^|\/)assets\/([\w.-]+\.svg)$/i);
      if (!m) return tag;
      const name = m[1];
      if (!assets.includes(name)) assets.push(name);
      const altM = tag.match(/alt=(["'])([^"']*)\1/i);
      const alt = altM ? altM[2] : '';
      return (
        `<figure class="i-lesson-fig">` +
        `<img src="${FIG_BASE}${name}" alt="${escapeHtml(alt)}" loading="lazy">` +
        (alt ? `<figcaption>${escapeHtml(alt)}</figcaption>` : '') +
        `</figure>`
      );
    },
  );

  // ---- defuse links marked over-eagerly created --------------------------
  html = html
    // "mAP@0.5" etc. -> autolinked as mailto:. Unwrap anything that isn't a
    // real-looking address.
    .replace(
      /<a\b[^>]*?href=(["'])mailto:([^"']+)\1[^>]*>(.*?)<\/a>/gi,
      (whole, _q, addr, inner) =>
        /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(addr) ? whole : inner,
    )
    // cross-lesson refs into the AISF source tree (".../docs/en.md", "../../NN-slug/")
    // — no such path here. Keep the link text, drop the dead href.
    .replace(
      /<a\b[^>]*?href=(["'])((?:\.\.?\/)[^"']*?(?:\/docs\/en\.md|\/)?)\1[^>]*>(.*?)<\/a>/gi,
      (whole, _q, href, inner) =>
        /^(?:\.\.?\/)/.test(href) && !/^\.\.?\/assets\//.test(href) ? inner : whole,
    )
    // external links open in a new tab, safely
    .replace(
      /<a\b([^>]*?)href=(["'])(https?:\/\/[^"']+)\2([^>]*?)>/gi,
      (whole, pre, q, href, post) =>
        /target=/i.test(whole) ? whole : `<a${pre}href=${q}${href}${q}${post} target="_blank" rel="noopener">`,
    )
    // marked wraps the image in <p>; a block <figure> inside <p> is invalid — unwrap.
    .replace(/<p>\s*(<figure class="i-lesson-fig">[\s\S]*?<\/figure>)\s*<\/p>/gi, '$1');

  return { html, figures, assets, hasMermaid: /class="mermaid"/.test(html) };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Defensive scrub: drop anything scriptable that survived marked. */
function scrub(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<(iframe|object|embed|link|meta|base)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/(href|src)\s*=\s*"(?:\s*javascript:|\s*data:(?!image\/))/gi, '$1="#')
    .replace(/(href|src)\s*=\s*'(?:\s*javascript:|\s*data:(?!image\/))/gi, "$1='#");
}
