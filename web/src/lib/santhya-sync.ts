// Santhya audio ⇄ text alignment engine (pure functions — vitest-covered).
//
// The Santhya recordings are long tracks spanning many angs (a segment covers
// 1–20 angs). Nothing on earth provides per-word timestamps for them, so exact
// sync is impossible — but a good ESTIMATE is very possible: we know the full
// text of every ang in a segment, and recitation time is roughly proportional
// to text length (plus pauses at vishrams). This module turns those weights
// into (a) a seek offset so opening ang N starts the audio at ang N, not at
// the segment start, and (b) a per-ang playback window that drives the
// word-by-word highlight. A user tap on the word they are hearing re-anchors
// the estimate (drift correction) for the rest of the segment.
//
// Weight model matches the reader's original heuristic so both stay in step:
//   word: 0.6 + 0.22·len(without ॥;.) + vishram pause (॥ 3.2 · ; 1.6 · . 0.9)

export function vishramWeight(w: string): number {
  if (w.indexOf('॥') !== -1) return 3.2;
  if (w.indexOf(';') !== -1) return 1.6;
  if (w.indexOf('.') !== -1) return 0.9;
  return 0;
}

export function wordWeight(w: string): number {
  return 0.6 + 0.22 * w.replace(/[॥;.]/g, '').length + vishramWeight(w);
}

// Total weight of one ang's text (same tokenization as the reader: whitespace).
export function angWeight(lines: string[]): number {
  let t = 0;
  for (const line of lines) {
    for (const tok of line.split(/\s+/)) {
      if (tok) t += wordWeight(tok);
    }
  }
  return t;
}

export type SegmentTimeline = {
  /** Segment-relative [0..1] fraction where this ang begins. */
  startFraction(ang: number): number;
  /** Segment-relative [0..1] fraction where this ang ends. */
  endFraction(ang: number): number;
};

// Build the segment's cumulative timeline from each covered ang's weight.
// `weights` must cover angs start..end in order; a missing/zero weight (ang
// failed to fetch) falls back to the mean of the known ones so one bad fetch
// can't skew every neighbour.
export function segmentTimeline(startAng: number, weights: number[]): SegmentTimeline {
  const known = weights.filter((w) => w > 0);
  const mean = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  const w = weights.map((x) => (x > 0 ? x : mean));
  const total = w.reduce((a, b) => a + b, 0) || 1;
  const cum: number[] = [0];
  for (let i = 0; i < w.length; i++) cum.push(cum[i] + w[i]);
  const clampIdx = (ang: number) => Math.max(0, Math.min(w.length - 1, ang - startAng));
  return {
    startFraction: (ang) => cum[clampIdx(ang)] / total,
    endFraction: (ang) => cum[clampIdx(ang) + 1] / total,
  };
}

// Seconds into the track where `ang` is estimated to begin/end.
export function angWindow(
  tl: SegmentTimeline,
  duration: number,
  ang: number,
): { start: number; end: number } {
  return { start: tl.startFraction(ang) * duration, end: tl.endFraction(ang) * duration };
}

// Map a playback position to a word index on the current ang.
// `cum` is the reader's cumulative word-weight array for the ang, `total` its
// last value. Position is normalized inside the ang's window; outside the
// window it clamps to the first/last word (the caller decides page turns).
export function wordIndexAt(
  pos: number,
  win: { start: number; end: number },
  cum: number[],
  total: number,
): number {
  if (!cum.length || total <= 0) return -1;
  const span = Math.max(0.001, win.end - win.start);
  const rel = Math.min(1, Math.max(0, (pos - win.start) / span));
  const target = rel * total;
  let i = 0;
  while (i < cum.length - 1 && cum[i] < target) i++;
  return i;
}

// Estimated track position of a word (for tap-to-anchor / play-from-word):
// the word's start on the ang's weight scale, mapped into the window.
export function wordTime(
  idx: number,
  win: { start: number; end: number },
  cum: number[],
  total: number,
): number {
  if (idx <= 0 || !cum.length || total <= 0) return win.start;
  const before = cum[idx - 1] / total;
  return win.start + before * (win.end - win.start);
}

// The weight estimate is a heuristic, not a transcript alignment — it's
// correct on average over a whole ang (anchored to the real audio duration)
// but can misjudge a single passage (e.g. a more heavily-paused stretch) and
// briefly race ahead several words during continuous playback. Cap forward
// jumps to one word per `minDwellMs` so the highlight advances at a readable
// pace instead of visibly blitzing through words during normal playback.
//
// A real seek (drag the scrubber, ±10s buttons, tap-to-anchor) must still
// snap immediately — `audioJumpMs` is the audio position's own jump since the
// last tick; a jump past `seekJumpMs` (far larger than a normal ~200-250ms
// timeupdate interval) means the *position* moved, not just the estimate, so
// the throttle is bypassed for that tick. Backward targets always pass
// through immediately regardless (rewinding never needs throttling).
export function throttleIndex(
  current: number,
  target: number,
  msSinceLastAdvance: number,
  minDwellMs: number,
  audioJumpMs: number,
  seekJumpMs: number,
): number {
  if (target <= current) return target;
  if (audioJumpMs > seekJumpMs) return target;
  if (msSinceLastAdvance < minDwellMs) return current;
  return current + 1;
}
