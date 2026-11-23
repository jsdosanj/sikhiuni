# SikhLibrary — License and Third-Party Notices

`jsdosanj/SikhLibrary` on Hugging Face. Version 3.4.1, 2026-11-23.

SikhLibrary is a **compilation**. This file says which parts the maintainers license, under
which license, and which parts belong to someone else. It governs if it differs from the
dataset card.

**Maintainers ("we"):** Bhai Jasvant Singh Panchhi (ਪੰਛੀ) and Sukhjeet Singh Sodhi, LLB (Hons)
(Sikhi.io). **Rights notices:** `akaal@sikhi.io`, subject "SikhLibrary rights notice".

---

## 1. Our contributions: CC BY-NC-ND 4.0

Our contributions are licensed under the **Creative Commons Attribution-NonCommercial-NoDerivatives
4.0 International License** (<https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode>).
"Our contributions" means only what we own or are entitled to license:

1. the selection, arrangement and structure of the compilation (folders, file naming, per-book
   JSON layout, manifests, indexes);
2. OCR transcriptions and extracted text we produced, to the extent they carry copyright of their own;
3. translations, metadata, documentation and code written by us or by Sikhi.io for this dataset,
   including `Gurbani/GursevakDB/merge_gursevakdb_v2.py`, `banidb_api.py` and `gurmukhi_ascii.py`;
4. the original works of Bhai Jasvant Singh Panchhi included here.

## 2. Everything else: rights reserved to its owners

Every other work in SikhLibrary (each book, article, report, thesis, translation, teeka,
commentary, database record, scan and image that we did not create) **remains the property of
its owner. We do not license it to you, and §1 does not apply to it.** Its inclusion is not a claim
of ownership. It is offered for non-commercial study and research only, under the permissions
listed in §3 where we hold them, and otherwise as an archival research copy that we remove on
request (§5). For any use beyond private study and research, get permission from its owner.

The licensed elements of §1 and the third-party works of §2 are often in the same file (for example
our OCR of a third-party book). In that case each part is under its own terms: the CC license covers
only our part, and the third-party work stays under §2.

Gurbani (Sri Guru Granth Sahib Ji, Sri Dasam Granth Sahib, Sri Sarbloh Granth Sahib, Vaaran and
Kabit Savaiye of Bhai Gurdas Ji, Bhai Nand Lal Ji) is not owned by us or by any database. Particular
digital editions of it, and the translations and commentaries that accompany it, are credited and
handled as in §3.

## 3. Sources, permissions and notices

### 3.1 Gurbani databases

