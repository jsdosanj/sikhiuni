/// <reference lib="webworker" />
// The Code Lab's Python runner (Wave 2c). Pyodide is loaded lazily from
// jsDelivr the first time a Python lab is Run — the /technology/* CSP allows
// `script-src 'wasm-unsafe-eval' https://cdn.jsdelivr.net` and
// `connect-src https://cdn.jsdelivr.net` for exactly this. The worker file
// itself is bundled same-origin (worker-src 'self'); an infinite loop is
// killed by the main thread's worker.terminate().
//
// Protocol (identical to lab.worker.ts):
//   main -> worker:  { code: string, checks: Check[] }
//   worker -> main:  { type: 'status', text }              (one-off, "loading Python…")
//                    { type: 'log',   level, text }         (stdout / stderr)
//                    { type: 'result', outcome: RunOutcome }
import type { Check, RunOutcome } from './check-runner';

const PYODIDE_VERSION = '0.28.3';
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.mjs`;

const post = (m: unknown) => (self as unknown as Worker).postMessage(m);
const logLine = (level: string, text: string) => post({ type: 'log', level, text });

let pyodidePromise: Promise<any> | null = null;

async function getPyodide(): Promise<any> {
  if (!pyodidePromise) {
    post({ type: 'status', text: 'loading Python — the first run downloads it (a few seconds)…' });
    pyodidePromise = (async () => {
      const mod = await import(/* @vite-ignore */ PYODIDE_URL);
      const py = await mod.loadPyodide({
        indexURL: `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`,
      });
      py.setStdout({ batched: (s: string) => logLine('log', s) });
      py.setStderr({ batched: (s: string) => logLine('error', s) });
      return py;
    })();
  }
  return pyodidePromise;
}

// The check harness, defined once in the student's namespace. Each check's
// `test` is a Python expression string; it is passed as a normal function
// ARGUMENT at call time (`__run_check(c.test)`) — never string-concatenated
// into code — so there is nothing to escape. It evaluates truthy to pass.
const CHECK_HARNESS =
  'def __run_check(__expr):\n' +
  '    try:\n' +
  '        return (bool(eval(__expr, globals())), None)\n' +
  '    except Exception as __ex:\n' +
  '        return (False, f"{type(__ex).__name__}: {__ex}")\n';

self.onmessage = async (e: MessageEvent<{ code: string; checks: Check[] }>) => {
  const { code, checks } = e.data;
  let outcome: RunOutcome;

  try {
    const py = await getPyodide();

    // Fresh namespace per Run so state never leaks between attempts.
    const ns = py.toPy({});
    let ran = true;
    let runError: string | undefined;

    try {
      py.runPython(code || '', { globals: ns });
    } catch (err: any) {
      ran = false;
      runError = String(err?.message || err).trim().split('\n').slice(-3).join('\n');
    }

    const results = checks.map((c) => ({ name: c.name, hint: c.hint, pass: false, error: undefined as string | undefined }));

    if (ran && checks.length) {
      py.runPython(CHECK_HARNESS, { globals: ns });
      const runCheck = ns.get('__run_check');
      checks.forEach((c, i) => {
        try {
          const [ok, errMsg] = runCheck(c.test).toJs();
          results[i].pass = !!ok;
          if (errMsg) results[i].error = String(errMsg);
        } catch (err: any) {
          results[i].error = String(err?.message || err);
        }
      });
      runCheck.destroy?.();
    }
    ns.destroy?.();

    outcome = {
      ran,
      runError,
      results,
      complete: ran && results.length > 0 && results.every((r) => r.pass),
    };
  } catch (err: any) {
    outcome = {
      ran: false,
      runError:
        'Python could not start — check your connection and try Run again. ' +
        String(err?.message || err),
      results: [],
      complete: false,
    };
  }

  post({ type: 'result', outcome });
};
