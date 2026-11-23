#!/usr/bin/env python3
"""Apply the reviewed SikhLibrary licensing update to jsdosanj/SikhLibrary on Hugging Face.

Run from this folder with a write token (`hf auth login`, or HF_TOKEN set):

  python3 apply_to_hf.py prepare   # downloads the two files patched in place, writes them into proposed/ for review
  python3 apply_to_hf.py check     # optional: looks for SGGS Online text left in rag_chunks / search_chunks (needs duckdb)
  python3 apply_to_hf.py upload --yes   # one commit: every file in proposed/, deletes sggs_sggsonline if still present,
                                        # then permanently deletes its stored files so older revisions can't serve them
"""
import json
import pathlib
import sys

from huggingface_hub import CommitOperationAdd, CommitOperationDelete, HfApi, hf_hub_download

REPO = "jsdosanj/SikhLibrary"
KIND = "dataset"
HERE = pathlib.Path(__file__).resolve().parent
PROPOSED = HERE / "proposed"
REMOVED = [
    "sikhi-io-d1/sikhi-scripture/sggs_sggsonline.parquet",
    "sikhi-io-d1/sikhi-scripture/sggs_sggsonline.jsonl.gz",
]

GURSEVAK_INTRO_OLD = (
    "Access and use follow the dataset's CC BY-NC-ND 4.0 license and its "
    "[Access & AI Policy](../../README.md#-access--ai-policy): no AI agents, scraping, AI training or public "
    "retrieval indexes without written permission. Using SikhiDB in a Gurbani app: see the main card's "
    "*Using SikhiDB in Gurbani Apps*."
)
GURSEVAK_INTRO_NEW = (
    "SikhiDB gathers the work of several organizations: GursevakDB (Gursevak), BaniDB (Khalis Foundation), "
    "Shabad OS, Jatha Randhawa and Damdami Taksal. **Each organization's data stays under its own licence, and "
    "you must follow the licence of every organization whose data you use** (see *Sources, credits and licences* "
    "at the end of this file, and the dataset's `LICENSE.md`). The maintainers' own work here (the merge, links, "
    "schema and scripts) is CC BY-NC-ND 4.0. Access is subject to the dataset's "
    "[Access & AI Policy](../../README.md#-access--ai-policy): no AI agents, scraping, AI training or public "
    "retrieval indexes without written permission. Using SikhiDB in a Gurbani app: see the main card's "
    "*Using SikhiDB in Gurbani Apps*."
)
GURSEVAK_PERM_OLD = (
    "The Randhawa and Damdami Taksal texts are used with the rights holders' permission. "
    "Credit them by name, as above, with any reuse."
)
GURSEVAK_PERM_NEW = (
    "The Randhawa and Damdami Taksal texts are used with the rights holders' written permission. That permission "
    "was given to the maintainers for SikhLibrary and does not pass to you: ask Jatha Randhawa or Damdami Taksal "
    "before any reuse outside SikhLibrary, and credit them by name."
)
GURSEVAK_TAIL = """
## Sources, credits and licences

**You must follow the licence of every source below whose data you use.** The written permissions were given to the
maintainers for SikhLibrary; they do not pass to you.

| Source | What it provides | Licence / terms |
|---|---|---|
| **GursevakDB** — Gursevak ("Dear Father Brave Guru God's Slave Society", gursevak.com) | Guru Granth Sahib and Dasam Granth text, pagination, shabad grouping, pause marks; the CSVs in `source-csv/`; the granths in `banis` | All rights reserved to Gursevak; **used with Gursevak's written permission**. `CREDITS.txt` is Gursevak's own acknowledgement and must stay with any copy. |
| **BaniDB** — Khalis Foundation | The BaniDB v2 format; English and transliteration carried over from the BaniDB-format database; verse and shabad ids | **Used with the Khalis Foundation's written permission.** BaniDB's [Terms of Service](https://www.banidb.com/tos/) and [NPOSL-3.0](https://www.banidb.com/nposl/) apply, including written acknowledgement of BaniDB and its logo in any project that uses its data. |
| **Shabad OS** — Shabad OS Organization and Contributors | Older lines and data the database was built on | Code MIT; texts marked public domain by Shabad OS, on condition that Gurbani is not distorted |
| **Jatha Randhawa · Gurbani Arth Bhandar** (Sant Hari Singh Ji Randhawe Wale) | `commentary_entries`, `commentary_lines`, `randhawa` translations | All rights reserved; **used with Jatha Randhawa's written permission** |
| **Damdami Taksal · Sundar Gutka** (the Sundar Gutka app) | `banis`, `bani_blocks`, `bani_verses` for the 87 Gutka banis | All rights reserved; **used with Damdami Taksal's written permission** |
| **Translators** | Manmohan Singh (`ms`), the Dasam English, and the others named in `translations` | Each translator's or publisher's rights |
| **Sikhi.io** | The merge, links, `banidb_api.py`, `gurmukhi_ascii.py`, `merge_gursevakdb_v2.py` | CC BY-NC-ND 4.0, as the dataset's `LICENSE.md` §2. `banidb_api.py` is an independent re-implementation of BaniDB's public API; it contains no BaniDB code and is not provided or endorsed by the Khalis Foundation. |

<img src="https://www.banidb.com/wp-content/uploads/2019/05/full-banidb-logo.png" alt="BaniDB" width="140"> Gurbani data courtesy of BaniDB, Khalis Foundation, used with permission.

This folder is part of [SikhLibrary](https://huggingface.co/datasets/jsdosanj/SikhLibrary), a gathering of the Panth's
khajana from many organizations. Any organization can ask for the removal of texts it owns by writing to `akaal@sikhi.io`.
"""


