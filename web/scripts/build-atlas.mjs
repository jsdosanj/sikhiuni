// Build the Open Source Atlas dataset for the Institute — a browsable directory
// of ~12.5k AI / engineering repositories, each with a line on what a Sikh
// engineer could build with it, plus a video shelf from a few channels.
//
// A MAINTAINER dev tool — NOT part of `npm run build` (it fetches the network).
// Run it, review the diff, commit the generated JSON; `sync-institute.mjs` then
// copies src/data/institute/atlas/ -> public/data/institute/atlas/ at build.
//
//   node scripts/build-atlas.mjs              # refresh everything it can reach
//   node scripts/build-atlas.mjs --videos-only
//   node scripts/build-atlas.mjs --reindex    # OFFLINE: re-derive search.json and
//                                             # the topic facets from the committed
//                                             # chunks, no network, no refetch
//
// OUTPUT (src/data/institute/atlas/, served from Workers Assets after sync):
//   index.json      meta + the video shelf + chunk manifest   (small, always fetched)
//   chunk-NNN.json  250 repos each                            (fetched as you page)
//   search.json     compact [repo, description, build-line, date, topic-mask] rows
//                   (fetched once, on first search or first topic filter). It
//                   carries the build-line because search results are cards like
//                   any other and dropping it would strip the page's whole point
//                   off exactly the repos someone went looking for. The write-up
//                   path is NOT stored — it is derivable from the repo and date.
//
// SOURCES (credited on /technology/atlas and /technology/licenses):
//   repos   https://tom-doerr.github.io/repo_posts/  (Tom Dörr's curation)
//   videos  the channels in CHANNELS below (Cloud Codes, Andrej Karpathy, Proton)
//           — link/embed only, nothing rehosted
//   build-lines  src/data/institute/atlas-src/uses.jsonl — written once by the
//                sikhi.io enrichment pass; MUST survive a refresh (a rebuild
//                without this merge silently strips 12.5k sentences off the page)
//
// Ported from redroyals/sikhi.io scripts/build-opensource.mjs.
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = 'src/data/institute/atlas';
const SRC_DIR = 'src/data/institute/atlas-src';
const SEED = path.join(SRC_DIR, 'videos.seed.json');
const USES = path.join(SRC_DIR, 'uses.jsonl');
const INDEX_URL = 'https://tom-doerr.github.io/repo_posts/assets/search-index.json';
const CHUNK_SIZE = 250;

// The video shelf. Each video is tagged with its channel `key` so the page can
// label it. The YouTube RSS feed only exposes a channel's latest ~15 videos, so
// `videos.seed.json` carries a back-catalogue (merged, newest wins).
const CHANNELS = [
  { key: 'cloud-codes', name: 'Cloud Codes', handle: '@cloud-codes', id: 'UC0DZj1PNa_Fp0MU6uPSKv5w' },
  { key: 'karpathy', name: 'Andrej Karpathy', handle: '@AndrejKarpathy', id: 'UCXUPKJO5MZQN11PqgIvyuvQ' },
  { key: 'proton', name: 'Proton', handle: '@ProtonPrivacy', id: 'UC4JpFaR7m3AOiVHlenk9fqA' },
];

