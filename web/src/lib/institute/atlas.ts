// The Open Source Atlas island (/technology/atlas). Client-only on purpose —
// 12.5k repos is far too much for one payload, so it pages through committed
// chunk-NNN.json files and pulls the full corpus only once someone searches or
// picks a topic.
//
// Ported from redroyals/sikhi.io pages/opensource.tsx to a vanilla-TS island.
// Two halves, deliberately unpaired: the video shelf (what to watch) and the
// repo catalogue (what to build with — every card carries a line on what it
// could do for the Panth).
//
// Three states, one grid:
//   no filter   → page through the chunks, 24 at a time, in catalogue order
//   a search    → rank the whole corpus, page through the matches
//   a topic     → filter the whole corpus, page through the matches
// Search and topic compose. All three are reflected in the URL so a result is
// something you can send to somebody.

const DATA = '/data/institute/atlas';
const PAGE_SIZE = 24;
const PER_CHUNK = 250;

interface Repo { r: string; s?: string; d?: string; p?: string; u?: string }
interface Video { id: string; title: string; published?: string; views?: number; ch?: string }
interface Channel { key: string; name: string; url: string; channelId?: string }
interface Topic { k: string; label: string; n: number }
interface Index {
  generated: string;
  total: number;
  chunks: number;
  newest?: string;
  topics?: Topic[];
  videos: Video[];
  sources: { repos: { name: string; url: string }; channels: Channel[] };
}

/** search.json row: [repo, summary, build-line, date, topic bitmask]. */
type SearchRow = [string, string, string, string, number];

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

const ogCard = (repo: string) => `https://opengraph.githubassets.com/1/${repo}`;
const ytThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const nfmt = (n: number) => n.toLocaleString('en-US');

// The write-up path is not stored in search.json because it is a pure function
// of the repo and its date — this is that function, and it must stay in step
// with the permalink shape build-atlas.mjs reads from the upstream index.
const writeUpPath = (r: string, d?: string): string | undefined => {
  if (!d || !r.includes('/')) return undefined;
  return `/${d.replace(/-/g, '/')}/${r.replace('/', '-')}.html`;
};

