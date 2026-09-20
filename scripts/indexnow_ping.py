#!/usr/bin/env python3
"""Notify IndexNow (Bing, DuckDuckGo, Seznam, Naver) of URLs that changed in this deploy.

Best-effort and additive (docs/SEO.md) — never fails the workflow it runs in. Always
submits a fixed set of core navigation pages (so they stay flagged fresh even when the
catalogue itself didn't change) plus any course whose entry differs from the previous
commit's courses.json, so new/edited courses get picked up for re-crawl without waiting
for the next scheduled sitemap crawl.

Usage: python3 scripts/indexnow_ping.py
Env:   INDEXNOW_KEY (defaults to the key in web/public/<key>.txt if unset)
"""
import json
import os
import subprocess
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://sikhiuni.com"
KEY_FILE = "f59b13b5e863a021f1afc9be79af4a0a.txt"
COURSES_PATH = "site/assets/data/courses.json"
MAX_URLS = 500

CORE_PAGES = ["/", "/catalog", "/programs", "/about", "/professors", "/santhiya", "/search"]


def load_json_at(ref):
    try:
        if ref is None:
            with open(os.path.join(ROOT, COURSES_PATH), encoding="utf-8") as f:
                return json.load(f)
        out = subprocess.run(
            ["git", "show", f"{ref}:{COURSES_PATH}"], cwd=ROOT,
            capture_output=True, text=True, check=True, timeout=15,
        )
        return json.loads(out.stdout)
    except Exception as e:
        print(f"indexnow: could not load courses.json at {ref!r}: {e}", file=sys.stderr)
        return None


def changed_course_ids():
    cur = load_json_at(None)
    prev = load_json_at("HEAD^")
    if cur is None:
        return []
    cur_courses = {c["id"]: c for c in cur.get("courses", [])}
    if prev is None:
        # No usable previous state (first commit, shallow clone, etc.) — don't treat
        # the entire catalogue as "changed"; the fixed core pages still get submitted.
        return []
    prev_courses = {c["id"]: c for c in prev.get("courses", [])}
    changed = [
        cid for cid, c in cur_courses.items()
        if cid not in prev_courses or prev_courses[cid] != c
    ]
    return changed


def main():
    key = os.environ.get("INDEXNOW_KEY", "").strip()
    if not key:
        try:
            with open(os.path.join(ROOT, "web/public", KEY_FILE), encoding="utf-8") as f:
                key = f.read().strip()
        except OSError as e:
            print(f"indexnow: no key available, skipping: {e}", file=sys.stderr)
            return

    urls = [SITE + p for p in CORE_PAGES]
    for cid in changed_course_ids():
        urls.append(f"{SITE}/course/{cid}")
    urls = urls[:MAX_URLS]

    payload = json.dumps({
        "host": "sikhiuni.com",
        "key": key,
        "keyLocation": f"{SITE}/{KEY_FILE}",
        "urlList": urls,
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.indexnow.org/indexnow",
        data=payload,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            print(f"indexnow: submitted {len(urls)} URL(s), HTTP {resp.status}")
    except Exception as e:
        # Best-effort/additive per docs/SEO.md — a failure here must never fail the deploy.
        print(f"indexnow: submission failed (non-fatal): {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