// ---- topic facets ---------------------------------------------------------
// 12.5k repositories behind one search box is a library with no shelves. These
// twelve topics are derived from each repo's description, its build-line, and
// its own name, so they cost nothing to maintain and re-derive on every build.
// Deliberately coarse and deliberately overlapping: a repo may carry several,
// and roughly a fifth carry none, which is honest — a keyword pass cannot
// classify everything, and inventing a bucket for the remainder would suggest a
// precision this does not have. Order fixes each topic's bit in the mask.
const TOPICS = [
  ['agents', 'Agents & tooling', /\bagent|agentic|autonomous|mcp\b|tool[- ]?call|workflow|orchestrat/i],
  ['llm', 'LLMs & models', /\bllm|language model|gpt|claude|llama|mistral|transformer|fine[- ]?tun|inference|prompt|token/i],
  ['rag', 'RAG & search', /\brag\b|retrieval|embedding|vector|semantic search|knowledge base|search engine/i],
  ['audio', 'Audio & speech', /\baudio|speech|voice|tts\b|stt\b|whisper|transcri|music|podcast|sound|kirtan/i],
  ['vision', 'Vision & images', /\bimage|vision|video|photo|ocr\b|diffusion|render|camera|visual/i],
  ['data', 'Data & databases', /\bdatabase|sql\b|postgres|sqlite|dataset|data pipeline|etl\b|analytics|scrap|crawl/i],
  ['web', 'Web & interfaces', /\bweb\b|website|browser|frontend|react|ui\b|dashboard|css|html|component/i],
  ['infra', 'Infra & DevOps', /\bkubernetes|docker|deploy|server|cloud|infrastructure|ci\/cd|devops|monitor|container/i],
  ['security', 'Security & privacy', /\bsecurity|encrypt|privacy|password|auth|vulnerab|firewall|vpn\b|secure|malware/i],
  ['mobile', 'Mobile', /\bios\b|android|mobile|iphone|app store|flutter|react native|swift/i],
  ['cli', 'Terminal & CLI', /\bcli\b|terminal|command[- ]line|shell|bash|tui\b|neovim|vim\b/i],
  ['docs', 'Docs & knowledge', /\bdocument|note[- ]?tak|markdown|wiki|knowledge|pdf\b|ebook|book|writing/i],
];

/** Bitmask of the topics a repo matches. Bit i is TOPICS[i]. */
function topicMask(repo) {
  const hay = `${repo.s ?? ''} ${repo.u ?? ''} ${String(repo.r ?? '').replace(/[/-]/g, ' ')}`;
  let mask = 0;
  for (let i = 0; i < TOPICS.length; i++) if (TOPICS[i][2].test(hay)) mask |= 1 << i;
  return mask;
}

/** search.json row. `p` is omitted on purpose: derivable from `r` and `d`. */
const searchRow = (x) => [x.r, x.s ?? '', x.u ?? '', x.d ?? '', topicMask(x)];

function topicFacets(repos) {
  const counts = TOPICS.map(() => 0);
  for (const r of repos) {
    const m = topicMask(r);
    for (let i = 0; i < TOPICS.length; i++) if (m & (1 << i)) counts[i]++;
  }
  return TOPICS.map(([k, label], i) => ({ k, label, n: counts[i] }));
}

/** Read the committed chunks back — the offline half of --reindex. */
function readChunks() {
  const out = [];
  for (const f of fs.readdirSync(OUT_DIR).filter((n) => /^chunk-\d+\.json$/.test(n)).sort()) {
    out.push(...JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), 'utf8')));
  }
  return out;
}

const args = new Set(process.argv.slice(2));

async function getText(url, label) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'sikhiuni-atlas-builder' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    console.warn(`  ! ${label} unreachable (${err.message})`);
    return null;
  }
}

/** Tom Dörr's index -> one record per unique repository. */
async function buildRepos() {
  const raw = await getText(INDEX_URL, 'repo index');
  if (!raw) return null;
  const entries = JSON.parse(raw);
  const byRepo = new Map();
  let unparsed = 0;
  for (const e of entries) {
    const m = /^\[([^/\]]+)\/([^\]]+)\]/.exec(e.title ?? '');
    if (!m) { unparsed++; continue; }
    const repo = `${m[1]}/${m[2]}`;
    const prev = byRepo.get(repo);
    if (prev && prev.d >= (e.d ?? '')) continue;
    byRepo.set(repo, { r: repo, s: (e.s ?? '').trim(), d: e.d ?? '', p: e.u ?? '' });
  }
  const repos = [...byRepo.values()].sort((a, b) => (b.d || '').localeCompare(a.d || ''));
  console.log(`  repos: ${repos.length} unique from ${entries.length} entries (${unparsed} unparsed)`);
  return repos;
}

