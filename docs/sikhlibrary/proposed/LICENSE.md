# SikhLibrary — Licenses, Permissions and Third-Party Notices

`jsdosanj/SikhLibrary` on Hugging Face. Version 3.4.1, 2026-11-23.

SikhLibrary is a gathering of the Panth's **khajana (ਖ਼ਜ਼ਾਨਾ)**: texts, databases, translations and
commentaries made and kept by many Sikh organizations, scholars, publishers and digitizers. It is a
**compilation**, not a new owner of that khajana. This file states which parts the maintainers license
and under which license, and which parts belong to each organization and under that organization's
license. If it differs from the dataset card, this file governs.

**Maintainers ("we"):** Bhai Jasvant Singh Panchhi (ਪੰਛੀ) and Sukhjeet Singh Sodhi, LLB (Hons)
(Sikhi.io). **Removal requests and rights notices:** `akaal@sikhi.io`.

---

## 1. Your obligations

1. **Follow the license of every organization whose data you use.** Each organization's data in this
   dataset stays under that organization's own license or terms (§4). Using it through SikhLibrary
   does not exempt you from them. You must follow them **as well as** this dataset's license (§2) and
   access terms (§7).
2. **Permissions given to us are not given to you.** Several organizations have given the maintainers
   written permission to include their data here (§4). That permission covers this dataset; it does not
   pass to you. To use their data outside this dataset (for example in your own app or publication),
   ask that organization.
3. **Keep the credits.** Keep every copyright notice, credit, `LICENSE` and `CREDITS.txt` file with any
   file you use, and credit the organization and the dataset as §6 describes.

## 2. Our contributions: CC BY-NC-ND 4.0

Our contributions are licensed under the **Creative Commons Attribution-NonCommercial-NoDerivatives
4.0 International License** (<https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode>).
"Our contributions" means only what we own or are entitled to license:

1. the selection, arrangement and structure of the compilation (folders, file naming, per-book
   JSON layout, manifests, indexes);
2. OCR transcriptions and extracted text we produced, to the extent they carry copyright of their own;
3. translations, metadata, documentation and code written by us or by Sikhi.io for this dataset,
   including `Gurbani/GursevakDB/merge_gursevakdb_v2.py`, `banidb_api.py` and `gurmukhi_ascii.py`;
4. the original works of Bhai Jasvant Singh Panchhi included here.

## 3. Everything else: each owner's rights and license

Every other work in SikhLibrary (each book, article, report, thesis, translation, teeka,
commentary, database record, scan and image that we did not create) **remains the property of
its owner and stays under its owner's license or terms. We do not license it to you, and §2 does not
apply to it.** Its inclusion is not a claim of ownership. Where we hold written permission it is
listed in §4; otherwise the work is offered as an archival research copy for non-commercial study and
research, and we remove it at its owner's request (§8). For any use beyond private study and
research, get permission from its owner.

Our licensed elements (§2) and an owner's work are often in the same file (for example our OCR of a
book). In that case each part is under its own terms: the CC license covers only our part.

Gurbani (Sri Guru Granth Sahib Ji, Sri Dasam Granth Sahib, Sri Sarbloh Granth Sahib, Vaaran and
Kabit Savaiye of Bhai Gurdas Ji, Bhai Nand Lal Ji) belongs to the Panth, not to us or to any
database. Particular digital editions of it, and the translations and commentaries with it, carry
their makers' rights, and are handled as in §4.

## 4. Organizations, their licenses, and our permissions

