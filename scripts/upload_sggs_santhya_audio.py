#!/usr/bin/env python3
"""Bulk-upload the per-Ang SGGS Santhya recordings (Bhagat Jaswant Singh Ji
Daudar) to R2 under santhya/sggs/<ang>.mp3 — the already-whitelisted,
currently-empty prefix worker.js's /media/ route serves (see
docs/BACKEND-cloudflare.md). Resumable: a local, out-of-repo state file
records confirmed uploads so a re-run only retries what's missing.

Usage:
  python3 scripts/upload_sggs_santhya_audio.py --dry-run [--limit 8]
  python3 scripts/upload_sggs_santhya_audio.py
"""
import argparse
import json
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

DEFAULT_SRC = "/Users/jasvant/Music/Music/Media.localized/Music/Bhagat Jaswant Singh Ji/SGGS Santhya Shudh Ucharan Sehaj Paath"
STATE_FILE = Path.home() / ".sikh-university" / "sggs-upload-state.json"
BUCKET = "sikh-university-media"
REPO_ROOT = Path(__file__).resolve().parent.parent
NUMBERED_RE = re.compile(r"^(\d{4})\.mp3$")


def load_state():
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            pass
    return {"done": {}, "failed": {}}


def save_state(state):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=1))


def find_numbered_files(src_dir):
    out = []
    for name in os.listdir(src_dir):
        m = NUMBERED_RE.match(name)
        if m:
            ang = int(m.group(1))
            out.append((ang, os.path.join(src_dir, name)))
    return sorted(out)


def upload_one(ang, path):
    key = f"{BUCKET}/santhya/sggs/{ang}.mp3"
    cmd = [
        "npx", "wrangler", "r2", "object", "put", key,
        "--file", path, "--remote", "--config", "wrangler.toml",
    ]
    r = subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True, timeout=300)
    if r.returncode != 0:
        return ang, False, (r.stderr or r.stdout)[-500:]
    return ang, True, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=DEFAULT_SRC)
    ap.add_argument("--dry-run", action="store_true", help="only upload --limit files, for a sanity check")
    ap.add_argument("--limit", type=int, default=8)
    ap.add_argument("--workers", type=int, default=6)
    args = ap.parse_args()

    if not os.path.isdir(args.src):
        print(f"ERROR: source folder not found: {args.src}", file=sys.stderr)
        sys.exit(1)

    files = find_numbered_files(args.src)
    print(f"found {len(files)} numbered per-Ang mp3 files in source")

    state = load_state()
    done = state.setdefault("done", {})
    failed = state.setdefault("failed", {})

    pending = [(ang, path) for ang, path in files if str(ang) not in done]
    if args.dry_run:
        pending = pending[: args.limit]
        print(f"DRY RUN: uploading only {len(pending)} file(s)")
    else:
        print(f"{len(done)} already confirmed done, {len(pending)} pending this run")

    if not pending:
        print("nothing to do")
        return

    ok_count, fail_count = 0, 0
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futures = {ex.submit(upload_one, ang, path): ang for ang, path in pending}
        for i, fut in enumerate(as_completed(futures), 1):
            ang, ok, err = fut.result()
            if ok:
                done[str(ang)] = True
                failed.pop(str(ang), None)
                ok_count += 1
            else:
                failed[str(ang)] = err
                fail_count += 1
                print(f"FAIL ang {ang}: {err}")
            if i % 25 == 0 or i == len(pending):
                save_state(state)
                print(f"progress: {i}/{len(pending)} (ok={ok_count} fail={fail_count})")

    save_state(state)
    print(f"\nDONE. uploaded ok: {ok_count}, failed: {fail_count}, total confirmed done: {len(done)}")
    if failed:
        print(f"failed angs: {sorted(int(a) for a in failed)}")


if __name__ == "__main__":
    main()
