// Institute of Technology certificate (client island).
//
// Same trust model and same drawn seal as the main /cert + /verify (D10) —
// just a distinct dark face. The pass is validated server-side: this reads
// /api/progress and only renders the card when passed_score >= 80 for the
// phase's track id, then calls /api/certificates to mint a verifiable id.

import { iconSvg } from '../icons';
import { sealReveal } from '../motion';

const esc = (s: unknown): string =>
  String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  );

const panel = (html: string): string => `<div class="i-cert-msg i-panel">${html}</div>`;

interface Track {
  id: string;
  slug?: string;
  title: string;
  num?: number;
  kind: string;
}

export function initInstituteCert(): void {
  const app = document.getElementById('i-cert-app');
  if (!app) return;

  const slug = new URLSearchParams(location.search).get('track') || '';
  const here = location.pathname + location.search;

  Promise.all([
    fetch('/data/institute/manifest.json').then((r) => r.json()).catch(() => null),
    fetch('/api/me', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .catch(() => ({ user: null })),
    fetch('/api/progress', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { progress: [] }))
      .catch(() => ({ progress: [] })),
  ])
    .then(([manifest, me, prog]) => {
      const track: Track | undefined =
        manifest && (manifest.tracks || []).find((t: Track) => t.slug === slug || t.id === slug);
      if (!track) {
        app.innerHTML = panel('That phase could not be found.');
        return;
      }

      const user = me && me.user;
      const pnum = String(track.num ?? 0).padStart(2, '0');

      if (!user) {
        app.innerHTML = panel(
          `<a class="i-clink" href="/login?next=${encodeURIComponent(here)}">Sign in</a> ` +
            'to see and download your certificate.',
        );
        return;
      }

      const row = (prog.progress || []).find((p: any) => p.course_id === track.id);
      const score = row && typeof row.passed_score === 'number' ? row.passed_score : null;
      if (!(typeof score === 'number' && score >= 80)) {
        app.innerHTML = panel(
          `Pass the <a class="i-clink" href="/technology/exam/${esc(track.slug)}">Phase ${pnum} exam</a> ` +
            '(80% or higher) to unlock this certificate. Your exam score must sync while you are signed in.',
        );
        return;
      }

      const name = String(user.name || '').trim();
      const issued = new Date().toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      app.innerHTML = `
        ${
          name
            ? ''
            : `<div class="i-cert-note noprint">Add your name on your <a class="i-clink" href="/dashboard">dashboard</a> so it appears on the certificate.</div>`
        }
        <div id="i-cert-card" class="i-cert-card">
          <div class="i-cert-inner">
            <div class="i-cert-emblem">${iconSvg('diya', 'h-10 w-10')}</div>
            <div class="i-cert-wordmark">Sikhi University</div>
            <div class="i-cert-subline">Institute of Technology</div>
            <div class="i-cert-kind">Certificate of Completion</div>
            <div class="i-cert-certifies">This certifies that</div>
            <div class="i-cert-name">${esc(name || '________________')}</div>
            <div class="i-cert-rule"></div>
            <div class="i-cert-has">has completed</div>
            <div class="i-cert-course">AI Engineering &mdash; Phase ${pnum}<br>${esc(track.title)}</div>
            <div class="i-cert-meta">Adapted from AI Engineering from Scratch (MIT) &middot; Score ${score}%</div>
            <div class="i-cert-foot">
              <div class="i-cert-foot-l">
                <div>Issued ${issued}</div>
                <div id="i-cert-vid" class="i-cert-vid"></div>
              </div>
              <div class="i-cert-seal">
                ${iconSvg('medal', 'h-9 w-9')}
                <div class="i-cert-sealed">Sealed</div>
              </div>
            </div>
            <div class="i-cert-verify">Verify authenticity at sikhiuni.com/verify</div>
          </div>
        </div>
        <div class="i-cert-actions noprint">
          <button id="i-cert-pdf" class="i-btn i-btn-primary">Download PDF</button>
          <button id="i-cert-print" class="i-btn i-btn-ghost">Print</button>
        </div>`;

      const card = document.getElementById('i-cert-card');
      if (card) sealReveal(card);
      document.getElementById('i-cert-print')?.addEventListener('click', () => window.print());
      document.getElementById('i-cert-pdf')?.addEventListener('click', () => downloadPdf(track));

      fetch('/api/certificates', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ courseId: track.id, name }),
      })
        .then((r) => r.json().then((d: any) => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
          const v = document.getElementById('i-cert-vid');
          if (!v) return;
          if (ok && d && d.id) {
            v.innerHTML =
              `Verification ID <strong>${esc(d.id)}</strong> &middot; ` +
              `sikhiuni.com/verify?id=${esc(d.id)}`;
          } else {
            v.innerHTML =
              '<span class="noprint">Let your progress finish syncing, then reload for a verification ID.</span>';
          }
        })
        .catch(() => {});
    })
    .catch(() => {
      app.innerHTML = panel('Could not load your certificate — try again in a moment.');
    });
}

async function downloadPdf(track: Track): Promise<void> {
  const card = document.getElementById('i-cert-card');
  const btn = document.getElementById('i-cert-pdf') as HTMLButtonElement | null;
  if (!card || !btn) return;
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Preparing…';
  try {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);
    const canvas = await html2canvas(card, { scale: 2, backgroundColor: '#06090f', useCORS: true });
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const ratio = Math.min(pw / canvas.width, ph / canvas.height) * 0.92;
    const w = canvas.width * ratio;
    const h = canvas.height * ratio;
    pdf.setFillColor(6, 9, 15);
    pdf.rect(0, 0, pw, ph, 'F');
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (pw - w) / 2, (ph - h) / 2, w, h);
    pdf.save('sikhi-university-institute-' + (track.slug || 'certificate') + '.pdf');
  } catch {
    window.suToast?.('Could not generate the PDF — please use Print instead.', 'error');
  }
  btn.disabled = false;
  btn.textContent = old;
}