/** Each channel's Atom feed -> the informational shelf, videos tagged by channel. */
async function buildVideos() {
  const seeded = fs.existsSync(SEED) ? JSON.parse(fs.readFileSync(SEED, 'utf8')) : [];
  const merged = new Map(seeded.map((v) => [v.id, v]));
  let fromFeeds = 0;

  for (const ch of CHANNELS) {
    const xml = await getText(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${ch.id}`,
      `youtube feed (${ch.name})`,
    );
    if (!xml) continue;
    for (const block of xml.split('<entry>').slice(1)) {
      const pick = (re) => (re.exec(block) ?? [])[1];
      const id = pick(/<yt:videoId>([^<]+)</);
      if (!id) continue;
      fromFeeds += 1;
      const v = {
        id,
        ch: ch.key,
        title: (pick(/<title>([^<]*)</) ?? '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim(),
        published: (pick(/<published>([^<]+)</) ?? '').slice(0, 10),
        views: Number(pick(/views="(\d+)"/) ?? 0) || undefined,
      };
      merged.set(id, { ...merged.get(id), ...v });
    }
  }

  const videos = [...merged.values()]
    .map((v) => ({ ch: 'cloud-codes', ...v })) // seed entries predate the `ch` field
    .sort((a, b) => (b.published || '').localeCompare(a.published || ''));
  console.log(`  videos: ${fromFeeds} from ${CHANNELS.length} feeds, ${videos.length} total after merging the seed`);
  return videos;
}

const reindex = args.has('--reindex');
const repos = reindex ? readChunks() : args.has('--videos-only') ? null : await buildRepos();
const videos = reindex ? null : await buildVideos();
if (reindex) console.log(`  --reindex: ${repos.length} repos read back from the committed chunks, no network`);

fs.mkdirSync(OUT_DIR, { recursive: true });

if (repos) {
  if (fs.existsSync(USES)) {
    const uses = new Map();
    for (const line of fs.readFileSync(USES, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { const o = JSON.parse(line); if (o.r && o.u) uses.set(o.r, o.u); } catch { /* ignore */ }
    }
    let filled = 0;
    for (const r of repos) { const u = uses.get(r.r); if (u) { r.u = u; filled++; } }
    console.log(`  build-lines: ${filled}/${repos.length} repos carry one`);
  }

  if (!reindex) {
    for (const f of fs.readdirSync(OUT_DIR)) {
      if (/^chunk-\d+\.json$/.test(f)) fs.unlinkSync(path.join(OUT_DIR, f));
    }
    const chunkCount = Math.ceil(repos.length / CHUNK_SIZE);
    for (let i = 0; i < chunkCount; i++) {
      fs.writeFileSync(
        path.join(OUT_DIR, `chunk-${String(i).padStart(3, '0')}.json`),
        JSON.stringify(repos.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)),
      );
    }
    console.log(`  wrote ${chunkCount} chunks of ${CHUNK_SIZE}`);
  }
  fs.writeFileSync(path.join(OUT_DIR, 'search.json'), JSON.stringify(repos.map(searchRow)));
  const tagged = repos.filter((x) => topicMask(x) !== 0).length;
  console.log(`  search index: ${repos.length} rows, ${tagged} carry at least one topic`);
}

const indexPath = path.join(OUT_DIR, 'index.json');
const existing = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : {};
const index = {
  generated: new Date().toISOString().slice(0, 10),
  chunkSize: CHUNK_SIZE,
  total: repos ? repos.length : existing.total ?? 0,
  chunks: repos ? Math.ceil(repos.length / CHUNK_SIZE) : existing.chunks ?? 0,
  newest: repos ? repos[0]?.d : existing.newest,
  topics: repos ? topicFacets(repos) : existing.topics ?? [],
  sources: {
    repos: { name: 'Tom Dörr — repo_posts', url: 'https://tom-doerr.github.io/repo_posts/' },
    channels: CHANNELS.map((c) => ({
      key: c.key, name: c.name, url: `https://www.youtube.com/${c.handle}`, channelId: c.id,
    })),
  },
  videos: videos ?? existing.videos ?? [],
};
fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
console.log(`  wrote ${indexPath} (${index.total} repos, ${index.videos.length} videos, ${index.topics.length} topics)`);
