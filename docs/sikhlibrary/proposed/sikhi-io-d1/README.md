# sikhi.io D1 export

Public content tables exported from the Cloudflare D1 databases behind [sikhi.io](https://sikhi.io) on **2026-10-29** (UTC).

* Each table is provided as `<db>/<table>.parquet` (zstd) and `<db>/<table>.jsonl.gz` (one JSON object per row).
* Gurmukhi and all other text is UTF-8 exactly as stored in D1; scripture text was not altered.
* Binary (BLOB) columns are raw bytes in Parquet and `{"$base64": "..."}` in JSONL.
* Rows were read through the D1 query API page by page (keyset on rowid / primary key), so this is a consistent-per-table but not a cross-table transactional snapshot.
* `manifest.json` lists every table, row count, columns, dropped columns and the commit that added it.
* Privacy: only public content was exported. Account, auth, session, user, email, payment, subscription, progress, analytics, log, moderation and messaging tables were excluded, as were whole account/staging/LMS databases. Full-text-search index shadow tables (`*_fts*`) were skipped as derived data.
* **Removed 2026-11-23:** `sikhi-scripture/sggs_sggsonline` (25,137 rows), because its source, SGGS Online, prohibits database extraction. Its files were deleted from the repository's storage as well.

**Faridkot Wala Teeka (exegesis):** `sikhi-scripture/scripture_pages.*`, rows where `text = 'faridkot'` (`lang = 'gurmukhi'` is the original; other langs are translations). The page-scan text version is also in `sikhi-scripture/library_pages.*` (`book_id = 'faridkot-wala-teeka'`).

| Database | Table | Rows | Notes |
|---|---|---:|---|
| `gurbani-search` | `gurbani_commentary` | 9,509 | Commentaries: Vaaran Steek (Bhai Vir Singh), Garab Ganjani, Dr Daljit Singh Jawa, Amrit Keertan. |
| `gurbani-search` | `gurbani_translations` | 461,568 |  |
| `gurbani-search` | `gurbani_verses` | 186,984 |  |
| `gurbani-search` | `sggs_lang_index` | 156,056 |  |
| `sikhi-colonial-archive` | `archive_active` | 1 |  |
| `sikhi-colonial-archive` | `archive_chunks` | 1,627 | Chunked JSON payloads of the colonial archive catalogue release (reassemble by release/dataset/part). |
| `sikhi-colonial-archive` | `archive_documents` | 11 |  |
| `sikhi-gurbani` | `sggs_shabados` | 1,430 | SGGS per-ang content (ShabadOS source). |
| `sikhi-io-prod` | `encyclopedia_articles` | 3,148 |  |
| `sikhi-io-prod` | `gallery_images` | 7,951 |  |
| `sikhi-io-prod` | `gurbani_org_posts` | 423 |  |
| `sikhi-io-prod` | `guru_pages` | 3,016 |  |
| `sikhi-io-prod` | `hukamnama_log` | 21 |  |
| `sikhi-io-prod` | `katha_terms` | 5,774 | Glossary of terms used in katha. |
| `sikhi-io-prod` | `katha_transcripts` | 1,179 | Katha (exegesis lecture) transcripts and summaries, multi-language. |
| `sikhi-io-prod` | `kirtan_curated_playlist_tracks` | 6,263 |  |
| `sikhi-io-prod` | `kirtan_curated_playlists` | 47 |  |
| `sikhi-io-prod` | `kirtan_tracks` | 5,081 | Kirtan audio catalogue (play/download counts removed). |
| `sikhi-io-prod` | `library_books` | 947 |  |
| `sikhi-io-prod` | `library_pages` | 96,561 |  |
| `sikhi-io-prod` | `literature_articles` | 543 |  |
| `sikhi-io-prod` | `mahan_kosh` | 64,218 |  |
| `sikhi-io-prod` | `mahan_kosh_defs` | 128,436 |  |
| `sikhi-io-prod` | `punjabi_dict` | 87,636 |  |
| `sikhi-io-prod` | `radio_schedule` | 24 |  |
| `sikhi-io-prod` | `rag_chunks` | 597,055 | Search/RAG text chunks over the whole library (incl. Faridkot, katha, books). |
| `sikhi-io-prod` | `sakhi_stories` | 515 |  |
| `sikhi-io-prod` | `scripture_pages` | 24,660 | Dasam / Sarbloh pages in 12 languages. |
| `sikhi-io-prod` | `sggs_pages` | 158,730 | SGGS per-ang content in 111 languages. |
| `sikhi-io-prod` | `sikhiwiki_articles` | 13,636 |  |
| `sikhi-io-prod` | `surname_citations` | 6,704 |  |
| `sikhi-io-prod` | `timeline_events` | 27 |  |
| `sikhi-io-prod` | `verse_explanations` | 125 |  |
| `sikhi-io-prod` | `web_archive_entries` | 2,327 |  |
| `sikhi-scripture` | `library_pages` | 765,137 | Library book pages (book_id, page_number, gurmukhi, english, explanation, punjabi). |
| `sikhi-scripture` | `library_quotations` | 1,978,509 | Scripture quotations detected in library books, with transliteration/translation/citation (reviewer_id column removed). |
| `sikhi-scripture` | `scripture_pages` | 55,003 | Exegesis/teeka pages: Faridkot Wala Teeka (text="faridkot", Gurmukhi + 12 translations), Dasam and Sarbloh pages. payload is JSON with page text. |
| `sikhi-scripture` | `sggs_direct` | 1,430 | Sri Guru Granth Sahib per-ang data (direct source). |
| `sikhi-search` | `search_chunks` | 597,030 | Full-text search corpus chunks. |
| `sikhidb` | `ak_chapters` | 113 |  |
| `sikhidb` | `ak_shabads` | 2,573 |  |
| `sikhidb` | `english` | 118,687 |  |
| `sikhidb` | `meta` | 5 |  |
| `sikhidb` | `raags` | 65 |  |
| `sikhidb` | `rec` | 3,024 | z is a binary blob (base64 in JSONL as {"$base64":...}). |
| `sikhidb` | `shabads` | 15,102 |  |
| `sikhidb` | `sources` | 10 |  |
| `sikhidb` | `study_line` | 114,045 |  |
| `sikhidb` | `study_text` | 9,101 |  |
| `sikhidb` | `study_units` | 9,101 |  |
| `sikhidb` | `study_z` | 9,101 | z is a binary blob (base64 in JSONL as {"$base64":...}). |
| `sikhidb` | `translit_en` | 155,570 |  |
| `sikhidb` | `verses` | 188,992 |  |
| `sikhidb` | `writers` | 37 |  |

Total: 54 tables, 6,054,868 rows.

```python
from datasets import load_dataset
ds = load_dataset("jsdosanj/SikhLibrary", data_files="sikhi-io-d1/sikhi-scripture/scripture_pages.parquet", split="train")
fk = ds.filter(lambda r: r["text"] == "faridkot" and r["lang"] == "gurmukhi")
```

## Sources, credits and licences

These tables gather data from many organizations. **Each organization's data stays under its own licence, and you must follow the licence of every organization whose data you use**, as well as SikhLibrary's own terms (`../LICENSE.md`). Permissions given to the maintainers do not pass to you.

| Tables | Source | Licence / terms |
|---|---|---|
| `gurbani-search/*`, `sikhidb/*` (verses, translations, transliteration) | **BaniDB**, Khalis Foundation; **GursevakDB**, Gursevak; **Shabad OS** | BaniDB and Gursevak data **used with their written permission**; BaniDB's [Terms of Service](https://www.banidb.com/tos/) apply to BaniDB data. Shabad OS: code MIT, texts marked public domain. |
| `sikhi-gurbani/sggs_shabados` | **Shabad OS** | As above |
| `sikhi-io-prod/mahan_kosh*` | Bhai Kahan Singh Nabha (public domain); English **© Punjabi University, Patiala** | English used with **Punjabi University's written permission**; not for reuse outside SikhLibrary without its permission |
| `sikhi-scripture/scripture_pages` (Faridkot), `sikhi-io-prod/scripture_pages` | Faridkot Teeka (public domain by age); translations by Sikhi.io, English cleaned up with the help of **Gian Singh (Chet)**; Sarbloh text from Gian Singh (Chet), **used with his written permission** | Sikhi.io's work: CC BY-NC-ND 4.0; Gian Singh's text: his rights |
| `gurbani-search/gurbani_commentary`, `gurbani_translations` | Bhai Vir Singh; *Garab Ganjani*; Dr Daljit Singh Jawa; and the translators named in each row | Each translator's or publisher's rights |
| `sikhi-io-prod/library_*`, `sikhi-scripture/library_*`, `rag_chunks`, `search_chunks`, `surname_citations` | The books of the SikhLibrary corpus and their authors, publishers and digitizers | Each work's own rights (see `../LICENSE.md` §4) |
| `sikhi-io-prod/sikhiwiki_articles` | SikhiWiki | SikhiWiki's licence |
| `sikhi-io-prod/gurbani_org_posts` | Gurbani.org | Gurbani.org's terms |
| `sikhi-io-prod/web_archive_entries`, `gallery_images`, `encyclopedia_articles` | The websites, archives and artists named in each row (`url`, `source`, `artist`, `license` columns) | Each one's own licence |
| `sikhi-io-prod/katha_*`, `kirtan_*` | The kathavachaks and kirtanis named in each row | Their own rights |
| Everything else | Sikhi.io | CC BY-NC-ND 4.0, as `../LICENSE.md` §2 |

<img src="https://www.banidb.com/wp-content/uploads/2019/05/full-banidb-logo.png" alt="BaniDB" width="140"> Gurbani data courtesy of BaniDB, Khalis Foundation, used with permission.

This folder is part of [SikhLibrary](https://huggingface.co/datasets/jsdosanj/SikhLibrary), a gathering of the Panth's khajana from many organizations. Any organization can ask for the removal of texts it owns by writing to `akaal@sikhi.io`.
