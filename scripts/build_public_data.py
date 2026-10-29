#!/usr/bin/env python3
"""Emit the browser-safe catalogue.

The full catalogue at site/assets/data/courses.json carries quiz[].answer keys.
That file is the BUILD-TIME source of truth (build_quiz_keys.py reads the answers
into a server-only module; program pages read it at build time), but it must NEVER
be served to a browser: anyone who can read the answers can POST a perfect score to
/api/quiz and mint a real, publicly-verifiable certificate.

This script writes public outlines to courses.public.json and private, answer-free
lessons to courses.content.json. The private file is stored in R2; the Worker serves
only sanitized outlines at /assets/data/courses.json. Run it before deploy-data (the deploy-data
script does this). It also self-asserts the output is answer-free, and can be run as
a standalone CI check with --check (fails if any answer key survives).
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "site/assets/data/courses.json")
OUT = os.path.join(ROOT, "site/assets/data/courses.public.json")
CONTENT = os.path.join(ROOT, "site/assets/data/courses.content.json")


def strip_answers(data):
    """Remove quiz[].answer from every course, in place. Returns count stripped."""
    stripped = 0
    for c in data.get("courses", []):
        for q in c.get("quiz", []) or []:
            if "answer" in q:
                del q["answer"]
                stripped += 1
    return stripped


def find_answer_keys(obj, path="$"):
    """Return a list of json-paths where an 'answer' key appears (defence-in-depth)."""
    hits = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == "answer":
                hits.append(path)
            hits.extend(find_answer_keys(v, f"{path}.{k}"))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            hits.extend(find_answer_keys(v, f"{path}[{i}]"))
    return hits


def main():
    check_only = "--check" in sys.argv
    with open(SRC, encoding="utf-8") as f:
        data = json.load(f)

    n = strip_answers(data)

    # Hard assertion: the sanitized structure must contain zero 'answer' keys.
    leaks = find_answer_keys(data)
    if leaks:
        print("BUILD FAILED: quiz answers survived sanitisation:", file=sys.stderr)
        for p in leaks[:20]:
            print("  -", p, file=sys.stderr)
        sys.exit(1)

    if check_only:
        print(f"OK — sanitiser removes {n} quiz answers; output is answer-free.")
        return

    # Full answer-free lessons stay private in R2, fetched only by authenticated API.
    with open(CONTENT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    fields = ["id", "title", "topic", "level", "professor", "source", "aiCreated", "status", "summary", "outcomes", "references", "gated"]
    public = {"topics": data.get("topics", []), "paths": data.get("paths", []), "courses": []}
    for course in data.get("courses", []):
        outline = {k: course[k] for k in fields if k in course}
        outline["lessons"] = [{k: lesson[k] for k in ["title", "summary"] if k in lesson} for lesson in course.get("lessons", [])]
        outline["nQuiz"] = len(course.get("quiz", []))
        public["courses"].append(outline)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(public, f, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {os.path.relpath(OUT, ROOT)} — {n} quiz answers stripped, "
          f"{len(data.get('courses', []))} courses.")


if __name__ == "__main__":
    main()
