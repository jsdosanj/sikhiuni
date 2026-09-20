#!/usr/bin/env python3
"""Pilot: insert real, BaniDB-sourced Gurbani quotes into the lessons of a small
set of "flagship bani" courses (Japji Sahib x2, Anand Sahib, Sidh Gosht, Sukhmani
Sahib) that have a granthRef (a known, already-established Ang range) but no
inline blockquote.gurbani[data-ang] quotes yet — so students can follow along
with real scripture text inside the lecture, not just prose describing it.

Each lesson gets ONE quote, from an Ang chosen by evenly partitioning the
course's granthRef Ang range across its lesson count (lesson i -> the i-th
segment's first Ang) — a mechanical, non-editorial placement rule, deliberately
NOT an attempt to guess which specific verse a lesson's prose is "about".

Text (Gurmukhi + English) is fetched live from BaniDB (the same source
scripts/build_gurbani_snapshot.py already uses to independently verify every
quote on this site) — never typed from memory, matching CLAUDE.md's
never-invent-Gurbani rule. Run scripts/build_gurbani_snapshot.py and the JS
build (verify-gurbani.mjs) after this to get an independent build-time
pass/fail on every quote inserted here.

Usage: python3 scripts/insert_bani_quotes.py [--dry-run]
"""
import json
import re
import sys
import time
import urllib.request

ROOT = "/Users/jasvant/Downloads/sikh-university/extracted/sikh-university-master"
SRC = f"{ROOT}/site/assets/data/courses.json"

PILOT = [
    {"id": "guru-nanak-japji-deep"},
    {"id": "japji-sahib-deep-vichar"},
    {"id": "guru-amar-das-anand-sahib"},
    {"id": "guru-nanak-sidh-gosht"},
    {"id": "guru-arjan-sukhmani-sahib"},
]
GRANTH_LABEL = "ਸ੍ਰੀ ਗੁਰੂ ਗਰੰਥ ਸਾਹਿਬ ਜੀ"  # must contain verify-gurbani.mjs's SGGS_LABEL substring


def esc(s):
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def fetch_ang(ang):
    url = f"https://api.banidb.com/v2/angs/{ang}/1"
    req = urllib.request.Request(url, headers={"User-Agent": "sikhi-university-quote-pilot/1.0"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                d = json.loads(r.read())
            return d.get("page") or []
        except Exception as e:
            if attempt == 2:
                raise
            time.sleep(1.5)


def has_quote(lesson_html):
    return bool(re.search(r'<blockquote class="gurbani[^"]*" data-ang="\d+">', lesson_html))


def build_blockquote(ang, verses, max_lines=6):
    parts = [f'<blockquote class="gurbani mt-4 mb-2" data-ang="{ang}">']
    parts.append(f'<div class="font-sans text-[0.7rem] uppercase tracking-widest text-saffron-deep mb-2">{GRANTH_LABEL} · Ang {ang}</div>')
    for v in verses[:max_lines]:
        gur = ((v.get("verse") or {}).get("unicode") or "").strip()
        en = (((v.get("translation") or {}).get("en") or {}).get("bdb") or "").strip()
        if not gur:
            continue
        parts.append(f'<p class="gur text-base leading-loose">{esc(gur)}</p>')
        if en:
            parts.append(f'<p class="mt-0.5 font-sans text-xs italic text-muted">{esc(en)}</p>')
    parts.append("</blockquote>")
    return "".join(parts)


def target_angs(start, end, n_lessons):
    span = end - start + 1
    out = []
    for i in range(n_lessons):
        a = start + (i * span) // n_lessons
        out.append(min(a, end))
    return out


def main():
    dry_run = "--dry-run" in sys.argv
    data = json.load(open(SRC, encoding="utf-8"))
    by_id = {c["id"]: c for c in data["courses"]}

    total_inserted = 0
    for entry in PILOT:
        c = by_id.get(entry["id"])
        if not c:
            print(f"SKIP {entry['id']}: not found")
            continue
        gr = c.get("granthRef")
        if not gr or gr.get("src") != "sggs":
            print(f"SKIP {c['id']}: no sggs granthRef")
            continue
        lessons = c["lessons"]
        angs = target_angs(gr["start"], gr["end"], len(lessons))
        print(f"\n=== {c['id']} — {gr['label']} (Ang {gr['start']}-{gr['end']}, {len(lessons)} lessons) ===")
        print("target angs:", angs)

        ang_cache = {}
        for i, lesson in enumerate(lessons):
            if has_quote(lesson["html"]):
                print(f"  lesson {i} ({lesson['title'][:40]!r}): already has a quote, skipping")
                continue
            ang = angs[i]
            if ang not in ang_cache:
                ang_cache[ang] = fetch_ang(ang)
                time.sleep(0.2)
            verses = ang_cache[ang]
            if not verses:
                print(f"  lesson {i}: ang {ang} — NO VERSES RETURNED, skipping")
                continue
            block = build_blockquote(ang, verses)
            if not dry_run:
                lesson["html"] = lesson["html"] + block
            total_inserted += 1
            print(f"  lesson {i} ({lesson['title'][:40]!r}): + Ang {ang} ({len(verses)} verses in ang, using up to 6)")

    if dry_run:
        print(f"\nDRY RUN — would insert {total_inserted} quotes, no file written")
        return

    # indent=2 matches the source file's existing pretty-printed format — a
    # compact/single-line dump would make every line in the file show as
    # changed in git diff, even though only ~60 lessons' html actually changed.
    with open(SRC, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"\nDONE — inserted {total_inserted} quotes, wrote {SRC}")


if __name__ == "__main__":
    main()
