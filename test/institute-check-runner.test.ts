import { describe, it, expect } from "vitest";
import { runChecks, type Check } from "../web/src/lib/institute/check-runner";

// The Code Lab's auto-check engine (web/src/lib/institute/check-runner.ts). The
// same pure function runs in the lab's Web Worker in the browser and here —
// so a passing test here is a real guarantee the lab grades correctly.

const addChecks: Check[] = [
  { name: "add is a function", hint: "declare `function add(a, b)`", test: "return typeof add === 'function';" },
  { name: "add(2, 3) is 5", hint: "return a + b", test: "return add(2, 3) === 5;" },
  { name: "add(-1, 1) is 0", hint: "negatives count too", test: "return add(-1, 1) === 0;" },
];

describe("runChecks", () => {
  it("all pass on a correct solution", () => {
    const out = runChecks("function add(a, b) { return a + b; }", addChecks);
    expect(out.ran).toBe(true);
    expect(out.runError).toBeUndefined();
    expect(out.results.map((r) => r.pass)).toEqual([true, true, true]);
    expect(out.complete).toBe(true);
  });

  it("reports the specific failing check + keeps the others", () => {
    const out = runChecks("function add(a, b) { return a - b; }", addChecks);
    expect(out.ran).toBe(true);
    expect(out.results[0].pass).toBe(true); // add is a function
    expect(out.results[1].pass).toBe(false); // add(2,3) === 5
    expect(out.results[2].pass).toBe(false);
    expect(out.complete).toBe(false);
  });

  it("a syntax error in the source is reported once, not per-check", () => {
    const out = runChecks("function add(a, b { return a + b; }", addChecks);
    expect(out.ran).toBe(false);
    expect(out.runError).toMatch(/SyntaxError/);
    expect(out.complete).toBe(false);
    // checks still run (and fail) — they don't crash the runner
    expect(out.results.every((r) => r.pass === false)).toBe(true);
  });

  it("a runtime throw in the source is caught", () => {
    const out = runChecks("throw new Error('boom'); function add(){}", addChecks);
    expect(out.ran).toBe(false);
    expect(out.runError).toBe("Error: boom");
  });

  it("a check that throws counts as failed, with the error captured", () => {
    const out = runChecks("function add(a, b) { return a + b; }", [
      { name: "bad check", hint: "n/a", test: "return nonexistent.thing;" },
    ]);
    expect(out.results[0].pass).toBe(false);
    expect(out.results[0].error).toMatch(/nonexistent/);
  });

  it("complete is false when there are no checks", () => {
    const out = runChecks("1 + 1", []);
    expect(out.ran).toBe(true);
    expect(out.complete).toBe(false);
  });

  it("checks see top-level const / let / class from the source", () => {
    const out = runChecks(
      "const GREETING = 'Sat Sri Akal'; class Seeker { name() { return 'Simran'; } }",
      [
        { name: "const in scope", hint: "", test: "return GREETING === 'Sat Sri Akal';" },
        { name: "class in scope", hint: "", test: "return new Seeker().name() === 'Simran';" },
      ],
    );
    expect(out.results.map((r) => r.pass)).toEqual([true, true]);
  });
});
