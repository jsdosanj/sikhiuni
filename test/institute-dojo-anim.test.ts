import { describe, it, expect } from "vitest";
import { seq, mkRun, stepLive, finalizeLive, norm, type StepDef } from "../web/src/lib/institute/dojo/anim";

// The pure step-sequencer behind both Sikh Code dojos (E7: "unit tests for the
// dojo sequencer — steps -> frames"). No DOM here — just the timing math.
describe("dojo anim — seq()", () => {
  it("assigns cumulative `at` offsets from the gaps", () => {
    const defs: StepDef[] = [{ k: "out", gap: 100 }, { k: "out", gap: 50 }, { k: "out", gap: 200 }];
    const timed = seq(defs);
    expect(timed[0].at).toBe(100);
    expect(timed[1].at).toBe(150);
    expect(timed[2].at).toBe(350);
    expect(timed.every((s) => s.dur === 0)).toBe(true);
  });

  it("spin / bar / cmd steps carry a 900ms duration that pushes later steps out", () => {
    // Matches the sikhi.io source verbatim: the timeline slot for a
    // spin/bar/cmd is a fixed 900ms (the def's own `dur` drives only the
    // engine's "done" hand-off, not the sequencer offsets).
    const timed = seq([{ k: "spin", gap: 100 }, { k: "out", gap: 100 }]);
    expect(timed[0].at).toBe(100);
    expect(timed[0].dur).toBe(900);
    expect(timed[1].at).toBe(1100); // 100 + 900 + 100
  });

  it("speed multiplier compresses the timeline", () => {
    const a = seq([{ k: "out", gap: 200 }]);
    const b = seq([{ k: "out", gap: 200 }], 2);
    expect(b[0].at).toBe(a[0].at / 2);
  });

  it("default gap applies when a step omits one", () => {
    const timed = seq([{ k: "out" }, { k: "out" }], 1, 140);
    expect(timed[0].at).toBe(140);
    expect(timed[1].at).toBe(280);
  });
});

describe("dojo anim — stepLive() on a spinner", () => {
  it("cycles the spinner glyph, then lands on the done state after the 900ms slot", () => {
    const run = mkRun(seq([{ k: "spin", gap: 0, done: "ready", doneG: "+", doneGc: "#0f0" }]));
    const e = norm({ g: "", tc: "#fff", txt: "working" });
    run.live.push({ s: run.steps[0], e });

    stepLive(run, 200); // mid-spin
    expect(run.live.length).toBe(1);
    expect(e.g).not.toBe("");

    stepLive(run, 900); // past the 900ms slot
    expect(run.live.length).toBe(0);
    expect(e.g).toBe("+");
    expect(e.txt).toBe("ready");
  });

  it("default done glyph is ASCII '+' (no check-mark literal — the no-emoji gate)", () => {
    const run = mkRun(seq([{ k: "spin", gap: 0 }]));
    const e = norm({});
    run.live.push({ s: run.steps[0], e });
    stepLive(run, 1000);
    expect(e.g).toBe("+");
  });
});

describe("dojo anim — bar + finalizeLive", () => {
  it("bar eases toward its pct and clears when the 900ms slot is full", () => {
    const run = mkRun(seq([{ k: "bar", gap: 0, pct: 80 }]));
    const e = norm({ bar: true });
    run.live.push({ s: run.steps[0], e });
    stepLive(run, 900);
    expect(e.pctText).toBe("80%");
    expect(run.live.length).toBe(0);
  });

  it("finalizeLive snaps every pending entry to its end state", () => {
    const run = mkRun(seq([{ k: "spin", gap: 0, done: "done" }, { k: "bar", gap: 0, pct: 50 }]));
    const e1 = norm({}), e2 = norm({ bar: true });
    run.live.push({ s: run.steps[0], e: e1 }, { s: run.steps[1], e: e2 });
    finalizeLive(run);
    expect(run.live.length).toBe(0);
    expect(e1.txt).toBe("done");
    expect(e2.pctText).toBe("50%");
  });
});