| Organization | What is used, and where | Their license or terms | Our permission |
|---|---|---|---|
| **BaniDB** — Khalis Foundation, a California non-profit (<https://www.banidb.com>) | BaniDB v2 database format and API shape; English translation and transliteration in `Gurbani/GursevakDB/gursevakdb-banidb.sqlite` and `sikhi-io-d1/` | BaniDB Terms of Service (<https://www.banidb.com/tos/>), and, subordinate to them, the Non-Profit Open Software License 3.0 (<https://www.banidb.com/nposl/>). They require written acknowledgement of BaniDB and the BaniDB logo in any project that uses its data. | **Written permission from the Khalis Foundation.** |
| **GursevakDB** — Gursevak, the registered charity "Dear Father Brave Guru God's Slave Society" (<https://www.gursevak.com>) | Guru Granth Sahib and Dasam Granth text, pagination, shabad grouping, vishraams and pronunciation tips in SikhiDB and the Sikhi Gurbani Library; verse CSVs in `Gurbani/GursevakDB/source-csv/` | No open license published: all rights reserved to Gursevak. `Gurbani/GursevakDB/CREDITS.txt` (Gursevak's acknowledgements) must accompany any copy. | **Written permission from Gursevak.** |
| **Shabad OS** — Shabad OS Organization and Contributors (<https://shabados.com>) | Base Gurbani database (v5.0.0-next.0) of the Sikhi Gurbani Library; `sikhi-io-d1/sikhi-gurbani/sggs_shabados`; `Steeks/ShabadOS Database/` | Code: MIT License (notice below). Texts: marked public domain by Shabad OS, on condition that Gurbani is not added to, deleted from or altered in a way that distorts it. | Not needed (open license). |
| **Jatha Randhawa · Gurbani Arth Bhandar** — Sant Hari Singh Ji Randhawe Wale | Line-by-line SGGS commentary: `Gurbani/SikhiLibrary/Commentary.sqlite`; `commentary_*` tables and `randhawa` translations in SikhiDB | All rights reserved to Jatha Randhawa. | **Written permission from Jatha Randhawa.** |
| **Damdami Taksal · Sundar Gutka** | 87 banis with vishraams from the Damdami Taksal *Sundar Gutka* app (`banis`, `bani_blocks`, `bani_verses` in SikhiDB); works bearing Damdami Taksal's copyright notice | All rights reserved to Damdami Taksal. | **Written permission from Damdami Taksal.** |
| **Gian Singh (Chet)** | Full text of Sri Sarbloh Granth Sahib in the Sikhi Gurbani Library; help building the Sikhi app and cleaning up the English Faridkot Teeka (`a.ft_en` in the Sikhi Gurbani Library; `mahan-kosh-multilingual/data/reading-aids/faridkot/`) | All rights in his Sarbloh Granth text reserved to him. | **Written permission from Gian Singh (Chet).** |
| **Punjabi University, Patiala** (Publication Bureau) | The English edition of the Mahan Kosh (2006–2011) in `Granths/Mahan_Kosh_Multilingual/`, `mahan-kosh-multilingual/` and `sikhi-io-d1/sikhi-io-prod/mahan_kosh_defs`; the University's publications in this corpus | © Punjabi University, Patiala. All rights reserved. | **Written permission from Punjabi University, Patiala.** |
| **Sikhi.io** (<https://sikhi.io>) | Production library and database (`sikhi-io-library/`, `sikhi-io-d1/`); the Sikhi Gurbani Library; the Mahan Kosh packaging | Its own contributions: §2 (CC BY-NC-ND 4.0); the Mahan Kosh packaging, Hindi text and viewer: CC BY 4.0 (see those folders' `LICENSE`). | Contributed by the maintainers. |
| **GurmatVeechar.com** (<https://www.gurmatveechar.com>) | 509 works whose file names carry `(GurmatVeechar.com)` | No license published. The underlying works keep their authors' and publishers' rights. The file-name tag is kept as its credit. | Archival research copy (§3). |
| **Translators and teekakars** in the Gurbani databases: Faridkot Teeka; Prof. Sahib Singh (*Darpan*); Dr. Sant Singh Khalsa; Bhai Manmohan Singh (SGPC); Bhai Vir Singh; Dr. Ratan Singh Jaggi; Dr. Surinder Singh Kohli; Dr. Daljit Singh Jawa; *Garab Ganjani*; and others named in each record | Translations and teekas in SikhiDB, the Sikhi Gurbani Library, `Steeks/` and `sikhi-io-d1/` | Each translator's or publisher's own rights. Prof. Sahib Singh (d. 1977) is in copyright in India until the end of 2037. | Through the databases above where they carry them; otherwise archival research copy (§3). |
| **Digitizers**: Panjab Digital Library; Sri Satguru Jagjit Singh Ji E-Library ("Namdhari E-Library"); Internet Archive; Google Books | Scans OCR'd into this corpus | Each digitizer's terms; their imprints are kept where they appear. Google Books scans: non-commercial use, keep the attribution, no automated querying. | Archival research copy (§3). |
| **Publishers and copyright holders** named in a work's own front matter: SGPC; Language Department, Punjab; Bhai Vir Singh Sahit Sadan; Bhai Sahib Randhir Singh Trust; Guru Nanak Foundation, Bhatinda; Oxford University Press; Human Rights Watch; ProQuest LLC / UMI; authors and estates | Their works | Their own rights; the copyright page printed in each work is its notice. | Archival research copy (§3), removed on request. |
| **Websites** in `sikhi-io-d1/`: SikhiWiki (`sikhiwiki_articles`); Gurbani.org (`gurbani_org_posts`); web archives (`web_archive_entries`); image sources (`gallery_images`) | Those tables | Each site's or image owner's own license. | Archival research copy (§3), removed on request. |

Derived tables in `sikhi-io-d1/` (`rag_chunks`, `search_chunks`, `library_quotations`, `library_pages`)
are made from the works above and carry no broader rights than those works.

**Removed:** `sikhi-io-d1/sikhi-scripture/sggs_sggsonline` (SGGS Online, Education Without Boundaries
Inc.) was removed on 2026-11-23, because its source prohibits database extraction.

### MIT notice for Shabad OS

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

## 5. BaniDB acknowledgement

<img src="https://www.banidb.com/wp-content/uploads/2019/05/full-banidb-logo.png" alt="BaniDB" width="180">

Gurbani data courtesy of **BaniDB**, Khalis Foundation (<https://www.banidb.com>), used with permission. A copy of the BaniDB logo is kept at `assets/banidb-logo.png` so that it travels with the data.
The BaniDB name and logo belong to the Khalis Foundation. Their use here acknowledges BaniDB as its
terms require and does not mean that the Khalis Foundation endorses SikhLibrary. `banidb_api.py` is our
independent re-implementation of BaniDB's public API for compatibility; it contains no BaniDB code.

## 6. How to credit

Credit **SikhLibrary** (`jsdosanj/SikhLibrary`, with a link and the license, noting any changes) **and
every organization whose data you use**, as named in §4 and in each folder's `README.md`, `LICENSE` or
`CREDITS.txt`. Suggested line:

> Contains material from SikhLibrary (huggingface.co/datasets/jsdosanj/SikhLibrary), compiled by Bhai
> Jasvant Singh Panchhi and Sukhjeet Singh Sodhi, LLB (Hons), with Gurbani data from GursevakDB
> (Gursevak), Shabad OS and BaniDB (Khalis Foundation). Compilation licensed CC BY-NC-ND 4.0; each
> organization's data under its own license; individual works © their respective owners.

## 7. Access terms

Access is subject to the agreement accepted in the gated access form. It binds the person who
accepts it, in addition to this file, and does not limit fair use, fair dealing or other exceptions in
copyright law.

## 8. Removal on request

**Any organization, author or other rights-holder can ask for the removal of texts it owns**, a
corrected credit, or a license discussion, by writing to **`akaal@sikhi.io`** (subject "SikhLibrary
rights notice"), or in the dataset's Discussions. Notices under 17 U.S.C. § 512(c)(3) are accepted at the
same address. We acknowledge within 3 business days, restrict access to the work while we check,
and, if the claim is substantiated, delete it from the repository **including its stored history**.
Hugging Face's own process is at <https://huggingface.co/content-guidelines>.

## 9. No warranty; no endorsement

The dataset is provided **as is**, without warranty of any kind, including as to the copyright
status of any work. To the extent the law allows, we are not liable for any use of it. The
organizations and people named here are credited because their work is used; none has endorsed
SikhLibrary unless stated, and their names and marks belong to them.
