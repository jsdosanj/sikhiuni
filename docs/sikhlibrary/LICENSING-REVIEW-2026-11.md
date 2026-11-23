# SikhLibrary licensing & attribution review (November 2026)

Review of the Hugging Face dataset [`jsdosanj/SikhLibrary`](https://huggingface.co/datasets/jsdosanj/SikhLibrary)
(card v3.4, 2026-11-19), done from a copyright/DMCA-risk perspective. **This is a structured risk review,
not legal advice.** Before relying on it, have a qualified copyright lawyer review it, as `site/legal.html`
already notes for the platform's own terms.

## Update, 2026-11-23: permissions confirmed, SGGS Online removed

The maintainers confirmed **written permission** from BaniDB (Khalis Foundation), Gursevak (GursevakDB),
Gian Singh (Chet), Jatha Randhawa, Damdami Taksal (Sundar Gutka app) and Punjabi University, Patiala.
That resolves **C7, C8, C9 and H1** below, provided the permissions are kept on file (who, when, and that
they cover public distribution on Hugging Face). **C6** (`sggs_sggsonline`) is removed: its data files were
already gone from the current revision; `apply_to_hf.py` updates `manifest.json` and the folder README, and
permanently deletes the stored files so older revisions can't serve them. Every document now states each
organization's licence, that users must follow the licence of each organization whose data they use, that
the dataset is a gathering of that khajana, and that any organization can ask `akaal@sikhi.io` for removal.
The BaniDB logo is shown, as BaniDB's terms ask, from `assets/banidb-logo.png`.

To apply: `python3 apply_to_hf.py prepare` (writes the two in-place-patched files into `proposed/` for
review), review `proposed/`, then `python3 apply_to_hf.py upload --yes`.

---

The proposed files are in [`proposed/`](proposed/), laid out as they go in the dataset repository:

| File | Goes to | Change |
|---|---|---|
| `proposed/README.md` | `README.md` (dataset card) | License scope, gate terms, credits, takedown procedure (details below) |
| `proposed/LICENSE.md` | `LICENSE.md` (new) | Layered license + a notice for every source; referenced by the card's `license_link` |
| `proposed/Granths/Mahan_Kosh_Multilingual/{LICENSE,README.md}`, `proposed/mahan-kosh-multilingual/{LICENSE,README.md}` | same paths | Punjabi University's English stated as © the University, used with permission, outside the CC BY 4.0 grant |
| `proposed/mahan-kosh-multilingual/data/reading-aids/faridkot/README.md` | same path | Credits and licences, incl. Gian Singh (Chet) |
| `proposed/Gurbani/SikhiLibrary/README.md` | same path | Credits and licences per source |
| `proposed/sikhi-io-d1/README.md` | same path | `sggs_sggsonline` removed; 54 tables / 6,054,868 rows; licences per table |
| `proposed/assets/banidb-logo.png` | same path | BaniDB logo (from banidb.com) |
| `Gurbani/GursevakDB/README.md`, `sikhi-io-d1/manifest.json` | same paths | Produced by `apply_to_hf.py prepare` (patched in place from the live files) |

They are **not uploaded**: this session has no Hugging Face write token. Use `apply_to_hf.py` (above).

---

## 1. The core problem, and why wording alone can't fully cure it

1. **The maintainers can only license what they own.** The v3.4 card puts the whole 25.6 GB corpus under
   CC BY-NC-ND 4.0, and the metadata says `license: cc-by-nc-nd-4.0`. Most of the corpus belongs to others
   (Punjabi University, SGPC, OUP, Human Rights Watch, Bhai Vir Singh Sahit Sadan, BaniDB, translators,
   estates). A CC grant over someone else's work is ineffective, and claiming it misstates the rights, which
   is exactly what a rights-holder's lawyer would point at first. *Fixed in the proposed card:* the CC license
   now covers only the maintainers' compilation, OCR, code, documentation and Bhai Jasvant Singh's own works;
   every third-party work is expressly "rights reserved to its owner"; metadata is `license: other` pointing
   at `LICENSE.md`.
2. **The maintainers are not the "service provider".** The DMCA § 512(c) safe harbor protects Hugging Face,
   the host, not the people who upload. If a work in the dataset infringes, a takedown notice goes to Hugging
   Face, and the uploaders remain directly exposed. Disclaimers, credit and "non-commercial" framing **reduce**
   that exposure (they bear on willfulness, damages and fair-use factors) but **do not remove it**. Only
   permission or removal does. That is why §2 below lists removals.
3. **The gate contradicted the license.** The card said "you may … share the files unmodified" (what CC
   BY-NC-ND allows) while the gate said "you will not … pass them on" and "will not re-host or mirror". *Fixed:*
   the gate is now described as a separate contract binding the requester, in addition to the license; the
   card no longer promises sharing; the gate gains checkboxes for no-redistribution and for acknowledging that
   third-party works are not licensed by the maintainers. A fair-use/fair-dealing carve-out was added so the
   terms can't be attacked as overreaching (copyright-misuse arguments).

## 2. Findings by severity

### Critical — remove, or get written permission (card text cannot cure these)

| # | Item | Where | Why | Action |
|---|---|---|---|---|
| C1 | Ray Kurzweil, *The Age of Spiritual Machines* (1999) | repo root, `Age Of Spiritual Machines - Ray Kurzweil.pdf` | In copyright (living author, Viking/Penguin). Full commercial book, not about Sikhi; no research rationale. | **Remove**, including from history. |
| C2 | `CIA quantum healing codes.pdf` | `Spirituality/` | Unknown provenance and rights; off-topic. | **Remove** unless its source and license can be shown. |
| C3 | Human Rights Watch reports (≥32, 2008–2012) | `English Literature/` (titles that appear to be HRW reports include *Hidden Apartheid*, *Dead Silence*, *Between Two Sets of Guns*, *Police Abuse And Killings Of Street Children In India*; confirm each) | Each stamped "© HRW. All rights reserved." Most are not about Sikhs. | **Remove**, or ask HRW (its reports are free to read but not licensed for redistribution). Keep the Punjab/1984 ones only with permission. |
| C4 | Oxford University Press monographs (≥32), incl. Pashaura Singh, Harjot Oberoi, Gurinder Singh Mann *The Making of Sikh Scripture* (© 2001) | various | Active commercial publisher that issues takedowns; living authors. | **Remove** or license. |
| C5 | ProQuest / UMI dissertations | `English Thesis Papers/` | ProQuest distributes under its own terms; author copyright. | Remove, or keep only where the author has given permission or the thesis is openly licensed. |
| C6 | `sikhi-scripture/sggs_sggsonline` (25,137 rows) | `sikhi-io-d1/` | SGGS Online (Education Without Boundaries Inc.) states: "Unauthorized bulk copying, commercial reproduction, republication, **database extraction, and AI training are prohibited**." This table is a database extraction. | **Remove** from Parquet + JSONL and from history; also from `rag_chunks`/`search_chunks` if its text is in them. |
| C7 | BaniDB data redistributed | `Gurbani/GursevakDB/gursevakdb-banidb.sqlite` (English + transliteration "carried over from the BaniDB-format database"); `sikhi-io-d1/gurbani-search/*`, `sikhidb/*` | BaniDB's [ToS](https://www.banidb.com/tos/) says materials may not be reproduced or distributed "without the written permission of The Khalis Foundation"; database copies must be updated every 90 days; projects must give written acknowledgement **and the BaniDB logo**; users may not "claim copyright … over any portion of the … data". The v3.4 card's blanket CC BY-NC-ND did exactly that. | **Get written permission from the Khalis Foundation** (they are a non-profit and generally supportive of non-commercial Gurbani projects), or rebuild SikhiDB's English/transliteration from Shabad OS only. The card fix removes the copyright-claim problem; it can't supply the permission. |
| C8 | GursevakDB source CSVs and text | `Gurbani/GursevakDB/source-csv/`, both Gurbani databases | **No public license exists.** `github.com/gursevak/gursevakdb` now returns 404 (moved, made private or deleted); gursevak.com has only "© Dear Father Brave Guru God's Slave Society". Redistributing unlicensed data verbatim is the cleanest possible infringement claim if they object. | **Get written permission from Gursevak** (they may well grant it; they are a seva charity). Until then, the credit and CREDITS.txt are the mitigation. If the repo was taken down deliberately, treat that as a signal to ask first. |
| C9 | Mahan Kosh LICENSE grants CC BY 4.0 over Punjabi University's English | `Granths/Mahan_Kosh_Multilingual/LICENSE`, `mahan-kosh-multilingual/LICENSE` (and the GitHub upstream) | Sikhi.io cannot license PUP's 2006–2011 translation. The 25 machine translations are derivatives of it. | Replace both LICENSE files with `proposed/…/LICENSE`; fix the GitHub upstream the same way; ask PUP's Publication Bureau for permission. Also confirm whether the **Hindi** text is Sikhi.io's own or from a published edition. |

### High — confirm, document, or remove

| # | Item | Action |
|---|---|---|
| H1 | **Permissions on file.** The card relies on permission from Jatha Randhawa, Damdami Taksal and Gian Singh (Chet). | Keep each permission **in writing** (email is fine): who granted it, date, and **scope** — it must cover *public redistribution on Hugging Face*, not only use inside the Sikhi app. Add each to `docs/CONTENT-AND-LICENSING.md`'s register. |
| H2 | Prof. Sahib Singh's *Darpan* and other works. The v3.4 card said he died in 1969 and is "likely public domain in India". He died in **1977**, so under India's life + 60 term his works stay in copyright **until the end of 2037**. | Fixed in the card. Treat his works (and the Darpan inside the Gurbani databases) as in copyright: get permission from his heirs/publisher or accept the risk knowingly. |
| H3 | Yogi Bhajan (3HO / Kundalini Research Institute), Swami Rama (Himalayan Institute), W.H. McLeod's estate. KRI in particular enforces actively. | Remove or seek permission. |
| H4 | Modern translations inside the Gurbani DBs: Dr. Sant Singh Khalsa's English, Bhai Manmohan Singh's (SGPC), Dr. Daljit Singh Jawa, Dr. Surinder Singh Kohli, Dr. Ratan Singh Jaggi. | In copyright. They are widespread in Gurbani apps, usually via BaniDB/Shabad OS, so permission via those projects may cover it. Confirm. |
| H5 | `sikhiwiki_articles` (13,636), `gurbani_org_posts` (423), `web_archive_entries`, `gallery_images` (7,951) in `sikhi-io-d1/`. SikhiWiki's site refused automated checks, so its license is unverified. | Check each site's license by hand. SikhiWiki content, if under a share-alike license, **cannot be relicensed ND** — keep it under its own license and say so. Images: remove unless each image's rights are known. |
| H6 | Living or recent authors among the 86 author archives, e.g. `Mata-Sahib-Deva-n-Pustak-Giani-Surjit-Singh-Mehron.txt` at repo root. | Get permission from living authors, or move to the removal list. |
| H7 | **Removal doesn't remove.** Deleting a file in a new commit leaves it downloadable from older revisions (and in LFS storage). | For every removal: delete, then rewrite history (`HfApi().super_squash_history(repo_id, repo_type="dataset")`, which squashes the branch), or ask Hugging Face support to purge the LFS objects. The proposed card commits to this. |
| H8 | **CC BY 4.0 window (2026-03-30 → 04-12).** Irrevocable for copies received then. | Disclosed in the card; it only ever covered the maintainers' own material. Nothing more to do. |

### Medium — wording and hygiene (done in the proposed card)

- **Credits completed.** GurmatVeechar.com (509 works) was missing from the Acknowledgements; Gursevak was credited only as "GursevakDB" without its legal name; BaniDB without the Khalis Foundation; Shabad OS without its MIT notice; Gian Singh (Chet) and the teeka translators were not in the Acknowledgements. All are now credited with legal owner, what is used, where, and terms (card §3 and `LICENSE.md` §3).
- **No-endorsement and trademark statement.** "BaniDB-compatible" is descriptive (nominative) use; the card now says so, says `banidb_api.py` contains no BaniDB code, and that no credited org endorses the dataset. NPOSL-3.0 §4 forbids using the licensor's name to promote derived products.
- **"Open-source" claims removed** (tag, badge, heading). A gated NC-ND dataset is not open source, and calling it that invites a misrepresentation complaint.
- **Notice & takedown procedure** with a private channel. Rights-holders, especially the Sikh institutions, will not want to raise a complaint in a public HF Discussion. It mirrors § 512(c)(3)/(g) and links Hugging Face's own process.
- **Warranty disclaimer** added; attribution requirement adds "link to license, note changes" as CC requires.
- **Folder READMEs.** Replace the license line in `Gurbani/GursevakDB/README.md` ("Access and use follow the dataset's CC BY-NC-ND 4.0 license …") and in `Gurbani/SikhiLibrary/README.md` ("Licence: as the SikhLibrary dataset (CC BY-NC-ND 4.0), and the terms of each source above.") with:

  > Licence: the maintainers' work in this folder (the merge, links, schema and scripts) is CC BY-NC-ND 4.0. Its Gurbani text, translations and commentary belong to the sources credited here and in the dataset's `LICENSE.md`, and their terms apply, including BaniDB's Terms of Service for BaniDB data. Access is subject to the dataset's Access & AI Policy.

## 3. Open points for the maintainers

1. **Contact address.** The proposed card uses `akaal@sikhi.io`, which `site/legal.html` already publishes as the Sikhi University copyright agent (Everythings 13). Confirm it's the right inbox for SikhLibrary, or substitute a SikhLibrary/Sikhi.io address. Do not use a personal address.
2. **Removals (C1–C6).** These are the maintainers' decision. My recommendation is to remove C1, C2, C3 and C6 now (none is core to Sikh scholarship, and C6 contradicts an express prohibition), and to seek permission for C4/C5 before deciding.
3. **Permission requests (C7, C8, C9, H1).** Khalis Foundation (BaniDB), Gursevak, Punjabi University Patiala Publication Bureau, and written confirmations from Jatha Randhawa, Damdami Taksal and Gian Singh (Chet).
4. **Upload** `proposed/` after (1), then apply the folder README line in §2.

## 4. What was checked

- Dataset card, `Gurbani/GursevakDB/README.md` and `CREDITS.txt`, `Gurbani/SikhiLibrary/README.md`, both Mahan Kosh `LICENSE`/`README.md`, `sikhi-io-d1/README.md` and `manifest.json`, the top-level file tree, and the `English Literature/` listing (read via the Hugging Face API as the dataset owner).
- Upstream terms, fetched 2026-11-23: BaniDB ToS, NPOSL-3.0 page and API repo licence (MIT, © 2019 Khalis Foundation); Shabad OS database `LICENSE.md` and README (MIT code; texts marked public domain; integrity clause; repo archived, moved to `shabados/shabados`); gursevak.com home, privacy and acknowledgements pages; `github.com/gursevak/gursevakdb` (404); gurmatveechar.com home and literature pages (no terms stated); sggsonline.com (prohibition quoted above).
- **Not verified** (sites refused or unreachable): SikhiWiki, Panjab Digital Library, srigranth.org, Namdhari E-Library. Check these by hand.
- Individual books were not opened; the work counts come from the card's own September 2026 audit.