export function initAtlas(): void {
  const root = document.getElementById('i-atlas');
  if (!root) return;

  const elVideos = root.querySelector<HTMLElement>('#i-atlas-videos')!;
  const elGrid = root.querySelector<HTMLElement>('#i-atlas-grid')!;
  const elCount = root.querySelector<HTMLElement>('#i-atlas-count')!;
  const elPager = root.querySelector<HTMLElement>('#i-atlas-pager')!;
  const elSearch = root.querySelector<HTMLInputElement>('#i-atlas-search')!;
  // NOT root.querySelector: #i-atlas-meta lives in the page header, a sibling
  // section of #i-atlas, so scoping the lookup to root returned null and the
  // `!` hid that from the compiler. Assigning to it threw on every single load,
  // the throw landed in the index fetch's .catch(), and the whole catalogue
  // rendered as "the atlas is unavailable right now". Fixed 2026-09-10.
  const elMeta = document.getElementById('i-atlas-meta');
  const elTopics = root.querySelector<HTMLElement>('#i-atlas-topics');

  let index: Index | null = null;
  let page = 0;
  let query = '';
  let topic = '';
  let corpus: Repo[] | null = null;
  let corpusMask: number[] | null = null;
  let loadingCorpus = false;
  const chunkCache = new Map<number, Repo[]>();

  const topicBit = (k: string): number => {
    const i = (index?.topics ?? []).findIndex((t) => t.k === k);
    return i < 0 ? 0 : 1 << i;
  };

  const repoCard = (repo: Repo): string => {
    const href = `https://github.com/${esc(repo.r)}`;
    const p = repo.p ?? writeUpPath(repo.r, repo.d);
    const write = p
      ? `<a href="https://tom-doerr.github.io/repo_posts${esc(p)}" target="_blank" rel="noopener">write-up &nearr;</a>`
      : '';
    return (
      `<article class="i-atlas-card">` +
        `<a class="i-atlas-shot" href="${href}" target="_blank" rel="noopener">` +
          `<img loading="lazy" alt="" src="${esc(ogCard(repo.r))}" />` +
          `<span class="i-atlas-shot-fallback"><span class="i-mono">${esc(repo.r)}</span><span>on GitHub</span></span>` +
        `</a>` +
        `<div class="i-atlas-card-body">` +
          `<h3 class="i-mono"><a href="${href}" target="_blank" rel="noopener">${esc(repo.r)}</a></h3>` +
          (repo.s ? `<p class="i-atlas-desc">${esc(repo.s)}</p>` : '') +
          (repo.u ? `<p class="i-atlas-use">${esc(repo.u)}</p>` : '<span class="i-atlas-spacer"></span>') +
          `<div class="i-atlas-card-foot i-mono">` +
            `<a href="${href}" target="_blank" rel="noopener">GitHub &nearr;</a>` +
            write +
            (repo.d ? `<span class="i-atlas-date">${esc(repo.d)}</span>` : '') +
          `</div>` +
        `</div>` +
      `</article>`
    );
  };

  const vidCard = (v: Video) => (
    `<article class="i-atlas-vid" data-vid="${esc(v.id)}">` +
      `<button type="button" class="i-atlas-vid-play" aria-label="Play ${esc(v.title)}">` +
        `<img loading="lazy" alt="" src="${esc(ytThumb(v.id))}" />` +
        `<span class="i-atlas-vid-tri" aria-hidden="true">&#9654;</span>` +
      `</button>` +
      `<div class="i-atlas-vid-meta">` +
        `<h3>${esc(v.title)}</h3>` +
        `<p class="i-mono">${esc(v.published ?? '')}${v.views ? ` &middot; ${nfmt(v.views)} views` : ''}</p>` +
      `</div>` +
    `</article>`
  );

  const renderVideos = () => {
    const vids = index?.videos ?? [];
    const channels = index?.sources?.channels ?? [];
    if (!vids.length) { elVideos.innerHTML = '<p class="i-atlas-empty i-mono">video shelf unavailable</p>'; return; }
    // Group by channel, in the order the manifest lists them; anything with an
    // unknown channel falls into a trailing "more" group.
    const order = channels.map((c) => c.key);
    const groups = new Map<string, Video[]>();
    for (const v of vids) {
      const k = v.ch && order.includes(v.ch) ? v.ch : '_other';
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(v);
    }
    const keys = [...order.filter((k) => groups.has(k)), ...(groups.has('_other') ? ['_other'] : [])];
    elVideos.innerHTML = keys.map((k) => {
      const ch = channels.find((c) => c.key === k);
      const head = ch
        ? `<a class="i-atlas-ch" href="${esc(ch.url)}" target="_blank" rel="noopener">${esc(ch.name)} &nearr;</a>`
        : `<span class="i-atlas-ch">more</span>`;
      return `<div class="i-atlas-chgroup">${head}<div class="i-atlas-chrail">${groups.get(k)!.map(vidCard).join('')}</div></div>`;
    }).join('');
    elVideos.querySelectorAll<HTMLButtonElement>('.i-atlas-vid-play').forEach((btn) => {
      btn.addEventListener('click', () => {
        const card = btn.closest<HTMLElement>('.i-atlas-vid')!;
        const id = card.dataset.vid!;
        const frame = document.createElement('iframe');
        frame.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`;
        frame.title = card.querySelector('h3')?.textContent ?? 'video';
        frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture';
        frame.allowFullscreen = true;
        frame.loading = 'lazy';
        btn.replaceWith(frame);
      });
    });
  };

  const renderTopics = () => {
    if (!elTopics) return;
    const topics = index?.topics ?? [];
    if (!topics.length) { elTopics.hidden = true; return; }
    elTopics.hidden = false;
    elTopics.innerHTML =
      `<button type="button" class="i-atlas-chip${topic ? '' : ' on'}" data-topic="" aria-pressed="${topic ? 'false' : 'true'}">all <span class="i-mono">${nfmt(index?.total ?? 0)}</span></button>` +
      topics.map((t) =>
        `<button type="button" class="i-atlas-chip${topic === t.k ? ' on' : ''}" data-topic="${esc(t.k)}" aria-pressed="${topic === t.k ? 'true' : 'false'}">${esc(t.label)} <span class="i-mono">${nfmt(t.n)}</span></button>`,
      ).join('');
    elTopics.querySelectorAll<HTMLButtonElement>('[data-topic]').forEach((b) => {
      b.addEventListener('click', () => {
        topic = b.dataset.topic ?? '';
        page = 0;
        if (topic) ensureCorpus();
        renderTopics();
        syncUrl();
        renderGrid();
      });
    });
  };

  /** Rank matches: repo name first, then description, then the build-line. */
  const scored = (q: string): Repo[] => {
    const hits: Array<[number, Repo]> = [];
    const bit = topic ? topicBit(topic) : 0;
    for (let i = 0; i < (corpus?.length ?? 0); i++) {
      if (bit && !((corpusMask![i] & bit))) continue;
      const c = corpus![i];
      if (!q) { hits.push([0, c]); continue; }
      const name = c.r.toLowerCase();
      const at = name.indexOf(q);
      let score: number;
      if (at === 0 || name.slice(name.indexOf('/') + 1).startsWith(q)) score = 0;
      else if (at > -1) score = 1;
      else if ((c.s ?? '').toLowerCase().includes(q)) score = 2;
      else if ((c.u ?? '').toLowerCase().includes(q)) score = 3;
      else continue;
      hits.push([score, c]);
    }
    if (q) hits.sort((a, b) => a[0] - b[0] || a[1].r.localeCompare(b[1].r));
    return hits.map((h) => h[1]);
  };

  /** The active filter's full result set, or null when browsing the catalogue. */
  const filtered = (): Repo[] | null => {
    const q = query.trim().toLowerCase();
    if (!q && !topic) return null;
    if (!corpus) return [];
    return scored(q);
  };

  const setPager = (totalPages: number) => {
    elPager.hidden = totalPages <= 1;
    (elPager.querySelector('[data-atlas-prev]') as HTMLButtonElement).disabled = page === 0;
    (elPager.querySelector('[data-atlas-next]') as HTMLButtonElement).disabled = page >= totalPages - 1;
    (elPager.querySelector('[data-atlas-pos]') as HTMLElement).textContent = `${nfmt(page + 1)} / ${nfmt(totalPages)}`;
  };

  const renderGrid = async () => {
    if (!index) return;
    const found = filtered();
    let rows: Repo[];

    if (found) {
      if (!corpus && loadingCorpus) { elGrid.innerHTML = '<p class="i-atlas-empty i-mono">loading the index&hellip;</p>'; return; }
      const totalPages = Math.max(1, Math.ceil(found.length / PAGE_SIZE));
      if (page >= totalPages) page = totalPages - 1;
      rows = found.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
      const from = found.length ? page * PAGE_SIZE + 1 : 0;
      const to = Math.min((page + 1) * PAGE_SIZE, found.length);
      elCount.textContent = found.length
        ? `${nfmt(from)}–${nfmt(to)} of ${nfmt(found.length)} matching`
        : '0 matches';
      setPager(totalPages);
    } else {
      const chunk = Math.floor((page * PAGE_SIZE) / PER_CHUNK);
      const offset = (page * PAGE_SIZE) % PER_CHUNK;
      let all = chunkCache.get(chunk);
      if (!all) {
        elGrid.innerHTML = '<p class="i-atlas-empty i-mono">loading&hellip;</p>';
        try {
          const r = await fetch(`${DATA}/chunk-${String(chunk).padStart(3, '0')}.json`);
          all = r.ok ? await r.json() : [];
        } catch { all = []; }
        chunkCache.set(chunk, all!);
      }
      rows = all!.slice(offset, offset + PAGE_SIZE);
      const from = page * PAGE_SIZE + 1;
      const to = Math.min((page + 1) * PAGE_SIZE, index.total);
      elCount.textContent = `${nfmt(from)}–${nfmt(to)} of ${nfmt(index.total)}`;
      setPager(Math.ceil(index.total / PAGE_SIZE));
    }

    elGrid.innerHTML = rows.length
      ? rows.map(repoCard).join('')
      : `<p class="i-atlas-empty i-mono">${query || topic ? 'nothing matches that' : 'catalogue unavailable'}</p>`;
    // A catalogue this old has renamed / deleted repos whose OG card 404s —
    // swap the broken tile for a typeset nameplate so the row keeps its rhythm.
    // (CSP forbids inline onerror, so this is wired here.)
    elGrid.querySelectorAll<HTMLImageElement>('.i-atlas-shot img').forEach((img) => {
      img.addEventListener('error', () => {
        img.closest('.i-atlas-shot')?.classList.add('dead');
        img.remove();
      });
    });
  };

  const ensureCorpus = () => {
    if (corpus || loadingCorpus) return;
    loadingCorpus = true;
    fetch(`${DATA}/search.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: SearchRow[]) => {
        corpus = d.map(([r, s, u, dt]) => ({ r, s, u: u || undefined, d: dt || undefined }));
        corpusMask = d.map((row) => row[4] ?? 0);
        loadingCorpus = false;
        renderGrid();
      })
      .catch(() => { loadingCorpus = false; });
  };

  // ---- URL state: a search or a topic is a place, so it gets an address -----
  const syncUrl = (replace = false) => {
    const u = new URL(location.href);
    const set = (k: string, v: string) => (v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
    set('q', query.trim());
    set('t', topic);
    set('p', page > 0 ? String(page + 1) : '');
    history[replace ? 'replaceState' : 'pushState']({}, '', u);
  };

  const readUrl = () => {
    const u = new URL(location.href).searchParams;
    query = u.get('q') ?? '';
    topic = u.get('t') ?? '';
    page = Math.max(0, (Number(u.get('p')) || 1) - 1);
    elSearch.value = query;
    if (query || topic) ensureCorpus();
  };

  addEventListener('popstate', () => { readUrl(); renderTopics(); renderGrid(); });

  elSearch.addEventListener('focus', ensureCorpus);
  let deb = 0;
  elSearch.addEventListener('input', () => {
    ensureCorpus();
    query = elSearch.value;
    page = 0;                       // a new query starts at its own first page
    clearTimeout(deb);
    deb = window.setTimeout(() => { syncUrl(true); renderGrid(); }, 120);
  });
  elPager.querySelector('[data-atlas-prev]')!.addEventListener('click', () => {
    page = Math.max(0, page - 1); syncUrl(); scrollTo({ top: 0 }); renderGrid();
  });
  elPager.querySelector('[data-atlas-next]')!.addEventListener('click', () => {
    page += 1; syncUrl(); scrollTo({ top: 0 }); renderGrid();
  });

  readUrl();

  fetch(`${DATA}/index.json`)
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((j: Index) => {
      index = j;
      const tcount = j.topics?.length ?? 0;
      if (elMeta) elMeta.textContent =
        `${nfmt(j.total)} repositories · ${tcount ? `${tcount} topics · ` : ''}${j.videos.length} videos · synced ${j.generated}`;
      renderVideos();
      renderTopics();
      renderGrid();
    })
    .catch((e) => {
      // This catch also swallows a throw from the three render calls above, so
      // log it: a rendering bug and an unreachable index look identical to the
      // reader and used to look identical in the console too.
      console.error('[atlas] failed to start', e);
      elGrid.innerHTML = '<p class="i-atlas-empty i-mono">the atlas is unavailable right now</p>';
    });
}