def prepare():
    # Gurbani/GursevakDB/README.md: patched in place, so its technical text stays byte-for-byte as published.
    src = pathlib.Path(hf_hub_download(REPO, "Gurbani/GursevakDB/README.md", repo_type=KIND)).read_text("utf-8")
    for old in (GURSEVAK_INTRO_OLD, GURSEVAK_PERM_OLD):
        if src.count(old) != 1:
            sys.exit(f"GursevakDB README has changed upstream; expected text not found once:\n{old[:80]}…")
    out = src.replace(GURSEVAK_INTRO_OLD, GURSEVAK_INTRO_NEW).replace(GURSEVAK_PERM_OLD, GURSEVAK_PERM_NEW)
    out = out.rstrip("\n") + "\n" + GURSEVAK_TAIL
    dest = PROPOSED / "Gurbani/GursevakDB/README.md"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(out, "utf-8")
    print("wrote", dest)

    # sikhi-io-d1/manifest.json: drop sggs_sggsonline, recount, record the removal.
    m = json.loads(pathlib.Path(hf_hub_download(REPO, "sikhi-io-d1/manifest.json", repo_type=KIND)).read_text("utf-8"))
    gone = [t for t in m["tables"] if t["table"] == "sggs_sggsonline"]
    m["tables"] = [t for t in m["tables"] if t["table"] != "sggs_sggsonline"]
    m["total_rows"] = sum(t["rows"] for t in m["tables"])
    if gone:
        m["removed"] = [{
            "database": t["database"], "table": t["table"], "rows": t["rows"], "files": t["files"],
            "date": "2026-11-23", "reason": "Source (SGGS Online) prohibits database extraction.",
        } for t in gone]
    assert len(m["tables"]) == 54 and m["total_rows"] == 6054868, (len(m["tables"]), m["total_rows"])
    dest = PROPOSED / "sikhi-io-d1/manifest.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(m, indent=1, ensure_ascii=False) + "\n", "utf-8")
    print("wrote", dest, f"({len(m['tables'])} tables, {m['total_rows']:,} rows)")


def check():
    import duckdb  # pip install duckdb
    from huggingface_hub import get_token
    con = duckdb.connect()
    con.execute(f"CREATE SECRET hf (TYPE HUGGINGFACE, TOKEN '{get_token()}')")
    for path in ("sikhi-io-d1/sikhi-io-prod/rag_chunks.parquet", "sikhi-io-d1/sikhi-search/search_chunks.parquet"):
        url = f"hf://datasets/{REPO}/{path}"
        rows = con.execute(
            f"SELECT source_type, count(*) FROM '{url}' "
            "WHERE lower(coalesce(url,'')) LIKE '%sggsonline%' OR lower(coalesce(source_type,'')) LIKE '%sggsonline%' "
            "OR lower(coalesce(source_id,'')) LIKE '%sggsonline%' GROUP BY 1"
        ).fetchall()
        print(path, "->", rows or "no SGGS Online rows found")


def upload():
    if "--yes" not in sys.argv:
        sys.exit("Review proposed/ first, then run: python3 apply_to_hf.py upload --yes")
    for needed in ("Gurbani/GursevakDB/README.md", "sikhi-io-d1/manifest.json"):
        if not (PROPOSED / needed).exists():
            sys.exit(f"Run `prepare` first ({needed} missing).")
    api = HfApi()
    ops = [CommitOperationAdd(path_in_repo=str(f.relative_to(PROPOSED)), path_or_fileobj=str(f))
           for f in sorted(PROPOSED.rglob("*")) if f.is_file()]
    ops += [CommitOperationDelete(path_in_repo=p) for p in REMOVED if api.file_exists(REPO, p, repo_type=KIND)]
    for op in ops:
        print(type(op).__name__.replace("CommitOperation", "").lower(), op.path_in_repo)
    info = api.create_commit(
        REPO, ops, repo_type=KIND,
        commit_message="v3.4.1: licensing, permissions and attribution; remove sggs_sggsonline",
    )
    print("committed:", info.commit_url)

    # Deleting a file in a commit leaves it downloadable from older revisions; delete the stored objects too.
    if not hasattr(api, "list_lfs_files"):
        print("This huggingface_hub is too old to purge LFS files. Upgrade it, or delete them in the dataset's "
              "Settings > Storage > LFS files (filter: sggs_sggsonline).")
        return
    lfs = [f for f in api.list_lfs_files(REPO, repo_type=KIND) if "sggs_sggsonline" in (f.filename or "")]
    print(f"{len(lfs)} stored sggs_sggsonline object(s):", [f.filename for f in lfs])
    if lfs:
        api.permanently_delete_lfs_files(REPO, lfs, rewrite_history=True, repo_type=KIND)
        print("permanently deleted.")


if __name__ == "__main__":
    {"prepare": prepare, "check": check, "upload": upload}.get(sys.argv[1] if len(sys.argv) > 1 else "", lambda: sys.exit(__doc__))()