**BaniDB** — © Khalis Foundation, a California non-profit. <https://www.banidb.com>.
Used: the BaniDB v2 database format and API shape; English translation and transliteration
carried in `Gurbani/GursevakDB/gursevakdb-banidb.sqlite` and in `sikhi-io-d1/`. BaniDB data is
subject to the BaniDB Terms of Service (<https://www.banidb.com/tos/>) and, subordinate to them, the
Non-Profit Open Software License 3.0 (<https://www.banidb.com/nposl/>). We claim no copyright in
BaniDB data. Credit: *"Gurbani data courtesy of BaniDB, Khalis Foundation."*
`banidb_api.py` is our independent re-implementation of BaniDB's public API for compatibility,
contains no BaniDB code, and is not provided or endorsed by the Khalis Foundation.

**GursevakDB** — Gursevak, the registered charity "Dear Father Brave Guru God's Slave Society".
<https://www.gursevak.com>. Used: Guru Granth Sahib and Dasam Granth text, pagination, shabad
grouping, vishraams and pronunciation tips in SikhiDB and the Sikhi Gurbani Library; the unmodified
verse CSVs in `Gurbani/GursevakDB/source-csv/`. No public license has been published for GursevakDB;
it is used here, with credit, for non-commercial study. `Gurbani/GursevakDB/CREDITS.txt` is Gursevak's
own acknowledgement and must accompany any copy. It credits Baba Darshan Singh Ji Mallehwal (SGGS
data and colour vishraams), Bhai Manraj Singh Ji of Akal Design (the original database and
gursevak.com), Siri Guru Granth Sahib Academy Malaysia (Dasam Granth data), Bhai Binod Singh Ji
(English and Devanagari transliteration), Bhai Sant Singh Khalsa Ji (English translation), Bibi
Inderpreet Kaur Ji of Darer Designs (design), and their sevadaars.

**Shabad OS** — © Shabad OS Organization and Contributors. <https://shabados.com>,
<https://github.com/shabados/database>. Used: base Gurbani database (v5.0.0-next.0) of the Sikhi
Gurbani Library; SGGS per-ang content in `sikhi-io-d1/sikhi-gurbani/`. Code under the MIT License;
texts marked by Shabad OS as public domain. We follow its condition that Gurbani is not added to,
deleted from or altered in a way that distorts it. MIT notice, as required:

> Copyright (c) Shabad OS Organization and Contributors. Permission is hereby granted, free of
> charge, to any person obtaining a copy of this software and associated documentation files (the
> "Software"), to deal in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software,
> and to permit persons to whom the Software is furnished to do so, subject to the following
> conditions: The above copyright notice and this permission notice shall be included in all copies
> or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
> KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
> FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
> LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
> OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
> THE SOFTWARE.

**Sikhi Gurbani Library** (`Gurbani/SikhiLibrary/`) — built by Sikhi.io from GursevakDB and Shabad
OS (above). Its translations and teekas are credited in each record and in §3.3.

### 3.2 Used with the rights-holder's permission

These are **not** covered by §1. Do not reuse them outside this dataset without the rights-holder's
own permission.

- **Jatha Randhawa · Gurbani Arth Bhandar** (Sant Hari Singh Ji Randhawe Wale) — line-by-line SGGS
  commentary: `Gurbani/SikhiLibrary/Commentary.sqlite`; `commentary_*` tables and `randhawa`
  translations in SikhiDB.
- **Damdami Taksal · Sundar Gutka** — 87 banis with vishraams: `banis`, `bani_blocks`, `bani_verses`
  in SikhiDB.
- **Gian Singh (Chet)** — full text of Sri Sarbloh Granth Sahib in the Sikhi Gurbani Library.

### 3.3 Translations and teekas in the Gurbani databases

Faridkot Teeka (Punjabi and English); Prof. Sahib Singh, *Sri Guru Granth Sahib Darpan*;
Dr. Sant Singh Khalsa (English); Bhai Manmohan Singh (English, SGPC); Bhai Vir Singh;
Dr. Ratan Singh Jaggi; Dr. Surinder Singh Kohli; Dr. Daljit Singh Jawa; *Garab Ganjani*; and the other
translators named in each record. Each remains under its owner's rights.

### 3.4 Mahan Kosh

Bhai Kahan Singh Nabha, *Gurushabad Ratnakar Mahan Kosh* (1930): public domain. Sikhi.io's packaging,
Hindi text and machine translations in `Granths/Mahan_Kosh_Multilingual/` and
`mahan-kosh-multilingual/`: CC BY 4.0, as stated in each folder's `LICENSE`. **The English text
follows the Punjabi University, Patiala edition (2006–2011), © Punjabi University, Patiala; it is
not licensed under CC BY 4.0 or under §1.**

### 3.5 Hosts and digitizers

- **GurmatVeechar.com** — 509 works whose file names carry `(GurmatVeechar.com)`. The tag is kept as its credit.
- **Sikhi.io** — the production library and database (`sikhi-io-library/`, `sikhi-io-d1/`).
- **Panjab Digital Library**; **Sri Satguru Jagjit Singh Ji E-Library ("Namdhari E-Library")**;
  **Internet Archive**; **Google Books** — scans OCR'd into this corpus. Their imprints are kept where
  they appear. Google Books scans are for non-commercial use, keep their attribution, and must not be
  queried by automated means.

### 3.6 Original publishers and copyright holders

Works bearing the notice of Punjabi University, Patiala (Publication Bureau); the SGPC; the Language
Department, Punjab; Bhai Vir Singh Sahit Sadan; Damdami Taksal; the Bhai Sahib Randhir Singh Trust;
the Guru Nanak Foundation, Bhatinda; Oxford University Press; Human Rights Watch; ProQuest LLC / UMI;
and every other publisher, author or estate named in a work's own front matter, remain under that
owner's rights. The copyright page printed in each work is its notice and must be kept with it.

## 4. Web-sourced tables in `sikhi-io-d1/`

These tables reproduce material collected from other websites and keep their owners' rights; each
site's own terms apply:

| Table | Source | Status |
|---|---|---|
| `sikhi-scripture/sggs_sggsonline` | SGGS Online (Education Without Boundaries Inc.) | Its site prohibits bulk copying, database extraction and AI training. Under review for removal. |
| `sikhi-io-prod/sikhiwiki_articles` | SikhiWiki | License to be confirmed. |
| `sikhi-io-prod/gurbani_org_posts` | Gurbani.org | License to be confirmed. |
| `sikhi-io-prod/web_archive_entries` | Various websites | Each site's own terms. |
| `sikhi-io-prod/gallery_images` | Various photographers and archives | Each image's own rights. |

Derived tables (`rag_chunks`, `search_chunks`, `library_quotations`, `library_pages`) are made from the
works above and carry no broader rights than those works.

## 5. Notice and takedown

Rights-holders may ask for removal, correction of a credit, or a license discussion at
`akaal@sikhi.io` (subject "SikhLibrary rights notice"), or in the dataset's Discussions. Notices
under 17 U.S.C. § 512(c)(3) are accepted at the same address. We acknowledge within 3 business days,
restrict access to the work while we check, and, if the claim is substantiated, delete it from the
repository **including its history**. Hugging Face's own process is at
<https://huggingface.co/content-guidelines>.

## 6. Access terms

Access is subject to the agreement accepted in the gated access form. It binds the person who
accepts it, in addition to this file, and does not limit fair use, fair dealing or other exceptions in
copyright law.

## 7. No warranty; no endorsement

The dataset is provided **as is**, without warranty of any kind, including as to the copyright
status of any work. To the extent the law allows, we are not liable for any use of it. The
organizations and people named here are credited because their work is used; none has endorsed
SikhLibrary unless stated, and their names and marks belong to them.
