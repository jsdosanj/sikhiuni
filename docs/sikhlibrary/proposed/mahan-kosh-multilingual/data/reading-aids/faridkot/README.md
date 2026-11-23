# Faridkot reading aids

This is a separate, source-linked Faridkot Teeka reading dataset hosted alongside Mahan Kosh. It does not replace `data/entries`, change Mahan Kosh definitions, or assert that a Faridkot source sense is a matched Mahan Kosh entry. Faridkot physical-page IDs must never be used as Mahan Kosh entry IDs.

`en/english-reading-edition.json` preserves 4,300 physical-page slots, with 4,292 model-reviewed readings and eight explicit source gaps. `en/source-alignments.json` contains 19,029 occurrence bindings with Punjabi evidence, source hashes, transliteration, English display labels and explanations. `en/source-provenance.json` pins the original GitHub commit. `en/manifest.json` records checksums. See `en/AUDIT.md` for the review method and limits.

This is a readability and explanation layer, not a complete revision of the underlying translation. The source repository holds the original text. Three reviews by the same model provide checks, not independent scholarly certification. The original scripture, names and uncertain senses remain protected. Existing site corrections may cause an exact occurrence match to be withheld.

## Other languages

Existing editions can remain available with their existing machine-translation quality labels. This English audit provides no new assurance about their accuracy. No non-English edition was rewritten or reviewed in this release.

For each additional language:

1. Pin its original text and retain its stable entry or page IDs.
2. Match its exact local-language phrase to the same Punjabi source evidence. Never reuse English character offsets or match a word globally across different senses.
3. Translate the short reading label and explanation naturally in that language, preserving Punjabi quotations, letters and names. Store bindings under the appropriate language code, with the target-text hash.
4. Review the phrase and meaning against the Punjabi passage; separately check grammar, duplicate bracketed glosses, omitted clauses, script integrity and mobile/keyboard interaction. Withhold uncertain alignments.
5. Retranslate only passages whose underlying meaning is wrong, then revalidate all affected occurrence offsets. Preserve the existing reading as fallback when no reviewed alignment exists.

For Mahan Kosh dictionary translations, changes must instead follow Mahan Kosh's own stable entry IDs and original dictionary evidence. This Faridkot audit must not be propagated into dictionary definitions without that separate evidence check.

The source keys and evidence are reusable across languages; the English phrases and offsets are not. The Mahan Kosh viewer is not changed by adding these data files.

## Line-mapped edition (`en/line-mapped/`, added 2026-11-01)

A second, separate English dataset: the Faridkot Teeka English mapped **line by line** onto Guru Granth Sahib (1,430 angs, 60,403 lines, BaniDB Punjabi verse IDs). It does not replace the page-based edition above.

- `Faridkot-audited-2026-10-31.json` — final export with mapping status per line and the seven-pass audit history (sha256 `70173d29…743e0`).
- `faridkot-english-line-mapped.json` — the pre-audit input the audit pinned by hash (sha256 `26828abd…76dabb`).
- `Faridkot-remaining-errors-2026-10-31.json` — 274 flagged rows (233 unresolved English, 43 possibly truncated Punjabi).
- `faridkot-mapping-coverage.json`, `Sikhi-handoff-2026-10-30.verification.json` — coverage and package-verification receipts.

No English was newly translated; the mapping selects existing English sentences. Mapping is incomplete (`completeEnglishMapping: false`): 41,601 mapped, 13,161 shared/partial, 5,408 with no Punjabi commentary, 199 English-not-found, 34 review-rejected. Machine-checked for passage correspondence, not a scholarly certification.

## Credits and licences

**You must follow the licence of each source below that you use.**

| Part | Owner / credit | Licence |
|---|---|---|
| Faridkot Teeka (Punjabi original) | Its 19th-century authors | Public domain by age |
| English reading edition, alignments and explanations | Sikhi.io; the English was cleaned up with the help of **Gian Singh (Chet)**, with his permission | Sikhi.io's contributions: as this project's `LICENSE` |
| Verse IDs in the line-mapped edition | **BaniDB, Khalis Foundation** | Used with the Khalis Foundation's written permission; BaniDB's [Terms of Service](https://www.banidb.com/tos/) apply |

This folder is part of [SikhLibrary](https://huggingface.co/datasets/jsdosanj/SikhLibrary), a gathering of the Panth's khajana from many organizations; see the dataset's `LICENSE.md`. Any organization can ask for the removal of texts it owns by writing to `akaal@sikhi.io`.
