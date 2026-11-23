# GursevakDB foundation, in BaniDB's format (SikhiDB)

SikhiDB gathers the work of several organizations: GursevakDB (Gursevak), BaniDB (Khalis Foundation), Shabad OS, Jatha Randhawa and Damdami Taksal. **Each organization's data stays under its own licence, and you must follow the licence of every organization whose data you use** (see *Sources, credits and licences* at the end of this file, and the dataset's `LICENSE.md`). The maintainers' own work here (the merge, links, schema and scripts) is CC BY-NC-ND 4.0. Access is subject to the dataset's [Access & AI Policy](../../README.md#-access--ai-policy): no AI agents, scraping, AI training or public retrieval indexes without written permission. Using SikhiDB in a Gurbani app: see the main card's *Using SikhiDB in Gurbani Apps*.

## Version 2 (2026-11-11): Randhawa commentary and banis merged in

v2 is v1 with three additions from the Sikhi.io app (1.1.0). The v1 tables are unchanged, verse ids too. The only change to an existing table is new `translations` rows with translator `randhawa`.

* **Jatha Randhawa · Gurbani Arth Bhandar** (Sant Hari Singh Randhawe Wale): line-by-line commentary on the Guru Granth Sahib. 49,344 entries cover 59,008 of the 60,610 SGGS lines. An entry usually explains one pankti, which is often two lines.
  * `commentary_entries` holds each entry's own fields: `line`, `uthanka` (context), `qa`, `note` (pronunciation), `arth` (word-by-word meaning), `parman`, `parman_arth`, `sakhi`, `others`.
  * `commentary_lines(verse_id, uid, entry_id, pos)` says which lines an entry covers.
  * The `arth` is also in `translations` (translator `randhawa`, lang `pu`, kind `commentary`), so the BaniDB API returns it with each line. A two-line entry is `granularity='group'` with `group_id/group_pos/group_n`.
  * Entries were placed on lines by GursevakDB's `uid`. None were left unplaced.
* **Damdami Taksal · Sundar Gutka**: 87 banis (3,655 paragraphs) as the Gutka prints them, with its vishraam. Includes the printings the app shows side by side, Taksali (55), Hazuri / Takht Sri Hazur Sahib (21) and Buddha Dal (11), e.g. Rehras Sahib, Kirtan Sohila, Ardas, Aarti, Chandi di Vaar, Ugradanti, Bhagauti Astotar, Brahm Kavach, 33 Svaiye, Shastar Naam Mala. `version_group` links the printings of one bani. 18,243 of 19,673 panktis are linked to their `verse_id`.
* **GursevakDB granths as banis**: 57 banis in GursevakDB's text and pauses, from `source-csv/`: Vaaran Bhai Gurdas Ji (one per vaar; `gsdb_bgsj_41`, titled ਵਾਰ ੪੧, also holds the Kabit Savaiye), Bhai Nand Lal Ji, Sri Sarbloh Granth selections and Rehatname. **12,251 of 13,337 panktis (91.9%)** are linked to their line in this database's other sources. Most of the links are fuzzy, because GursevakDB spells many words differently (ਨਮਸਕਾਰ/ਨਮਸਕਾਰੁ, ਕੇ/ਕੈ, and Persian transliteration in Nand Lal):

  | Text | Linked | Linked to source |
  |---|---|---|
  | Vaaran Bhai Gurdas Ji + Kabit Savaiye | 9,531 / 9,580 | B, K |
  | Bhai Nand Lal Ji | 2,500 / 3,015 | N (R, A for a few Tankhahnama lines) |
  | Sri Sarbloh Granth selections | 87 / 87 | L, M, R |
  | Rehatname | 133 / 655 | R, A |

  Most of the 1,086 unlinked panktis have no counterpart in any other source in this database: Bhai Desa Singh's and Bhai Prahilad Singh's Rehatnamas, most of Ganj Nama, and Bhai Nand Lal's Punjabi Joti Bigas, Rehatnama and Tankhahnama. They are GursevakDB-only text, so there is no line to link them to.

  How each pankti was linked (`bani_verses.match`, `score`). The panktis are aligned in reading order (the source's page and line order):
  * `exact` (7,385): the same letters and vowel signs as one line.
  * `fuzzy` (4,859): similarity of the letter skeleton (letters without vowel signs, nasals or addak; difflib ratio) to one line or two consecutive lines. Accepted at ≥ 0.80 within the 30 lines after the previous link, at ≥ 0.85 anywhere, or at ≥ 0.70 for the line right after the previous link. A strong match (≥ 0.90) among the next lines wins over the same text elsewhere, so a refrain links to its own line. 4,765 fuzzy links score ≥ 0.90; the 28 below 0.85 were all checked by hand and are the same line in a variant reading.
  * `partial` (7): the pankti is ≥ 85% of a longer line that holds two panktis without a danda (Rehatname).
  * The Sundar Gutka links are the app's own (`app`, 18,243).

  `bani-links-review.csv` lists every fuzzy and partial link with its score and both texts, plus every unlinked pankti.

New tables:

    banis(bani_id, token, unicode, collection, version, version_group, credit, block_count, pankti_count, linked_panktis)
    bani_blocks(bani_id, pos, kind, unicode, pauses, section_start)   -- kind: heading/mangal/title/text/source/center; pauses JSON [[word, "l"|"s"], ...]
    bani_verses(bani_id, pos, word, verse_id, match, score)           -- the pankti starting at word `word` of block `pos`; match: app/exact/fuzzy/partial
    commentary_entries(...), commentary_lines(...)                    -- see above

Rebuild: `merge_gursevakdb_v2.py` (this folder), from the v1 database plus the app's `Data/` (Commentary.sqlite, SundarGutka.json, GursevakTexts.json) and its unpacked library (for the line-id → uid map). Counts are in `report-v2.json`, link review in `bani-links-review.csv`.

The Randhawa and Damdami Taksal texts are used with the rights holders' written permission. That permission was given to the maintainers for SikhLibrary and does not pass to you: ask Jatha Randhawa or Damdami Taksal before any reuse outside SikhLibrary, and credit them by name.

## Version 2.1 (2026-11-19): the ASCII text corrected

The `gurmukhi` and `larivaar_gurmukhi` columns (the legacy-font text BaniDB clients draw in Gurbani Akhar, Anmol Lipi, Amr Lipi or Prabhki) are made again from `unicode` with a corrected
`gurmukhi_ascii.py`. 5,201 lines change; the Unicode text is untouched. Each choice was drawn in those fonts and checked against GursevakDB's own ASCII text (`source-csv/verses/verses_ascii.txt`):

* ਃ (as in "ਸਲੋਕ ਮਃ ੩", 1,050 lines) is `Ú`. It was `@`, which these fonts draw as a joined ਹ: the heading read ਮ੍ਹ.
* Joined ਟ, ਤ, ਨ are `†`, `œ`, `˜`. They were `ˆ` (drawn as a tippi), `Û` (no glyph: a box) and `Ú` (a visarg).
* Udaat (ੑ, "ਜਿਨੑ", "ਤੁਮੑ") is `@`, the short joined ਹ. It was left as Unicode, which these fonts cannot draw.
* An aunkar or dulainkar right after a joined letter hangs below it: `ü`, `¨` ("ਸਤ੍ਰੁ" `sqRü`), as GursevakDB writes it.
* U+FE00 before ਯ ("ਧ︀ਯਾਨੁ") is the half yayya, `Î`; adhak is `` ` ``; kanna with bindi is `W`.

The same rules are the Sikhi app's (GurmukhiAscii.swift); the two give the same text for all 190,238 lines.

## Version 1 (2026-10-29)

`gursevakdb-banidb.sqlite` (v2: about 800 MB; v1 was 680 MB; called **SikhiDB** in the main dataset card) was built from github.com/gursevak/gursevakdb plus the BaniDB-format database. It speaks the BaniDB v2 API with the server in this folder (`banidb_api.py`, needs `gurmukhi_ascii.py` beside it; Python standard library only):

    python3 banidb_api.py --db gursevakdb-banidb.sqlite --port 8787

* Guru Granth Sahib (60,610 lines) and Dasam Granth (68,949) are GursevakDB's text, pagination, shabad grouping and pause marks. Other granths are carried over unchanged.
* A GursevakDB line that matches an existing line keeps its BaniDB verse id and shabad id (60,342 of 60,610 SGGS lines; 60,793 of 68,949 Dasam lines). The rest get new ids (3,000,000+ SGGS, 4,000,000+ Dasam). Every line has `uid`, GursevakDB's own id.
* Sant Singh Khalsa's English is not in the database. BaniDB's English is kept for the Dasam only, so `translation.en.bdb` and `.ssk` are empty for the Guru Granth Sahib; `.ms` (Manmohan Singh) and `.sikhi` are filled.
* Pause marks: GursevakDB's own (`;` and `.` in its text) as scheme `gursevak`, and the STTM, iGurbani, STTM2 and SGPC marks re-mapped onto its word division by letter offset (54 SGGS and 32 Dasam marks dropped where words were joined).
* Text fixes: the danda is its own token (BaniDB convention); bindi and tippi follow the vowel sign (102 lines; this was the dotted-circle glitch on Ang 1262).
* Search (median, in-process): ang page 1 ms, shabad 0.4 ms, first letters 1-2 ms, Gurmukhi phrase 4 ms, English in one granth 3 ms, English across all granths 22 ms (15,099 hits).
* Not carried over: 7,178 older ShabadOS-based lines with no GursevakDB counterpart (mostly Dasam line splits); transliteration of the 268 SGGS lines that exist only in GursevakDB.

## Files

- `gursevakdb-banidb.sqlite` — the database, v2.1 (sha256 `ae4e7ca3a9cfcf8df2210a64ed632133306dbd994e30cf306d8bca945177c89c`, SQLite `integrity_check` ok, 190,238 lines; v2 `d3bf0226…` and v1 `f0cc647e…` are in this repo's history).
- `report-v2.json` — v2 merge counts.
- `bani-links-review.csv` — every fuzzy/partial bani link (score, GursevakDB pankti, linked line) and every unlinked pankti.
- `merge_gursevakdb_v2.py` — the v2 merge script.
- `banidb_api.py`, `gurmukhi_ascii.py` — the BaniDB v2-compatible API server for this database.
- `report.json` — v1 build report (match/remap counts).
- `source-csv/` — the unmodified GursevakDB verse CSVs from github.com/gursevak/gursevakdb that the database was built from.
- `CREDITS.txt` — GursevakDB's acknowledgements; keep with any redistribution.

v1 built 2026-10-29; v2 merged 2026-11-11. Gurmukhi text/pagination/pauses are GursevakDB's; English and transliteration carried over from the BaniDB-format database. Not a scholarly certification.

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
