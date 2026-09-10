// The Institute of Technology records progress in the SAME `progress` table as
// the catalogue — that is what makes one dashboard and one gradebook possible.
// These tests pin the contract at both ends of the wire, because the bug they
// were written for failed silently in both directions: the code lab posted a
// payload /api/progress rejects, fetch does not reject on 4xx, and the caller's
// .catch() only sees network errors. Every institute lab completion was thrown
// away and nothing anywhere said so.
import { describe, it, expect, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import path from 'node:path';
vi.mock('../functions/api/_lib.js', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  getUser: async (env: any) => env.user,
}));
import { onRequestPost as progress } from '../functions/api/progress.js';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf-8');

function setup() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('CREATE TABLE progress(user_id TEXT,course_id TEXT,done TEXT,passed_score INTEGER,updated_at INTEGER,PRIMARY KEY(user_id,course_id));');
  const env: any = { user: { id: 'u1', role: 'learner' }, DB: {} };
  env.DB.prepare = (query: string) => {
    let args: any[] = [];
    const stmt = {
      bind(...values: any[]) { args = values; return stmt; },
      async run() { const r = sql.prepare(query).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
      async first() { return sql.prepare(query).get(...args) || null; },
      async all() { return { results: sql.prepare(query).all(...args) }; },
    };
    return stmt;
  };
  return { env, sql };
}
const post = (env: any, body: any) =>
  progress({ env, request: new Request('https://example.test/api/progress', { method: 'POST', body: JSON.stringify(body) }) } as any);

describe('Institute progress writes reach the same table as the catalogue', () => {
  it('records a lab completion against the track, indistinguishable from a catalogue lesson', async () => {
    const { env, sql } = setup();
    const res = await post(env, { courseId: 'aisf-02-ml', lessonId: 3, completed: true });
    expect(res.status).toBe(200);
    const row = sql.prepare('SELECT * FROM progress').get()!;
    expect(row.course_id).toBe('aisf-02-ml');
    expect(JSON.parse(row.done as string)).toEqual([3]);
  });

  it('rejects the payload the code lab used to send, which is why nothing saved', async () => {
    const { env, sql } = setup();
    // The old body: a string lessonId built from the localStorage buffer key,
    // and `done` where the API expects `completed`.
    const res = await post(env, { courseId: 'aisf-02-ml', lessonId: 'aisf-02-ml::hello::lab', done: true });
    expect(res.status).toBe(400);
    expect(sql.prepare('SELECT COUNT(*) n FROM progress').get()!.n).toBe(0);
  });

  it('keeps a track id valid under the courseId pattern', async () => {
    const { env } = setup();
    for (const id of ['aisf-02-ml', 'cyber-06-ai-security', 'design-00-foundations', 'it-01-craft']) {
      expect((await post(env, { courseId: id, lessonId: 0, completed: true })).status).toBe(200);
    }
  });

  it('a lab completion and an exam grade coexist on one row', async () => {
    const { env, sql } = setup();
    await post(env, { courseId: 'design-01-systems', lessonId: 1, completed: true });
    // /api/institute-exam writes passed_score against the same (user, course).
    sql.exec("UPDATE progress SET passed_score=90 WHERE course_id='design-01-systems'");
    await post(env, { courseId: 'design-01-systems', lessonId: 2, completed: true });
    const row = sql.prepare('SELECT * FROM progress').get()!;
    expect(JSON.parse(row.done as string)).toEqual([1, 2]);
    expect(row.passed_score).toBe(90); // a lesson patch must never clear a grade
  });
});

describe('The code lab is wired to send what the API accepts', () => {
  const lab = read('web/src/lib/institute/code-lab.ts');
  const page = read('web/src/pages/technology/lesson/[...path].astro');

  it('posts an integer lessonId and a `completed` flag, not the lab id', () => {
    expect(lab).toContain('courseId: track');
    expect(lab).toContain('lessonId: lessonIndex');
    expect(lab).toContain('completed: true');
    expect(lab).not.toContain("lessonId: this.cfg.id");
  });

  it('only posts once it has both fields, so a lab without them stays local-only', () => {
    expect(lab).toContain('if (track && Number.isInteger(lessonIndex))');
  });

  it('the lesson page passes the track and the lesson index into the lab', () => {
    expect(page).toContain('track={trackId}');
    expect(page).toContain('lessonIndex={pos}');
  });
});
