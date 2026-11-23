# Mahan Kosh (multilingual)

Bhai Kahan Singh Nabha's *Gurushabad Ratnakar Mahan Kosh* (1930) — the great Sikh encyclopedia-dictionary — as plain JSON.

**64,218 entries. 28 languages. One id shared across every language.**

Released by [Sikhi.io](https://sikhi.io) in honour of Guru Tegh Bahadur Ji's 350th sacrifice for the freedom of conscience.

Read it live: **https://sikhi.io/dictionary**

## Coverage

| Language | Coverage |
|---|---|
| Gurmukhi headword | 64,218 / 64,218 |
| Gurmukhi body (original text) | 60,196 / 64,218 (93.7%) |
| English | ~100% |
| Hindi | 100% |
| 25 other languages | ~97-100% each |

The 25: Spanish, French, German, Portuguese, Italian, Chinese, Arabic, Urdu, Russian, Bengali, Gujarati, Tamil, Telugu, Persian, Japanese, Shahmukhi, Dutch, Polish, Swedish, Romanian, Czech, Hungarian, Danish, Korean, Malay.

English and Hindi are the careful spine. Everything past that is machine translation — useful for access, not a scholarly citation. Don't quote a machine translation as Bhai Kahan Singh's own words.

The 6.3% of entries with no Gurmukhi body still have a headword and an English definition, just no recovered original prose. They're listed honestly, not guessed at.

## Files

```
data/
  manifest.json           counts per language
  entries/core.json       id, headword, volume, page
  entries/en.json         English definitions
  entries/hi.json         Hindi definitions
  entries/gurmukhi.json   original Gurmukhi body (partial, see above)
  entries/{lang}.json     one file per other language
```

`core.json` also carries 3,932 excluded rows (title pages, tables, front matter) — skip anything marked `"excluded": true`.

## One entry, three languages

```js
// core.json
{ "id": "1-37-0", "hw": "ਉ", "vol": 1, "page": 37 }

// en.json["1-37-0"]
{ "definitions": ["Skt 3 n Brahma. 2 Vishnu. 3 Shiv. …"] }

// gurmukhi.json["1-37-0"]
{ "text": "ਸੰ. उ. ਸੰਗ੍ਯਾ- ਬ੍ਰਹਮਾ। …", "align": "original" }
```

Same id everywhere. That's the whole design.

## Use it

```js
import core from './data/entries/core.json' assert { type: 'json' }
import en from './data/entries/en.json' assert { type: 'json' }
import pa from './data/entries/gurmukhi.json' assert { type: 'json' }

for (const e of core.entries) {
  if (e.excluded) continue
  console.log(e.id, e.hw, en[e.id]?.definitions, pa[e.id]?.text)
}
```

Or open any file in Python, Excel, a phone app, a game, a chatbot.

A small search UI is included: `cd site && npm install && npm run dev`.

## Build something

- A better reader than sikhi.io/dictionary
- Offline packs for one language
- Search across Gurmukhi and Latin spellings
- Flashcards, classroom sheets
- A real human translation, replacing a machine one
- A way to recover more of the missing 6.3% Gurmukhi bodies — without guessing

Open a pull request. Keep machine text labelled as machine text.

## Contributors

[Sikhi.io](https://sikhi.io) and [gurpreet-fe](https://github.com/gurpreet-fe).

## Licence

Each part of this folder is under its owner's licence, and **you must follow the licence of each part you use** (full text in `LICENSE`):

| Part | Owner | Licence |
|---|---|---|
| 1930 Gurmukhi text (`gurmukhi.json`, headwords) | Bhai Kahan Singh Nabha | Public domain |
| English text (`en.json`) | **Punjabi University, Patiala** (English edition, 2006–2011) | © Punjabi University, Patiala. Included in SikhLibrary **with the University's written permission**; not CC BY 4.0. Any use outside SikhLibrary needs the University's own permission. |
| Machine translations (`{lang}.json`) | Made from the English text | As the English text, until confirmed otherwise |
| Hindi text, JSON packaging, viewer (`site/`) | Sikhi.io | CC BY 4.0 |

Credit Bhai Kahan Singh Nabha and Punjabi University, Patiala. Credit [Sikhi.io](https://sikhi.io) if you use this packaging.

This folder is part of [SikhLibrary](https://huggingface.co/datasets/jsdosanj/SikhLibrary), a gathering of the Panth's khajana from many organizations; see the dataset's `LICENSE.md`. Any organization can ask for the removal of texts it owns by writing to `akaal@sikhi.io`.
