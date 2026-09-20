// Lesson-page client bits: mermaid (only when a diagram is present, loaded
// lazily from jsDelivr — the /technology/* CSP allows it), and the
// check-understanding quiz (server-graded via /api/quiz).
// Syntax highlighting is deliberately not loaded — the code blocks are legible
// monospace as-is, and it isn't worth an extra CDN dependency per lesson.

const MERMAID = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

async function renderMermaid() {
  if (!document.querySelector('.mermaid')) return;
  try {
    const mod = await import(/* @vite-ignore */ MERMAID);
    const mermaid = mod.default;
    const dark = document.documentElement.getAttribute('data-theme') !== 'light';
    mermaid.initialize({
      startOnLoad: false,
      theme: dark ? 'dark' : 'neutral',
      securityLevel: 'strict',
      fontFamily: 'JetBrains Mono, monospace',
    });
    await mermaid.run({ querySelector: '.mermaid' });
  } catch {
    // A diagram that won't render isn't worth breaking the lesson over.
  }
}

function wireQuiz() {
  const sec = document.querySelector<HTMLElement>('.i-lesson-quiz');
  const form = sec?.querySelector<HTMLFormElement>('.i-quiz-form');
  const out = sec?.querySelector<HTMLElement>('.i-quiz-result');
  if (!sec || !form || !out) return;
  const lessonId = sec.dataset.lessonId!;
  const n = form.querySelectorAll('fieldset').length;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const answers: number[] = [];
    for (let i = 0; i < n; i++) {
      const picked = form.querySelector<HTMLInputElement>(`input[name="q${i}"]:checked`);
      answers.push(picked ? Number(picked.value) : -1);
    }
    if (answers.includes(-1)) {
      out.textContent = 'answer every question first.';
      out.className = 'i-quiz-result i-mono fail';
      return;
    }

    out.textContent = 'checking…';
    out.className = 'i-quiz-result i-mono';
    let r: { score?: number; passed?: boolean } | null = null;
    try {
      r = await fetch('/api/quiz', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ courseId: lessonId, answers }),
      }).then((x) => x.json());
    } catch {
      /* offline */
    }

    if (!r || typeof r.passed !== 'boolean') {
      out.textContent = "couldn't reach the grader — try again.";
      out.className = 'i-quiz-result i-mono fail';
      return;
    }
    if (r.passed) {
      // Score comes back only on a pass — a failing attempt returns just the
      // boolean so the count can't be used to reverse the answer key.
      out.textContent = `${r.score}% — nice.`;
      out.className = 'i-quiz-result i-mono pass';
      try {
        const k = 'iot_v1_quiz_done';
        const set = new Set(JSON.parse(localStorage.getItem(k) || '[]'));
        set.add(lessonId);
        localStorage.setItem(k, JSON.stringify([...set]));
      } catch {
        /* ignore */
      }
    } else {
      out.textContent = 'Not passed — you need 80%. Re-read and try again.';
      out.className = 'i-quiz-result i-mono fail';
    }
  });
}

export function initLesson() {
  renderMermaid();
  wireQuiz();
}
