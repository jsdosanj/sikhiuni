// The Code Lab's check engine. Pure, environment-agnostic (runs in a Web Worker
// AND in Node for tests — no DOM). Given the learner's source and a list of
// checks, it runs the source once, then each check, and reports pass/fail + a
// hint for the ones that failed. Client-attested (model B): the browser posts
// the boolean result to /api/progress, same trust level as a lesson "done" flag.

export interface Check {
  /** Short label shown in the checks bar, e.g. "returns the sum". */
  name: string;
  /** One-line nudge shown when this check fails. */
  hint: string;
  /**
   * A JS function BODY. It runs after the learner's source, in the same scope,
   * so top-level `function`/`const` declarations from the source are in view.
   * Return a truthy value to pass; return falsy or throw to fail.
   * Example: "return typeof add === 'function' && add(2, 3) === 5;"
   */
  test: string;
}

export interface CheckResult {
  name: string;
  hint: string;
  pass: boolean;
  error?: string;
}

export interface RunOutcome {
  /** Did the learner's source itself run without throwing? */
  ran: boolean;
  /** Error from running the source (before any check). */
  runError?: string;
  results: CheckResult[];
  /** All checks passed AND the source ran. */
  complete: boolean;
}

interface RawResult { i: number; pass: boolean; error?: string }

export function runChecks(source: string, checks: Check[]): RunOutcome {
  // ONE eval: the learner's source runs exactly once (so its console output and
  // any side effects happen once), then every check runs in the same scope —
  // so a top-level `function` / `const` / `class` from the source is in view.
  // Each check is wrapped in its own try/catch IIFE, so one throwing check
  // doesn't stop the others. `"use strict"` is omitted on purpose so a bare
  // `function foo(){}` in the starter hoists into the shared scope.
  const testExprs = checks
    .map(
      (c, i) =>
        `(function(){try{return {i:${i},pass:Boolean((function(){${c.test}})())};}` +
        `catch(e){return {i:${i},pass:false,error:(e&&e.message)||String(e)};}})()`,
    )
    .join(',');

  let ran = true;
  let runError: string | undefined;
  let raw: RawResult[] = [];
  try {
    // eslint-disable-next-line no-new-func
    raw = new Function(`${source}\n;return [${testExprs}];`)() as RawResult[];
  } catch (e) {
    ran = false;
    runError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }

  const results: CheckResult[] = checks.map((c, i) => {
    const r = ran ? raw.find((x) => x.i === i) : undefined;
    return { name: c.name, hint: c.hint, pass: r ? r.pass : false, error: r?.error };
  });

  return {
    ran,
    runError,
    results,
    complete: ran && results.length > 0 && results.every((r) => r.pass),
  };
}
