---
license: other
license_name: sikhlibrary-compilation-license
license_link: LICENSE.md
language:
- pa
- en
- hi
- ur
- fa
- es
- fr
- de
- pt
- it
- zh
- ru
- bn
- gu
- ta
- te
- ja
- pl
- nl
- sv
- ro
- cs
- hu
- da
- ko
- ms
multilinguality:
- multilingual
size_categories:
- 10K<n<100K
tags:
- sikh
- sikhism
- sikhi
- gurbani
- guru-granth-sahib
- dasam-granth
- sarbloh-granth
- gurmukhi
- shahmukhi
- punjabi
- punjabi-literature
- sikh-history
- sikh-studies
- religious-studies
- religion
- theology
- scripture
- exegesis
- teeka
- katha
- nitnem
- mahan-kosh
- dictionary
- encyclopedia
- digital-humanities
- digital-library
- historical
- ocr
- text-corpus
- multilingual
- translation
- research
pretty_name: "SikhLibrary: The World's Largest Sikh Text Dataset (1B+ Words of Gurbani, History & Scholarship)"
extra_gated_heading: "Request access to SikhLibrary"
extra_gated_description: "Access is free, for people, and approved by hand. Read the Access & AI policy in the dataset card before you ask."
extra_gated_prompt: >-
  SikhLibrary is offered for personal study, academic research and seva. The maintainers' own contributions are licensed
  under CC BY-NC-ND 4.0; every other work in it belongs to its own rights-holder and is not licensed to you by the maintainers
  (see LICENSE.md). These terms are an agreement between you and the maintainers, in addition to those licenses, and do not
  limit fair use or fair dealing. By requesting access you agree that: (1) you are a person, and you will not give AI agents, crawlers, bots or
  automated pipelines access to these files or pass them on to anyone else; (2) you will not use any part of the dataset
  to train, fine-tune or evaluate an AI model, or to build an embedding, search or retrieval (RAG) index that others can query,
  without written permission from the maintainers; (3) you will not re-host or mirror the files; (4) you will credit
  the dataset and its original sources as the card and LICENSE.md describe, and keep every copyright notice, credit and
  CREDITS/LICENSE file with any file you use; and (5) you will follow the license or terms of every organization whose data
  you use (for example BaniDB's Terms of Service), use third-party works only for non-commercial study and research, and get
  the rights-holder's permission for anything more. Access that breaks these terms will be revoked.
extra_gated_fields:
  "Full name": text
  "Affiliation (institution, organization, sangat, or independent)": text
  "How will you use the dataset?": text
  "I am a person, not an automated agent, and I will not give AI agents, crawlers or bots access to these files": checkbox
  "I will not use the dataset to train, fine-tune or evaluate AI models, or to build a retrieval index served to others, without written permission": checkbox
  "I will not re-host, mirror or pass on the files to anyone else": checkbox
  "I agree to the license terms in LICENSE.md (CC BY-NC-ND 4.0 for the maintainers' contributions) and the attribution requirements in the card": checkbox
  "I understand that each organization's data in this dataset stays under that organization's own license, which I must follow, and that third-party works are not licensed to me by the maintainers and are for non-commercial study and research only": checkbox
extra_gated_button_content: "Request access"
---

<div align="center">

# 🪯 SikhLibrary

### The world's largest Sikh text dataset on Hugging Face

**Over 1 billion words of Gurbani, teekas, Sikh history and scholarship, in 26 languages, from 3,600+ works.**

*ਵਾਹਿਗੁਰੂ ਜੀ ਕਾ ਖਾਲਸਾ ਵਾਹਿਗੁਰੂ ਜੀ ਕੀ ਫ਼ਤਿਹ ਜੀ*

[![Hugging Face Dataset](https://img.shields.io/badge/%F0%9F%A4%97%20Hugging%20Face-SikhLibrary-yellow)](https://huggingface.co/datasets/jsdosanj/SikhLibrary)
[![Version](https://img.shields.io/badge/Version-3.4.1-informational)](#-version-history)
[![License](https://img.shields.io/badge/License-CC%20BY--NC--ND%204.0%20%2B%20source%20licenses-lightgrey)](LICENSE.md)
[![Access](https://img.shields.io/badge/Access-Free%2C%20approved%20by%20hand-orange)](#-access--ai-policy)

[![Words](https://img.shields.io/badge/Words-1.07%20billion-success)](#-at-a-glance)
[![Works](https://img.shields.io/badge/Works-3%2C616%2B-success)](#-at-a-glance)
[![Files](https://img.shields.io/badge/Files-28%2C165-blue)](#-at-a-glance)
[![Size](https://img.shields.io/badge/Size-25.6%20GB-blue)](#-at-a-glance)
[![Languages](https://img.shields.io/badge/Languages-26-blue)](#-at-a-glance)
[![Collections](https://img.shields.io/badge/Collections-115-blueviolet)](#full-index-of-the-115-top-level-collections)

[![Gurbani lines](https://img.shields.io/badge/Gurbani%20lines-190%2C238-8A2BE2)](#-gurbani-databases-for-apps)
[![Mahan Kosh](https://img.shields.io/badge/Mahan%20Kosh-64%2C218%20entries-8A2BE2)](#-whats-inside)
[![sikhi.io](https://img.shields.io/badge/Read%20online-sikhi.io-FF9933)](https://sikhi.io)
[![Cite](https://img.shields.io/badge/Cite-BibTeX-informational)](#-how-to-cite)

[**Request access**](https://huggingface.co/datasets/jsdosanj/SikhLibrary) · [**License**](LICENSE.md) · [**How to load**](#-access--loading) · [**Cite**](#-how-to-cite) · [**Remove a work you own**](#-rights-holders-notice--takedown)

</div>

---

## 📖 About SikhLibrary

**SikhLibrary** is the largest collection of Sikh texts on Hugging Face: Sikh scripture (Gurbani), exegesis (teekas and steeks), history, rehatnamas, dictionaries and modern scholarship, scanned, transcribed and organized into one machine-readable research library. It brings together Sri Guru Granth Sahib Ji, Sri Dasam Granth Sahib and Sri Sarbloh Granth Sahib with their translations and commentaries; Bhai Kahan Singh Nabha's *Mahan Kosh*; the collected works of 86 Sikh scholars, historians and saints; colonial-era chronicles; and hundreds of theses and academic studies of Sikhism.

It was built so that Sikh scholars, students, educators, kathavachaks and Gurbani-app developers can find primary sources in one place, instead of searching across scattered archives, out-of-print books and regional digital libraries.

> **A gathering of the Panth's khajana (ਖ਼ਜ਼ਾਨਾ).** SikhLibrary brings together texts, databases and translations made and kept by many Sikh organizations, scholars and digitizers. Each of them keeps its own rights and its own license. **If you use data from an organization through this dataset, you are bound by that organization's license or terms**, listed in [License, Copyright & Attribution](#-license-copyright--attribution) and in [`LICENSE.md`](LICENSE.md), as well as by this dataset's own terms. Any organization can ask for the removal of texts it owns by writing to **`akaal@sikhi.io`**.

**Who it is for:** researchers in Sikh studies, religious studies and South Asian history; students and teachers of Gurbani and Punjabi; Gurbani and Sikh-education app developers; and the sangat. Access is free and approved by hand; AI training, AI agents and scraping require written permission (see [Access & AI Policy](#-access--ai-policy)).

### Contents
- [At a Glance](#-at-a-glance)
- [The Largest Sikh Text Dataset on Hugging Face](#-the-largest-sikh-text-dataset-on-hugging-face)
- [What's Inside](#-whats-inside)
- [Directory Structure & Statistics](#-directory-structure--statistics)
- [Gurbani Databases for Apps](#-gurbani-databases-for-apps)
- [The sikhi.io Database Export](#-the-sikhiio-database-export)
- [Access & Loading](#-access--loading)
- [Access & AI Policy](#-access--ai-policy)
- [License, Copyright & Attribution](#-license-copyright--attribution)
- [Rights-holders: Notice & Takedown](#-rights-holders-notice--takedown)
- [Data Quality & Known Limitations](#-data-quality--known-limitations)
- [Version History](#-version-history)
- [FAQ](#-faq)
- [Contributing](#-contributing)
- [Acknowledgements](#-acknowledgements)
- [Related Resources](#-related-resources)
- [How to Cite](#-how-to-cite)
- [Maintainers & Contact](#-maintainers--contact)

---

## 📊 At a Glance

| | |
| :--- | :--- |
| **Words** | ~1.07 billion (measured September 2026; see [method](#-data-quality--known-limitations)) |
| **Size** | ~25.6 GB |
| **Files** | 28,165 |
| **Distinct works** | 3,616+ books, manuscripts and tracts |
| **Collections** | 115: 86 named author and scholar archives, 29 thematic and scriptural collections |
| **Languages** | 26 (`pa`, `en`, `hi`, `ur`, `fa`, `es`, `fr`, `de`, `pt`, `it`, `zh`, `ru`, `bn`, `gu`, `ta`, `te`, `ja`, `pl`, `nl`, `sv`, `ro`, `cs`, `hu`, `da`, `ko`, `ms`), plus Gurmukhi- and Shahmukhi-script editions in the Mahan Kosh |
| **Formats** | UTF-8 `.txt`, structured OCR `JSON`, `JSONL`, Parquet, SQLite |
| **Gurbani databases** | **SikhiDB** (BaniDB-compatible SQLite, 190,238 lines) and the **Sikhi Gurbani Library** (the Sikhi app's database, 179,414 lines incl. the complete Sri Sarbloh Granth Sahib); see [Gurbani Databases for Apps](#-gurbani-databases-for-apps) |
| **License** | Maintainers' compilation: [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/); each organization's data under its own license; see [`LICENSE.md`](LICENSE.md) |
| **Access** | Free, gated, approved by hand; no AI training, AI agents or scraping without written permission |
| **Version** | 3.4.1 (November 23, 2026) |

---

## 🏆 The Largest Sikh Text Dataset on Hugging Face

With **~1.07 billion words, 3,616+ works, 115 collections and 26 languages**, SikhLibrary is the largest Sikh text dataset on Hugging Face. Other Sikh and Gurbani datasets on the Hub are speech corpora of kirtan or sehaj paath, question-answering or classification sets of a few hundred to a few thousand rows, or extracts of a single work such as one teeka or the Mahan Kosh. SikhLibrary is the only one that brings scripture, exegesis, history, reference works and scholarship together in one library.

If you know of a larger Sikh text dataset, tell us in the [Discussions](https://huggingface.co/datasets/jsdosanj/SikhLibrary/discussions) and we will update this page.

---

## 📚 What's Inside

- **Primary scripture** — Sri Guru Granth Sahib, Sri Dasam Granth, Sri Sarbloh Granth, and Nitnem banis, including multilingual translations.
- **Exegesis & commentary (Teekas/Steeks)** — word-by-word meanings and classical commentaries, including Guru Granth Sahib Darpan (Prof. Sahib Singh), the Faridkot Wala Teeka, and dozens of others.
- **The complete Mahan Kosh** — Bhai Kahan Singh Nabha's *Gurushabad Ratnakar Mahan Kosh* (1930), the great Sikh encyclopedia-dictionary, as structured JSON across 28 language/script editions sharing one entry ID.
- **86 dedicated single-author archives** — the collected works of named Sikh scholars, historians, theologians, and saints (Bhai Vir Singh, Prof. Sahib Singh, Giani Sant Singh Maskeen, Dr. Ganda Singh, and 82 others), plus several Western/colonial-era chroniclers.
- **Historical chronicles & colonial-era ethnographies** — Punjab gazetteers, colonial administrative records, and 19th–20th century Western scholarship on the Sikhs.
- **Reference & discourse corpora** — a combined Punjabi dictionary (87,636 entries), katha transcripts (1,179 recordings), a katha-terms glossary, sakhi stories, and detailed per-Guru biographical pages.
- **Academic literature** — theses, dissertations, and peer-reviewed monographs on Sikh history, theology, and identity.

Each item corresponds to a top-level folder, listed in the next section.

---

## 🗂️ Directory Structure & Statistics

The repository is organized **folder-per-collection**, with most individual works further split into `<Title>_english/` and `<Title>_gurmukhi/` subfolders, each holding an `extracted_text.txt` (or `translated_text.txt`) plus a matching structured `extracted_pages.json`.

### Core scripture, exegesis & reference

| Folder(s) | Content |
| :--- | :--- |
| `Primary Scripture`, `Gurbani`, `Granths` | Sri Guru Granth Sahib, Dasam Granth, Sarbloh Granth, and the Mahan Kosh (incl. `Granths/Mahan_Kosh_Multilingual/`, the 28-language edition) |
| `Gurbani/SikhiLibrary` | The **Sikhi Gurbani Library 1.2.0**: the Gurbani database the Sikhi app ships, as one SQLite file (179,414 lines, every Granth incl. the full Sri Sarbloh Granth), with Jatha Randhawa's Gurbani Arth Bhandar line by line |
| `Steeks`, `Steeks & Teekas`, `Reference and Dictionary`, `Reference` | Exegesis, word-by-word meanings, and classical/modern commentaries |
| `Daily Prayers`, `Puratan Rehatnamas`, `Aad Dasam Sarabloh Gutka Sahibs`, `Aad Dasam Sarabloh Saroop te Bhaag`, `Aad Dasam Sarabloh Steek` | Nitnem gutkas, codes of conduct, and Dasam/Sarbloh Granth editions & commentary |

### The 15 largest collections by file count

| Rank | Folder | Files |
| :--- | :--- | ---: |
| 1 | Punjabi Literature | 5,934 |
| 2 | Research | 3,419 |
| 3 | English Literature | 2,301 |
| 4 | Historical Chronicles | 1,416 |
| 5 | Literature | 1,018 |
| 6 | English Thesis Papers | 807 |
| 7 | Bhai Vir Singh | 778 |
| 8 | Unknown Authors | 462 |
| 9 | Steeks & Teekas | 402 |
| 10 | Aad Dasam Sarabloh Gutka Sahibs | 367 |
| 11 | Spirituality | 366 |
| 12 | Giani Sant Singh Maskeen | 300 |
| 13 | Academic Literature | 279 |
| 14 | Gurbani | 275 |
| 15 | Granths | 264 |

*Every work is filed under its author or, where the author is unknown or the work is a compilation, under the thematic collection that fits its content.*

### Full index of the 115 top-level collections

<details>
<summary><strong>86 named authors, scholars, saints & historians</strong> — click to expand</summary>

Abinash Mahapatra · Akali Kaur Singh · Baba Gajjan Singh Tarna Dal · Baba Ganesha Singh Bedi · Baba Prem Singh Hoti Mardan · Baba Sumer Singh · Bhagat Jaswant Singh Daudar DDT · Bhai Chaupa Singh · Bhai Desa Singh · Bhai Hira Singh Dard · Bhai Joginder Singh Talwara · Bhai Kahn Singh Nabha · Bhai Raghbir Singh Bir · Bhai Rama Singh UK · Bhai Randhir Singh Narangwal · Bhai Sohan Singh Sital · Bhai Surinder Singh Kohli · Bhai Vir Singh · C.F. Massy · Dorothy Field · Dr Ajit Singh Alaukh · Dr Darshan Singh · Dr Ganda Singh · Dr Gurcharan Singh Alaukh · Dr Gurcharan Singh Mehta · Dr Jagjit Singh Kanpuri · Dr Kamalroop Singh · Giani Bishan Singh · Giani Ditt Singh · Giani Gian Singh · Giani Gurbachan Singh Bhindranwale · Giani Gurdit Singh · Giani Gurvinder Singh Nangli · Giani Harbans Singh · Giani Jaswant Singh · Giani Kirpal Singh SGPC · Giani Mal Singh Darbar Sahib · Giani Nahar Singh AKJ · Giani Pritam Singh Likhari · Giani Sant Singh Maskeen · Giani Sher Singh SGPC · Griffin and Massy · Hari Ram Gupta · Harnam Daas Udasi · Hirdey Ram · Hutchison and Vogel · Kavi Santokh Singh · Lala Sri Ram · Lepel Griffin · Mahant Amir Singh Mukatsar · Mahant Ganesha Singh · Mahant Sadhu Singh · Max Arthur Macauliffe · Meharban Singh Sodhi · Pandit Giani Nairayan Singh Lahore · Pandit Gobind Singh · Pandit Gulab Singh Nirmala · Pandit Ishar Singh Kanshi · Pandit Kartar Singh Dakha · Pandit Tara Singh Narotam · Prof Sahib Singh · Pyara Singh Padam · Raja Mrigend Singh · Sant Hari Singh Randhawa · Sant Jagjit Singh Harkhowal · Sant Jodh Singh Rishikesh · Sant Kartar Singh Nirmala · Sant Kirpal Singh Sato Gali · Sant Makhan Singh Sato Gali Taksal · Sant Nihal Singh Nirmala · Sant Seva Singh Rampur Khera · Sant Seva Singh Sevapanthi · Sant Surjit Singh Sevapanthi · Sant Tehil Singh · Sant Waryam Singh Ratwara Sahib · Seeta Ram Tandon · Sodhi Teja Singh · Sohan Lal Suri · Subedar Baghel Singh · Swami Ram Singh Nirmale · Swami Rama · Swaran Singh Virk · Tapoban Sahib · W.H. McLeod · William Crooke · Yogi Bhajan

</details>

<details>
<summary><strong>29 thematic & scriptural collections</strong> — click to expand</summary>

Aad Dasam Sarabloh Gutka Sahibs · Aad Dasam Sarabloh Saroop te Bhaag · Aad Dasam Sarabloh Steek · Academic Literature · Academic Research · Additional Granths attributed to Guru Sahib · Bhagavad Gita · Colonial Sikh History · Daily Prayers · English Literature · English Thesis Papers · Granths · GurBilas Paatshahi 6 and 10 · Gurbani · Hindi Literature · Historical Chronicles · Literature · Primary Scripture · Punjabi Literature · Puratan Rehatnamas · Reference · Reference and Dictionary · Research · Sampardai Bhindera · Spirituality · Steeks · Steeks & Teekas · Unknown Authors · Vedant Literature

</details>

---

## 📱 Gurbani Databases for Apps

SikhLibrary includes two ready-to-use Gurbani databases: **SikhiDB**, in BaniDB's format, and the **Sikhi Gurbani Library**, the database inside the Sikhi app.

### SikhiDB (`Gurbani/GursevakDB/`)

**SikhiDB** is one SQLite file, `Gurbani/GursevakDB/gursevakdb-banidb.sqlite` (801 MB), in **BaniDB's v2 format**, so code written for BaniDB works with it. In it:

- **Gurbani:** Guru Granth Sahib (60,610 lines) and Dasam Granth (68,949) in GursevakDB's text, pagination and shabad grouping, plus Vaaran and Kabit Savaiye Bhai Gurdas Ji, Bhai Nand Lal Ji, Sri Sarbloh Granth, Amrit Keertan and the Rehatname (190,238 lines).
- **Translations and teekas:** in English, Punjabi, Hindi and Spanish (`translations`, keyed by translator).
- **Transliteration:** English, Hindi, Urdu and IPA (`transliterations`).
- **Vishraams:** six schemes (`visraam`: `gursevak`, `sttm`, `sttm2`, `igurbani`, `sgpc`, `bhagat`).
- **Jatha Randhawa · Gurbani Arth Bhandar:** the commentary on 59,008 Guru Granth Sahib lines.
- **Banis:** 144 (Damdami Taksal Sundar Gutka, with Taksali, Hazuri and Buddha Dal printings, plus GursevakDB's granths), each line linked to its verse where possible.

What changed in each version, and how lines were matched, is documented in [`Gurbani/GursevakDB/README.md`](Gurbani/GursevakDB/README.md).

#### 1. Download it (after your access is approved)

```python
from huggingface_hub import hf_hub_download
db_path = hf_hub_download("jsdosanj/SikhLibrary", "Gurbani/GursevakDB/gursevakdb-banidb.sqlite", repo_type="dataset")
```

#### 2a. Query it directly (any language with SQLite: Swift, Kotlin, JavaScript, Python …)

```sql
-- Ang 1 of Sri Guru Granth Sahib (source G; D = Dasam Granth)
SELECT verse_id, shabad_id, unicode FROM verses WHERE source_id = 'G' AND page_no = 1 ORDER BY verse_id;

-- A whole shabad
SELECT verse_id, unicode FROM verses WHERE shabad_id = 1 ORDER BY verse_id;

-- First-letter search (ਸੋਚੈ ਸੋਚਿ ਨ ਹੋਵਈ → ਸਸਨਹ)
SELECT verse_id, page_no, unicode FROM verses WHERE source_id = 'G' AND first_letters LIKE 'ਸਸਨਹ%';

-- Translations of a line (ms = Manmohan Singh, randhawa = Gurbani Arth Bhandar arth, …)
SELECT translator, lang, text FROM translations WHERE verse_id = 1;

-- The full Gurbani Arth Bhandar entries for a line: uthanka, arth, parman, sakhi, Q&A
SELECT c.* FROM commentary_lines l JOIN commentary_entries c USING (entry_id) WHERE l.verse_id = 5;

-- The printings of Rehras Sahib, and one bani's paragraphs with their linked verses
SELECT bani_id, token, unicode, version FROM banis WHERE version_group = 'rehras';
SELECT k.pos, k.kind, k.unicode, k.pauses, bv.verse_id
FROM bani_blocks k LEFT JOIN bani_verses bv ON bv.bani_id = k.bani_id AND bv.pos = k.pos AND bv.word = 0
WHERE k.bani_id = (SELECT bani_id FROM banis WHERE token = 'bani_comma_rehras') ORDER BY k.pos;
```

#### 2b. Or serve BaniDB's API from it

`Gurbani/GursevakDB/banidb_api.py` (with `gurmukhi_ascii.py` beside it) is a single-file server, Python standard library only. It answers the same paths, parameters and JSON as `https://api.banidb.com/v2`: angs, shabads, random, sources, writers, raags, and search types 0–7. An app built on BaniDB can point at it by changing the base URL.

```bash
python3 banidb_api.py --db gursevakdb-banidb.sqlite --port 8787
curl "http://127.0.0.1:8787/v2/angs/1/G"
curl "http://127.0.0.1:8787/v2/search/ssnh?searchtype=0"   # first letters, legacy-font or Unicode
```

Run it for your own app. A public endpoint that serves the database to others is a retrieval service, so it needs permission (see the [Access & AI Policy](#-access--ai-policy)). `banidb_api.py` is an independent re-implementation of BaniDB's public API shape for compatibility; it is not BaniDB's code and is not provided or endorsed by the Khalis Foundation.

#### 3. Shipping it in an app

- **License:** SikhiDB is part of this dataset. The maintainers' work in it (the merge, links, schema and scripts) is CC BY-NC-ND 4.0, plus the Access & AI Policy; its Gurbani text, translations and commentary belong to the sources credited below and in [`LICENSE.md`](LICENSE.md), and their terms apply too, including [BaniDB's Terms of Service](https://www.banidb.com/tos/) for the BaniDB data it carries (an app that shows BaniDB data must acknowledge BaniDB and show its logo). The permissions Gursevak, Jatha Randhawa and Damdami Taksal gave the maintainers do not extend to your app: **to ship their text or commentary, ask them as well as us.** To ship a **trimmed or modified copy** (most mobile apps will want a smaller file), or for any commercial use, ask first in [Discussions](https://huggingface.co/datasets/jsdosanj/SikhLibrary/discussions); we want SikhiDB in Gurbani apps and will help.
- **Credit in your app:** GursevakDB (Gursevak, gursevak.com), Shabad OS, BaniDB (Khalis Foundation), the translators of any translation you show, Jatha Randhawa · Gurbani Arth Bhandar (where you show the commentary), Damdami Taksal · Sundar Gutka (where you show its banis), and SikhLibrary. Ship `CREDITS.txt` with the file. Do not suggest that BaniDB, Gursevak or Shabad OS endorse your app.
- **Size:** the FTS search indexes are a large part of the file. An app that searches with its own index or with SQL `LIKE` on `first_letters` can work from a smaller copy (ask, as above).
- **Ids:** `verse_id` and `shabad_id` match BaniDB's wherever GursevakDB's line matches BaniDB's (60,342 of 60,610 SGGS lines). Every line also has `uid`, GursevakDB's own line id; use it as the key to follow a line from one SikhiDB version to the next.

### The Sikhi Gurbani Library (`Gurbani/SikhiLibrary/`)

The database the **Sikhi app** (sikhi.io) ships, version 1.2.0: one SQLite file, ready to open, with the search indexes the app uses. It is a different shape from SikhiDB (not BaniDB's format): a `verses` table with one row per line (`g` Gurmukhi, `fl`/`fls` first letters, `en` English, `rm` transliteration, `writer`, `raag`, `ang`, `shabad`), the full records LZMA-compressed in `rz`, and FTS5 indexes (`tg_*`) for words, first letters, English and phonetic search.

| Granth | Lines |
| :--- | ---: |
| Sri Dasam Granth Sahib | 68,949 |
| Sri Guru Granth Sahib Ji | 60,610 |
| Sri Sarbloh Granth Sahib (complete) | 35,994 |
| Vaaran Bhai Gurdas Ji | 7,950 |
| Kabit Savaiye Bhai Gurdas Ji | 2,762 |
| Bhai Nand Lal Ji | 2,559 |
| Bhai Gurdas Singh Ji | 352 |
| Rehatname | 238 |
| **Total** | **179,414** |

```python
from huggingface_hub import hf_hub_download
db = hf_hub_download("jsdosanj/SikhLibrary", "Gurbani/SikhiLibrary/GurbaniIndex.sqlite", repo_type="dataset")
```

Its own [`README.md`](Gurbani/SikhiLibrary/README.md) lists the tables, what is new in 1.2.0, and the sources to credit.

---

## 💾 The sikhi.io Database Export

Public content tables exported on 2026-10-29 from the Cloudflare D1 databases behind sikhi.io (gurbani-search, sikhi-colonial-archive, sikhi-gurbani, sikhi-io-prod, sikhi-scripture, sikhi-search, sikhidb), as Parquet (zstd) + JSONL.gz with Gurmukhi text unchanged: **54 tables, 6,054,868 rows**. Third-party content in these tables keeps its owners' rights (see [`LICENSE.md`](LICENSE.md) §4). This includes the **Faridkot Wala Teeka** exegesis shown on sikhi.io/exegesis (`sikhi-io-d1/sikhi-scripture/scripture_pages.*`, `text = 'faridkot'`), katha transcripts and glossary, SGGS multilingual pages, Mahan Kosh, Punjabi dictionary, library pages and search corpora. No user, account or analytics data is included. See [`sikhi-io-d1/README.md`](sikhi-io-d1/README.md) and [`sikhi-io-d1/manifest.json`](sikhi-io-d1/manifest.json) for per-table row counts and sources.

---

## 💻 Access & Loading

Access is **gated but free** — request access on the [dataset page](https://huggingface.co/datasets/jsdosanj/SikhLibrary), then authenticate locally.

> **Note for `datasets` library users:** this repository is a raw, folder-per-work file tree (no dataset loading script or parquet export), so `datasets.load_dataset()` will not auto-parse it into rows — the Hub's Dataset Viewer shows this correctly as "0 rows." Use `snapshot_download` or the `hf` CLI below to pull the raw files, then parse the `.txt`/`.json` files directly for your use case.

### Python

```python
from huggingface_hub import snapshot_download

# Download the entire corpus (~25.6 GB) to a local directory
local_dir = snapshot_download(
    repo_id="jsdosanj/SikhLibrary",
    repo_type="dataset",
)

# Or download just one collection, e.g. the complete Mahan Kosh
local_dir = snapshot_download(
    repo_id="jsdosanj/SikhLibrary",
    repo_type="dataset",
    allow_patterns=["Granths/Mahan_Kosh_Multilingual/**"],
)
```

```python
from huggingface_hub import hf_hub_download

# Download a single file
path = hf_hub_download(
    repo_id="jsdosanj/SikhLibrary",
    repo_type="dataset",
    filename="Granths/Mahan_Kosh_Multilingual/data/entries/en.json",
)
```

### Shell

```bash
# Authenticate once (device-flow login)
hf auth login

# Download the entire corpus
hf download jsdosanj/SikhLibrary --repo-type dataset --local-dir ./SikhLibrary

# Download just one collection
hf download jsdosanj/SikhLibrary --repo-type dataset \
  --include "Bhai Vir Singh/**" --local-dir ./SikhLibrary
```

`git clone` also works, but this repository uses Git LFS for large files — install `git-lfs` first (`git lfs install`) or the clone will leave LFS pointer files instead of real content.

---

## 🔒 Access & AI Policy

SikhLibrary holds Gurbani, the life's work of Sikh scholars and saints, and copyrighted editions shared for study. It is offered **to people**, for study, research and seva.

**The access agreement.** To get access you accept the terms in the request form. They are a contract between you and the maintainers, and they apply **in addition to** the licenses described in [License, Copyright & Attribution](#-license-copyright--attribution). Where the agreement is narrower than a license, the agreement governs **your** use of the copy you obtained here. It does not limit what you may do with a work you obtain elsewhere under its owner's open license (for example the Mahan Kosh from [its GitHub home](https://github.com/redroyals/mahan-kosh-multilingual)), or what fair use, fair dealing or any other exception in copyright law allows.

**Not permitted** without written permission from the maintainers:
- access by **AI agents, crawlers, bots or automated pipelines**, including passing your access on to one;
- **training, fine-tuning or evaluating AI models** on any part of the dataset;
- building an **embedding, search or retrieval (RAG) index** of it that others can query;
- **re-hosting, mirroring or passing on** the files to anyone else. Point people to this page instead, so that each person accepts these terms and every rights-holder's notice stays attached.

**How this is enforced:**
- Access is **gated and approved by hand**. Every request is read by a maintainer, and the request form asks who you are, why you want access, and for your agreement to the terms above.
- The Hugging Face file viewer and Dataset Viewer show file contents only to approved accounts. File names and this card stay public.
- There is no public copy elsewhere on Hugging Face. The former *SikhLibrarian* Space, a public AI search over the corpus, was retired on 2026-11-11, and its storage bucket (which held an index of the text) is private.
- Access that breaks these terms is revoked, and the maintainers may report the breach to the affected rights-holders.

**Scope:** no setting can stop an approved person from copying files they have downloaded, and Hugging Face does not let a dataset owner set `robots.txt` or crawler headers. These terms are a condition of access, and we act on breaches.

To ask for permission (for example, for a Gurbani app or a research model), open a [Discussion](https://huggingface.co/datasets/jsdosanj/SikhLibrary/discussions). Permission from the maintainers covers only what the maintainers own; for third-party works you also need the rights-holder's permission (see below).

---

## ⚖️ License, Copyright & Attribution

> **Summary.** SikhLibrary is a *compilation*. The maintainers license only what they own, under CC BY-NC-ND 4.0. Every other work in it keeps its own owner and its own terms, and **nothing on this page grants you a license to a work the maintainers do not own.** The full terms, and the notice for every source, are in [`LICENSE.md`](LICENSE.md). If this card and `LICENSE.md` differ, `LICENSE.md` governs.

### 1. What the maintainers license: CC BY-NC-ND 4.0

The maintainers' own contributions are licensed under **[CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/)** (Attribution–NonCommercial–NoDerivatives). These are:
- the **selection, arrangement and structure** of the collection (folders, file naming, per-book JSON layout, manifests);
- the **OCR transcriptions and extracted text** the maintainers produced, to the extent they carry any copyright of their own;
- **translations, metadata, indexes, scripts and documentation** written by the maintainers or by Sikhi.io for this dataset (including this card, `merge_gursevakdb_v2.py`, `banidb_api.py` and `gurmukhi_ascii.py`);
- the original works of **Bhai Jasvant Singh Panchhi** included here.

Within that scope, **you may** download the files unmodified and use them for personal study, academic research and other non-commercial purposes, subject to the [Access & AI Policy](#-access--ai-policy). **You may not** use them commercially, or distribute a modified or derived version.

### 2. What the maintainers do *not* license: third-party works

Most of the text in this corpus was written, translated, edited, published or digitized by **someone else**. For each such work:
- **Its copyright stays with its owner.** The CC license in §1 does **not** apply to it, and including it here is not a claim of ownership and not a grant of rights in it.
- **It is included for non-commercial study and research**, under the permissions listed in §3 where we have them, and otherwise as an archival research copy that we remove on request (see [Rights-holders: notice & takedown](#-rights-holders-notice--takedown)).
- **Before you reuse it beyond private study**, check its own front matter and get any permission you need from its owner. Your use of it is your responsibility.

Gurbani itself (Sri Guru Granth Sahib Ji, Sri Dasam Granth Sahib, Sri Sarbloh Granth Sahib, Vaaran and Kabit of Bhai Gurdas Ji, Bhai Nand Lal Ji) is centuries old and belongs to the Panth, not to any database or to us. Particular **digital editions** of it (their corrections, pagination, vishraams, line ids and accompanying translations) can carry their makers' rights and terms, which is why the Gurbani databases below are credited and their terms respected.

**Older works.** Colonial-era works published before 1900 (for example Crooke, Griffin, Massy, Hutchison and Vogel) and Macauliffe's *The Sikh Religion* (1909; Macauliffe d. 1913) are public domain in most countries by age. In India, copyright lasts for the author's life plus 60 years, so the works of Bhai Kahan Singh Nabha (d. 1938) and Bhai Vir Singh (d. 1957) are public domain there, while those of **Prof. Sahib Singh (d. 1977) stay in copyright in India until the end of 2037**. In the United States a work is protected for 95 years from publication, regardless of when its author died, so a book first published after 1930 may still be in copyright there. A later editor's, annotator's or translator's version has its own, newer copyright. We make no blanket claim.

**Live, institutional rights.** Some works are very likely still in copyright and are held by publishers who are outside the Sikh-publishing ecosystem or who enforce actively (Oxford University Press, Human Rights Watch, ProQuest/UMI, the Kundalini Research Institute for Yogi Bhajan's works, the Himalayan Institute for Swami Rama's, and W.H. McLeod's estate). They are included only as archival research copies, and are removed at their owners' request.

**Changes in the license over time.** From 2026-03-30 to 2026-04-12 the dataset was published under CC BY 4.0. A CC license cannot be withdrawn for copies already received, so the maintainers' own material in copies obtained in that window remains under CC BY 4.0 for those recipients. That earlier license never covered third-party works, because the maintainers could not license what they did not own.

### 3. Sources, credits and their terms

| Source | Legal owner / steward | What is used, and where | Terms we follow |
| :--- | :--- | :--- | :--- |
| **BaniDB** ([banidb.com](https://www.banidb.com))<br><img src="https://www.banidb.com/wp-content/uploads/2019/05/full-banidb-logo.png" alt="BaniDB" width="140"> | **Khalis Foundation**, a California non-profit | The BaniDB v2 database format and API shape; English and transliteration carried in SikhiDB (`Gurbani/GursevakDB/`) and in `sikhi-io-d1/` | **Used with the written permission of the Khalis Foundation.** BaniDB data stays under BaniDB's [Terms of Service](https://www.banidb.com/tos/) and the [Non-Profit Open Software License 3.0](https://www.banidb.com/nposl/) they reference; **anyone who uses BaniDB data from this dataset must follow those terms**, including written acknowledgement of BaniDB and its logo in their project. Credit: *"Gurbani data courtesy of BaniDB, Khalis Foundation."* `banidb_api.py` is an independent re-implementation and contains no BaniDB code. |
| **GursevakDB / Gursevak** ([gursevak.com](https://www.gursevak.com)) | **Dear Father Brave Guru God's Slave Society** ("Gursevak"), a registered charity | Guru Granth Sahib and Dasam Granth text, pagination, shabad grouping, vishraams and pronunciation tips (SikhiDB and the Sikhi Gurbani Library); unmodified verse CSVs in `Gurbani/GursevakDB/source-csv/` | **Used with the written permission of Gursevak.** Gursevak has published no open license, so its data may not be reused outside this dataset without Gursevak's own permission. `Gurbani/GursevakDB/CREDITS.txt` is Gursevak's own acknowledgement and **must stay with any copy.** Gursevak credits Baba Darshan Singh Ji Mallehwal, Bhai Manraj Singh Ji (Akal Design), Siri Guru Granth Sahib Academy Malaysia, Bhai Binod Singh Ji, Bhai Sant Singh Khalsa Ji and Bibi Inderpreet Kaur Ji (Darer Designs), with their sevadaars. |
| **Shabad OS** ([shabados.com](https://shabados.com)) | **Shabad OS Organization and Contributors** | Base Gurbani database (v5.0.0-next.0) of the Sikhi Gurbani Library; SGGS per-ang content in `sikhi-io-d1/sikhi-gurbani/` | Code: MIT License, © Shabad OS Organization and Contributors. Texts: marked public domain by Shabad OS. We honour its integrity condition: Gurbani is not added to, deleted from or altered in a way that distorts it. |
| **GurmatVeechar.com** ([gurmatveechar.com](https://www.gurmatveechar.com)) | GurmatVeechar.com | 509 works whose file names carry `(GurmatVeechar.com)`, e.g. the *Amir Bhandar* teeka | No license published. The `(GurmatVeechar.com)` tag is kept in every file name as its credit. Underlying works keep their authors' and publishers' rights. |
| **Sikhi.io** ([sikhi.io](https://sikhi.io)) | Sikhi.io | Digitized library, translations, `sikhi-io-library/`, `sikhi-io-d1/`, the Sikhi Gurbani Library, the Mahan Kosh packaging, the OCR pipeline | Contributed by the maintainers; covered by §1 except for the third-party works it carries. |
| **Jatha Randhawa · Gurbani Arth Bhandar** | Sant Hari Singh Ji Randhawe Wale / Jatha Randhawa | Line-by-line SGGS commentary (`Commentary.sqlite`, SikhiDB `commentary_*`) | **Used with the written permission of Jatha Randhawa.** Not covered by §1; no reuse outside this dataset without Jatha Randhawa's permission. |
| **Damdami Taksal · Sundar Gutka** | Damdami Taksal | 87 banis with vishraams from the Damdami Taksal *Sundar Gutka* app (SikhiDB `banis`), and works bearing its copyright notice | **Used with the written permission of Damdami Taksal.** Not covered by §1; no reuse outside this dataset without Damdami Taksal's permission. |
| **Gian Singh (Chet)** | Gian Singh (Chet) | Full text of Sri Sarbloh Granth Sahib (Sikhi Gurbani Library); his help building the Sikhi app and cleaning up the English Faridkot Teeka (`a.ft_en` in the Sikhi Gurbani Library; `mahan-kosh-multilingual/data/reading-aids/faridkot/`) | **Used with his written permission.** Not covered by §1; no reuse of his Sarbloh Granth text outside this dataset without his permission. |
| **Mahan Kosh** | Bhai Kahan Singh Nabha (1930, public domain); English edition **© Punjabi University, Patiala** | `Granths/Mahan_Kosh_Multilingual/`, `mahan-kosh-multilingual/`, `Granths/Mahan_Kosh_Dictionary/` | The 1930 Gurmukhi text is public domain. **The English text is Punjabi University, Patiala's, used with its written permission; it stays under Punjabi University's copyright** and is not under CC BY 4.0 or §1. Sikhi.io's own packaging, Hindi text and viewer are CC BY 4.0 (see each folder's `LICENSE`). |
| **Translations & teekas** inside the Gurbani databases | Their translators and publishers | Faridkot Teeka; Prof. Sahib Singh's *Darpan*; Dr. Sant Singh Khalsa's English; Bhai Manmohan Singh's English (SGPC); Bhai Vir Singh; Dr. Ratan Singh Jaggi; Dr. Surinder Singh Kohli; Dr. Daljit Singh Jawa; and others named in each record | Credited by name in each record. Not covered by §1. Modern translations (e.g. Sant Singh Khalsa, Manmohan Singh) are in copyright. |
| **Digitizers** | Panjab Digital Library; Sri Satguru Jagjit Singh Ji E-Library ("Namdhari E-Library"); Internet Archive; Google Books | Scans that were OCR'd into this corpus | Their imprints and watermarks are kept where they appear. Google Books scans: non-commercial use, keep the attribution, no automated querying, per Google's usage guidelines. |
| **Punjabi University, Patiala** (Publication Bureau) | Punjabi University, Patiala | The Mahan Kosh English edition, and its publications in this corpus (≥358 works) | **Used with the written permission of Punjabi University, Patiala.** They stay under the University's copyright; no reuse outside this dataset without its permission. |
| **Original publishers & copyright holders** | SGPC; Language Department Punjab; Bhai Vir Singh Sahit Sadan; Damdami Taksal; Bhai Sahib Randhir Singh Trust; Guru Nanak Foundation, Bhatinda; Oxford University Press; Human Rights Watch; ProQuest/UMI | Works bearing their notices (see the audit below) | Their notices are kept with each work. Not covered by §1. |
| **Web sources** in `sikhi-io-d1/` | SikhiWiki; Gurbani.org; Sikh web archives | `sikhiwiki_articles`, `gurbani_org_posts`, `web_archive_entries`, `gallery_images` | Each site's own license applies; see `LICENSE.md` §4. |
| **Named authors** | The 86 authors in the [index](#full-index-of-the-115-top-level-collections), their estates and publishers | Their folders | Their rights are reserved to them. |

**No endorsement.** The organizations and people above are credited because their work is used. None of them has reviewed, sponsored or endorsed SikhLibrary unless this page says so, and their names and marks (including *BaniDB*, *Shabad OS*, *Gursevak* and *GurmatVeechar*) belong to them. "BaniDB-compatible" and "BaniDB format" describe compatibility only.

### 4. Rights-holders identified in the corpus

Most scanned books keep their original title and copyright page in the OCR'd text, so each work's publisher, digitizer or rights-holder can be read from the work itself. The table below comes from a corpus-wide scan (September 2026) of file-name source tags (complete) and of the opening pages of 9,086 of the 10,799 `.txt` files (so its figures are **lower bounds**).

| Source (as printed in the work) | Role | Works found |
| :--- | :--- | ---: |
| GurmatVeechar.com | digitization / hosting (in filename) | 509 *(exact)* |
| sikhi.io | production-library source tag (in filename) | 4 bulk archives *(exact)* |
| Punjabi University, Patiala (Publication Bureau) | original publisher | ≥358 |
| SGPC (Shiromani Gurdwara Parbandhak Committee) | original publisher | ≥194 |
| Panjab Digital Library (panjabdigilib.org) | digitizer | ≥158 |
| Bhai Vir Singh Sahit Sadan, New Delhi | copyright holder | ≥137 |
| Damdami Taksal | publisher / copyright holder | ≥78 |
| Sri Satguru Jagjit Singh Ji E-Library ("**Namdhari E-Library**," `NamdhariElibrary@gmail.com`) | digitizer | ≥40 |
| Language Department, Punjab | original publisher | ≥37 |
| Oxford University Press | copyright holder (modern academic monographs) | ≥32 |
| Human Rights Watch | copyright holder (modern reports — see caution) | ≥32 |
| Bhai Sahib Randhir Singh Trust | copyright holder | ≥26 |
| Internet Archive | digitizer | ≥23 |
| Google Books | digitizer | ≥20 |
| Guru Nanak Foundation, Bhatinda | copyright holder | ≥11 |
| ProQuest LLC / UMI Dissertation Publishing | copyright holder (doctoral dissertation) | ≥1 |

This table records what is printed or embedded in the files themselves; it is not a legal opinion on the copyright status of any work.

### 5. Your obligations, and the attribution requirement

**Follow each organization's license.** This dataset is a gathering of many organizations' work. When you use data that came from an organization — BaniDB, Gursevak, Shabad OS, Jatha Randhawa, Damdami Taksal, Punjabi University, Gian Singh (Chet), a publisher or an author — you must follow **that organization's license or terms** (§3 and [`LICENSE.md`](LICENSE.md)) as well as this dataset's. The permissions listed above were given to the maintainers for this dataset; they do not pass to you. If you want to use an organization's data outside this dataset, ask that organization.

Any use of this dataset must credit:
- **SikhLibrary** (`jsdosanj/SikhLibrary`) on Hugging Face, with a link to this page and the license, and a note of any changes you made;
- **Original dataset:** Bhai Jasvant Singh ਪੰਛੀ (Panchhi), whose personal library of over 1,200 books, and his translations of it, are the foundation of this corpus;
- **Contributing sources:** Sikhi.io; **BaniDB (Khalis Foundation)**, with the BaniDB logo where its terms ask for it; **GursevakDB (Gursevak — Dear Father Brave Guru God's Slave Society)**; **Shabad OS**; **GurmatVeechar.com**; SGPC; Sri Satguru Jagjit Singh Ji E-Library ("Namdhari E-Library"); Punjabi University Patiala (Publication Bureau); Panjab Digital Library; Language Department Punjab; Internet Archive; Google Books;
- **the original author, translator, publisher and digitizer of each individual work you use**, as printed in that work and listed in §3;
- the folder-specific credits in §3 and in each folder's own `README.md`, `LICENSE` or `CREDITS.txt`.

Suggested credit line: *"Contains material from SikhLibrary (huggingface.co/datasets/jsdosanj/SikhLibrary), compiled by Bhai Jasvant Singh Panchhi and Sukhjeet Singh Sodhi, LLB (Hons), with Gurbani data from GursevakDB (Gursevak), Shabad OS and BaniDB (Khalis Foundation). Compilation licensed CC BY-NC-ND 4.0; individual works © their respective owners."*

### 6. No warranty

The dataset is provided **as is**, without warranty of any kind, including any warranty that a work's copyright status is as described. To the extent the law allows, the maintainers are not liable for any use of it. This card is not legal advice.

---

## 📮 Rights-holders: Notice & Takedown

**Any organization or author can ask for the removal of texts it owns** — or for a corrected credit or a license discussion — and we will act on it. **You do not need to send a formal legal notice**, and you may write privately.

**Write to:** `akaal@sikhi.io` with *"SikhLibrary rights notice"* in the subject, or open a [Discussion](https://huggingface.co/datasets/jsdosanj/SikhLibrary/discussions) if you prefer to raise it publicly. Please include:
1. the work, and your relationship to it (owner, or authorized to act for the owner);
2. where it is in this dataset (folder or file path, or a link);
3. what you want: removal, a corrected credit, or a license discussion;
4. how to contact you.

A notice under the U.S. Digital Millennium Copyright Act (17 U.S.C. § 512(c)(3)) is also accepted at the same address; it should add your physical or electronic signature, a statement of good-faith belief that the use is not authorized, and a statement, under penalty of perjury, that the notice is accurate and that you are authorized to act for the owner. You may instead notify Hugging Face, which hosts this dataset, through its own [content policy and DMCA process](https://huggingface.co/content-guidelines).

**What we do:**
- We acknowledge a notice within **3 business days**.
- While we check it, we **restrict access** to the work (it is removed from the current revision and new access requests for it are not served).
- If the claim is substantiated, the work is **deleted, including from the repository's history**, so that it cannot be fetched from an earlier commit, and we record the removal (work, date, reason) in the [Version History](#-version-history) without republishing the work.
- If you uploaded something that was removed and believe that was a mistake, reply to the removal notice with your reasons; we will reconsider, and follow the counter-notice procedure of 17 U.S.C. § 512(g) where a DMCA notice was involved.

---

## 🔬 Data Quality & Known Limitations

- **Word count methodology:** the ~1.07 billion figure is not a raw exact count — recomputing every file exactly was impractical at this scale — but a **ratio estimator**: the words-per-byte ratio measured on a random sample of 1,500 of the 10,797 `.txt` files (135.8M sampled words / 1.27 GB sampled bytes) was applied to the exact total byte size of all `.txt` files (9.43 GB), giving **~1.01 billion words** (95% bootstrap CI: 940M–1,087M) for the plain-text corpus, **plus ~60.9 million words** independently measured by fully parsing six representative Mahan Kosh JSON files and applying that ratio to the folder's exact 723 MB size. It replaces the earlier self-reported figure (808M), which predated the 2026 expansions.
- **OCR artifacts:** most text was produced by an automated OCR/extraction pipeline (OpenRouter, Gemini and Gemma family models) and has not been manually proofread. Expect occasional misrecognized characters, broken diacritics, or page-break artifacts, especially in older scanned books.
- **Machine translation:** non-English, non-Gurmukhi language editions in the Mahan Kosh (25 of 28 languages) are machine translations of the English spine, not independent scholarly translations — do not cite them as Bhai Kahan Singh Nabha's own words. Korean and Malay were fidelity-audited in September 2026; the rest have not been.
- **Per-book JSON is not additional text:** each work's `extracted_pages.json` / `translated_pages.json` mirrors its sibling `.txt` file's content in a paginated structure — it is not independent text and was excluded from the word-count estimate to avoid double-counting.
- **Rights-holder counts are lower bounds:** the scan in [§4](#4-rights-holders-identified-in-the-corpus) read the opening pages of 84% of `.txt` files.
- **Check each work, not its folder:** thematic folders such as "Historical Chronicles," "Research" and "Unknown Authors" hold works from many sources with different rights. Read a work's own front matter before relying on its status. 730 works were filed into folders by a language model reading their front matter; placement is accurate but not infallible.

---

## 🕐 Version History

| Version | Date | Files | Highlights |
| :--- | :--- | ---: | :--- |
| **3.4.1** | 2026-11-23 | 28,165 | **Licensing, permissions & attribution.** Written permissions recorded for BaniDB (Khalis Foundation), Gursevak, Jatha Randhawa, Damdami Taksal, Gian Singh (Chet) and Punjabi University, Patiala; each organization's license stated in every README; new [`LICENSE.md`](LICENSE.md); [notice and takedown](#-rights-holders-notice--takedown). Removed `sikhi-io-d1/sikhi-scripture/sggs_sggsonline` (25,137 rows), whose source prohibits database extraction, including from stored history. |
| **3.4** | 2026-11-19 | 28,165 | **The Sikhi Gurbani Library** (`Gurbani/SikhiLibrary/`): the Sikhi app's Gurbani database, 179,414 lines, with the complete Sri Sarbloh Granth Sahib, the Faridkot Teeka in English line by line, phonetic search, and Jatha Randhawa's *Gurbani Arth Bhandar*. |
| **3.3** | 2026-11-11 | 28,159 | **SikhiDB** (`Gurbani/GursevakDB/`): a BaniDB-format SQLite of 190,238 lines on GursevakDB's text, with the *Gurbani Arth Bhandar* commentary, the Damdami Taksal *Sundar Gutka* banis and a BaniDB-compatible API server; Faridkot Teeka English mapped line by line. Gated access with an Access & AI Policy. |
| **3.2** | 2026-10-29 | 28,131 | `sikhi-io-library/` (4,561 books from the sikhi.io library), `sikhi-io-d1/` (sikhi.io's public content tables) and a newer Mahan Kosh snapshot (`mahan-kosh-multilingual/`). |
| **3.1** | 2026-09-16 | 23,366 | 2,475 works added from the sikhi.io library; corpus-wide word count and rights audit; every work filed under its author or subject. |
| **3.0** | 2026-09-03 | 9,977 | The complete **Mahan Kosh** as structured JSON: 64,218 entries in 28 language and script editions, released in honour of Guru Tegh Bahadur Ji's 350th year of martyrdom. |
| **2.1** | 2026-08-28 | 9,899 | Dasam Granth and Sarbloh Granth in 12 languages, the Faridkot Wala Teeka in 7, full text of *Sri Gur Pratap Suraj Granth* (11,180 pages), colonial-era histories, and reference corpora (Punjabi dictionary, katha transcripts, sakhis, Guru biographies). |
| **2.0** | 2026-05-30 | 5,629 | Named-author archives: the library reorganized around the collected works of individual Sikh scholars, historians and saints. |
| **2.0** | 2026-03-30 | 626 | First public release: Gurbani, steeks, granths, literature and research. |

The dataset was published under CC BY 4.0 from 2026-03-30 to 2026-04-12 and has been under its current terms since; see [License, Copyright & Attribution](#-license-copyright--attribution).

---

## ❓ FAQ

**Is SikhLibrary free?** Yes. Request access on this page; every request is read and approved by hand.

**Can I use it to train or evaluate an AI model, or build a chatbot on it?** Not without written permission from the maintainers and from the organizations whose data you would use. Ask in the [Discussions](https://huggingface.co/datasets/jsdosanj/SikhLibrary/discussions).

**Can I use SikhiDB in my Gurbani app?** Free, non-commercial apps can, under the terms in [Gurbani Databases for Apps](#-gurbani-databases-for-apps), including BaniDB's terms and each source's own permission for its text.

**Whose license applies to a given text?** The license of the organization or author it came from, as listed in [`LICENSE.md`](LICENSE.md), plus this dataset's terms.

**I own a work in this dataset. How do I have it removed?** Write to `akaal@sikhi.io`; see [Notice & Takedown](#-rights-holders-notice--takedown).

**How do I cite it?** See [How to Cite](#-how-to-cite), and also credit the original source of each work you use.

---

## 🤝 Contributing

SikhLibrary grows with the sikhi.io and sikharchive.net libraries. Panthic organizations, scholars and developers are welcome to contribute scans, translations, historical teekas and linguistic data, and to report errors in any text. Open a [Discussion](https://huggingface.co/datasets/jsdosanj/SikhLibrary/discussions) to propose a contribution or a correction.

---

## 🙏 Acknowledgements

This project is a culmination of decades of work by many organizations and individuals dedicated to digital preservation. We offer our deepest gratitude to:

- **Sache Paatshaah** — for providing the strength, resources, and vision to perform this seva.
- **Bhai Jasvant Singh ਪੰਛੀ (Panchhi)** — for the original dataset, and for the translations of his personal library of over 1,200 books, which this corpus grew from.
- **Sukhjeet Singh Sodhi, LLB (Hons), of Sikhi.io** — for the vast archive of digitized texts and translations that forms the bulk of this corpus, and for the proprietary tools and methodology behind the OCR/extraction pipeline.
- **Gursevak (Dear Father Brave Guru God's Slave Society, gursevak.com), the Khalis Foundation (BaniDB) and Shabad OS** — for the structured Gurbani data, used with Gursevak's and the Khalis Foundation's permission, and indexing that underlies much of the modern Sikh app ecosystem. GursevakDB's Guru Granth Sahib and Dasam Granth text, pagination and vishraams are the foundation of SikhiDB; with GursevakDB we thank Baba Darshan Singh Ji Mallehwal, Bhai Manraj Singh Ji (Akal Design), Siri Guru Granth Sahib Academy Malaysia, Bhai Binod Singh Ji, Bhai Sant Singh Khalsa Ji and their sevadaars (see `Gurbani/GursevakDB/CREDITS.txt`).
- **Jatha Randhawa (Sant Hari Singh Ji Randhawe Wale)** — for the *Gurbani Arth Bhandar* line-by-line commentary, used with permission.
- **Damdami Taksal** — for the *Sundar Gutka* texts and vishraams, used with permission.
- **Gian Singh (Chet)** — for the full text of Sri Sarbloh Granth Sahib, used with permission, and for his help with the Sikhi app and with cleaning up the English translation of the Faridkot Teeka.
- **The translators and teekakars** whose work appears in the Gurbani databases — the Faridkot Teeka's authors, Prof. Sahib Singh, Dr. Sant Singh Khalsa, Bhai Manmohan Singh, Bhai Vir Singh, Dr. Ratan Singh Jaggi, Dr. Surinder Singh Kohli, Dr. Daljit Singh Jawa and others named in each record.
- **Bhai Kahan Singh Nabha & Punjabi University, Patiala (Publication Bureau)** — for the Mahan Kosh, its English edition, and hundreds of other critical editions found throughout this corpus, used with the University's permission.
- **GurmatVeechar.com** — for hosting and freely sharing the 509 books and teekas in this corpus that carry its name, among them the *Amir Bhandar* teeka.
- **Sri Satguru Jagjit Singh Ji E-Library ("Namdhari E-Library")** — for digitizing and freely sharing dozens of rare Sikh manuscripts.
- **Panjab Digital Library, the Internet Archive, and Google Books** — for independent digitization efforts whose scanned imprints appear throughout this corpus.
- **The SGPC, the Language Department of Punjab, Bhai Vir Singh Sahit Sadan, Damdami Taksal, the Bhai Sahib Randhir Singh Trust, and the Guru Nanak Foundation, Bhatinda** — as original publishers or copyright holders of works mirrored here.
- **The 86 named scholars, saints, and historians** in the [directory index](#full-index-of-the-115-top-level-collections) above, and their estates and institutions, whose life's work forms the bulk of this library.
- **Panthic organizations & digitizers everywhere** — past and present — who have labored to scan, type, and verify these historical records.

---

## 🔗 Related Resources

- **[redroyals/mahan-kosh-multilingual](https://github.com/redroyals/mahan-kosh-multilingual)** (GitHub, by [Sikhi.io](https://sikhi.io)) — the canonical, actively-maintained home of the multilingual Mahan Kosh mirrored into this dataset at `Granths/Mahan_Kosh_Multilingual/`. Carries a live search viewer (`sikhi.io/dictionary`) and is where corrections, recovered Gurmukhi bodies, and real human translations should be contributed. The older English/Hindi-only Mahan Kosh text dump remains here under `Granths/Mahan_Kosh_Dictionary/`.
- **[sikhi.io](https://sikhi.io)** — the Sikhi app and online library, where most of this corpus can be read, searched and listened to.
- **[sikharchive.net](https://sikharchive.net)** — the Sikh Archive library and media project.

---

## 📝 How to Cite

If you use this dataset in academic work, please cite it as:

```bibtex
@misc{sikhlibrary2026,
  title        = {SikhLibrary: A Universal Comprehensive Research Corpus},
  author       = {Jasvant Singh Panchhi and Sukhjeet Singh Sodhi, LLB (Hons)},
  year         = {2026},
  publisher    = {Hugging Face},
  howpublished = {\url{https://huggingface.co/datasets/jsdosanj/SikhLibrary}},
  note         = {Version 3.4.1}
}
```

And per the [Attribution requirement](#5-your-obligations-and-the-attribution-requirement) above, credit the specific original source(s) for any individual work you use.

---

## 📬 Maintainers & Contact

- **Bhai Jasvant Singh Panchhi (ਪੰਛੀ)** — Project Maintainer
- **Sukhjeet Singh Sodhi, LLB (Hons)** — Sikhi.io, data & methodology

For corrections and contributions, please use the [Discussions](https://huggingface.co/datasets/jsdosanj/SikhLibrary/discussions) tab on this repository. Rights-holders may write privately to `akaal@sikhi.io` — see [Notice & Takedown](#-rights-holders-notice--takedown).
