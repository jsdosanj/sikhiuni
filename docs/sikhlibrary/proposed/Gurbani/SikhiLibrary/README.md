# Sikhi Gurbani Library 1.2.0

The Gurbani database inside the Sikhi app (sikhi.io), version 1.2.0, as one SQLite file you can open and query: every line of the Granths below, with its
translations, teekas, transliteration, pause marks (visraam), and the search indexes the app uses (first letters, whole words, phonetic, English).

| Granth | `src` | Lines |
|---|---|---|
| Sri Dasam Granth Sahib | `D` | 68,949 |
| Sri Guru Granth Sahib Ji | `G` | 60,610 |
| Sri Sarbloh Granth Sahib | `L` | 35,994 |
| Vaaran Bhai Gurdas Ji | `B` | 7,950 |
| Kabit Savaiye Bhai Gurdas Ji | `K` | 2,762 |
| Bhai Nand Lal Ji | `N` | 2,559 |
| Bhai Gurdas Singh Ji | `S` | 352 |
| Rehatname | `R` | 238 |
| **Total** | | **179,414** |

## What is new in 1.2.0
- **Sri Sarbloh Granth Sahib in full** (35,994 lines, pages 1 to 1,216), searchable like the other Granths.
- **The Faridkot Teeka's English, line by line**, aligned to every line of Sri Guru Granth Sahib Ji (record field `a.ft_en`).
- **Phonetic search** (type Gurbani as it sounds): the `tg_ph` index, built from `PhoneticKey` (the same rule in Swift and Python, pinned by a shared test fixture).
- **First letters of the printed word split** (`verses.fls`) beside GursevakDB's own (`verses.fl`), so a joined word such as ਸਤਿਨਾਮੁ is found by its parts.
- **Jatha Randhawa's teeka (Gurbani Arth Bhandar)**, line by line, in `Commentary.sqlite` (59,008 lines mapped): the meaning under the last line each entry explains,
  and the full entry (context, word meanings, lines from Gurbani, sakhis).

## Revised 2026-11-20 (the library in the 1.2.0 app as resubmitted)
- **Every line checked for display**: each line was converted into the ASCII encoding of the Gurbani fonts (Gurbani Akhar, Anmol Lipi, Amr Lipi, Prabhki) and checked to have
  nothing those fonts cannot draw, and its Unicode for stray marks. Three lines were repaired: Dasam Granth line 4149403 (Ang 1044) had a broken tail
  ("ਫੂਲਿ+ਭ੧੧੩੦੭") and is now "ਪੱਤ੍ਰੀ ਬਾਚਿ ਫੂਲਿ ਜੜ ਗਏ ॥" as in Shabad OS; Sarbloh lines 710322 and 714678 had a vowel sign typed twice ("ਬਲਿਿਸ੍ਤ", "ਕੋੋਟਿ").
- **`verses.so`** (indexed `v_so`): each line's place in the order search results are listed (Guru Granth Sahib, Dasam, Vaaran, ... then Ang and line), so a
  search with many matches reads its first page in order instead of sorting every match.
- **Smaller**: in a line's record, the Faridkot English (`a.ft_en`) and the transliteration (`x.en`) are `"="` where they are the same as the line's own
  `verses.en2` and `verses.rm`; read those columns instead. Every line reads exactly as before (270 MB became 260 MB).

## Files
- `GurbaniIndex.sqlite`: the library. Main table `verses` (one row per line: `id`, `shabad`, `src`, `ang`, `line`, `g` Gurmukhi, `fl`/`fls` first letters, `en` English,
  `rm` transliteration, `writer`, `raag`, `en2` the English that stands in where a line has no standard English, `ord`, `so` the result order), the full records compressed in `rz` (LZMA JSON chunks; `"="` means "the same as the line's column", above),
  and the FTS5 indexes (`tg_*`). Tables: am, fe, fr, meta, rz, sblock, sl, slp, sredirect, sv, verses, vk, vm, vredirect, vuid, wc, wd, wv.
- `Commentary.sqlite`: Jatha Randhawa's Gurbani Arth Bhandar, chunked and LZMA-compressed JSON by verse id (`line` maps a verse to its chunk).
- `SHA256SUMS`.

## Sources, credits and licences

This library is a gathering of several organizations' work. **Each source stays under its own licence, and you must follow the licence of every source whose data you use.** The permissions below were given to the maintainers for SikhLibrary and the Sikhi app; they do not pass to you. To use a source's data outside SikhLibrary, ask that source.

| Source | What it provides | Licence / terms |
|---|---|---|
| **GursevakDB** — Gursevak ("Dear Father Brave Guru God's Slave Society", gursevak.com) | Guru Granth Sahib and Dasam Granth text, pause marks, pronunciation tips | All rights reserved to Gursevak; **used with Gursevak's written permission**. Gursevak's acknowledgements: `../GursevakDB/CREDITS.txt`. |
| **Shabad OS** — Shabad OS Organization and Contributors | Base database (Shabad OS database v5.0.0-next.0), with the additions of sikhidb-compact.sqlite (2026-10-20) | Code MIT; texts marked public domain by Shabad OS, on condition that Gurbani is not distorted |
| **Gian Singh (Chet)** | Full text of Sri Sarbloh Granth Sahib; help building the Sikhi app and cleaning up the English Faridkot Teeka | **Used with his written permission**; his Sarbloh text is not to be reused outside SikhLibrary without his permission |
| **Jatha Randhawa** (Sant Hari Singh Ji Randhawe Wale) | Gurbani Arth Bhandar, in `Commentary.sqlite` | All rights reserved; **used with Jatha Randhawa's written permission** |
| **Translators and teekakars** | Faridkot Teeka (Punjabi and English); Prof. Sahib Singh's Darpan; Dr. Sant Singh Khalsa's English; Bhai Vir Singh; Dr. Ratan Singh Jaggi; Dr. Surinder Singh Kohli; and the other teekas named in each record | Each translator's or publisher's own rights |
| **Sikhi.io** | Built the library (schema, indexes, phonetic keys, alignment). Prepared 2026-11-19. | Sikhi.io's own work: CC BY-NC-ND 4.0, as SikhLibrary's `LICENSE.md` §2 |

This folder is part of [SikhLibrary](https://huggingface.co/datasets/jsdosanj/SikhLibrary), a gathering of the Panth's khajana from many organizations; the full terms are in the dataset's `LICENSE.md`. Any organization can ask for the removal of texts it owns by writing to `akaal@sikhi.io`.
