/// <reference lib="webworker" />
// The Code Lab's sandboxed runner. Vite bundles this into a same-origin worker
// file (CSP: worker-src 'self'), so learner JS never touches the page's scope,
// and an infinite loop is killed by the main thread's worker.terminate().
//
// Protocol:
//   main -> worker:  { code: string, checks: Check[], capture: boolean }
//   worker -> main:  { type: 'log',   level, text }        (console.* / stdout)
//                    { type: 'result', outcome: RunOutcome }
//                    (the main thread's 10s timer terminates on no 'result')
import { runChecks, type Check } from './check-runner';

const post = (m: unknown) => (self as unknown as Worker).postMessage(m);

// Mirror console.* back to the main thread's console pane.
for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
  const orig = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    orig(...args);
    post({
      type: 'log',
      level: level === 'debug' || level === 'info' ? 'log' : level,
      text: args
        .map((a) => {
          if (typeof a === 'string') return a;
          try { return JSON.stringify(a); } catch { return String(a); }
        })
        .join(' '),
    });
  };
}

self.onmessage = (e: MessageEvent<{ code: string; checks: Check[] }>) => {
  const { code, checks } = e.data;
  let outcome;
  try {
    outcome = runChecks(code || '', checks || []);
  } catch (err) {
    outcome = {
      ran: false,
      runError: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      results: [],
      complete: false,
    };
  }
  post({ type: 'result', outcome });
};
