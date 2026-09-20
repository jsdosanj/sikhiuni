// The Institute of Technology phase exam (client island).
//
// Fetches the answer-free question bank (web/src/data/institute/exam/<track>.json,
// synced to /data/institute/exam/), samples a fixed-size set, renders it, and
// submits (pool-index, choice) tuples to /api/institute-exam for server-side
// grading. No answer key is ever in the browser. Pass >= 80% and the phase
// certificate unlocks at /technology/cert?track=<slug>.

interface PoolQ {
  q: string;
  options: string[];
}
interface Pool {
  track: string;
  count: number;
  questions: PoolQ[];
}

const EXAM_MAX = 20;

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  );
}

export function initExam(): void {
  const root = document.getElementById('i-exam');
  if (!root) return;

  const trackId = root.dataset.track!; // e.g. aisf-00-setup
  const certHref = root.dataset.cert!; // /technology/cert?track=<slug>
  const poolUrl = `/data/institute/exam/${trackId}.json`;

  const startBtn = root.querySelector<HTMLButtonElement>('[data-start]');
  const stage = root.querySelector<HTMLElement>('[data-stage]');
  const intro = root.querySelector<HTMLElement>('[data-intro]');
  if (!startBtn || !stage || !intro) return;

  let pool: Pool | null = null;
  let picks: number[] = []; // pool indices, in presentation order

  async function loadPool(): Promise<Pool> {
    if (!pool) pool = await fetch(poolUrl).then((r) => r.json());
    return pool!;
  }

  function draw(p: Pool): number[] {
    const idx = shuffle([...Array(p.questions.length).keys()]);
    return idx.slice(0, Math.min(EXAM_MAX, p.questions.length));
  }

  function render(p: Pool): void {
    const n = picks.length;
    stage!.innerHTML =
      '<form class="i-exam-form" novalidate>' +
      picks
        .map((qi, i) => {
          const q = p.questions[qi];
          return (
            `<fieldset class="i-exam-q"><legend>${i + 1}. ${escapeHtml(q.q)}</legend>` +
            q.options
              .map(
                (opt, j) =>
                  `<label><input type="radio" name="e${i}" value="${j}"> ${escapeHtml(opt)}</label>`,
              )
              .join('') +
            '</fieldset>'
          );
        })
        .join('') +
      '<div class="i-exam-actions">' +
      '<button type="submit" class="i-btn i-btn-primary">Submit exam</button>' +
      '<button type="button" class="i-btn i-btn-ghost" data-redraw>New question set</button>' +
      '</div>' +
      '<p class="i-exam-result i-mono" role="status" aria-live="polite"></p>';

    const form = stage!.querySelector<HTMLFormElement>('form')!;
    const out = stage!.querySelector<HTMLElement>('.i-exam-result')!;
    const submit = form.querySelector<HTMLButtonElement>('button[type=submit]')!;

    stage!.querySelector<HTMLButtonElement>('[data-redraw]')!.addEventListener('click', () => {
      picks = draw(p);
      render(p);
      stage!.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const items: { qi: number; sel: number }[] = [];
      for (let i = 0; i < n; i++) {
        const picked = form.querySelector<HTMLInputElement>(`input[name="e${i}"]:checked`);
        if (!picked) {
          out.textContent = `Answer every question — number ${i + 1} is blank.`;
          out.className = 'i-exam-result i-mono fail';
          form.querySelectorAll('fieldset')[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        items.push({ qi: picks[i], sel: Number(picked.value) });
      }

      out.textContent = 'grading…';
      out.className = 'i-exam-result i-mono';
      submit.disabled = true;

      let res: Response | null = null;
      try {
        res = await fetch('/api/institute-exam', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ track: trackId, items }),
        });
      } catch {
        /* offline */
      }
      submit.disabled = false;

      if (res && res.status === 401) {
        out.innerHTML =
          `You need to <a href="/login?next=${encodeURIComponent(location.pathname)}">sign in</a> ` +
          'before the exam can be graded and your certificate issued. Your answers are still here.';
        out.className = 'i-exam-result i-mono fail';
        return;
      }

      const d = res ? await res.json().catch(() => null) : null;
      if (!d || typeof d.passed !== 'boolean') {
        out.textContent = "Couldn't reach the grader — try again in a moment.";
        out.className = 'i-exam-result i-mono fail';
        return;
      }

      if (d.passed) {
        // The server reveals the score only on a pass (a failing attempt
        // returns just the boolean, so the count can't be used as an
        // answer-key oracle).
        out.innerHTML =
          `<strong>${d.score}%</strong> — you passed. ` +
          `<a href="${escapeHtml(certHref)}">Claim your certificate &rarr;</a>`;
        out.className = 'i-exam-result i-mono pass';
        form.querySelectorAll('input').forEach((el) => ((el as HTMLInputElement).disabled = true));
        submit.disabled = true;
      } else {
        out.textContent =
          'Not passed — you need 80%. Go back through the phase, then try a new question set.';
        out.className = 'i-exam-result i-mono fail';
      }
    });
  }

  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    const label = startBtn.textContent;
    startBtn.textContent = 'loading…';
    try {
      const p = await loadPool();
      picks = draw(p);
      intro.hidden = true;
      render(p);
      stage.hidden = false;
      stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      startBtn.disabled = false;
      startBtn.textContent = label;
    }
  });
}
