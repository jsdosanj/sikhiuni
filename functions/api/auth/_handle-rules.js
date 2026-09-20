// Username ("handle") rules — a PORTED COPY of sikhi.io's
// lib/auth/handleRules.ts, which is the reference for all three sites.
//
// KEEP IN SYNC. The three repos deliberately do NOT share an npm package:
// three separate deploy pipelines make a package more drift surface than a
// pinned copy (the same reasoning that governs the "Powered by sikhi.io"
// footer mark, which each repo pins in its own test). If you change the
// regex or the blocklist, change it in:
//   sikhi.io/lib/auth/handleRules.ts        (reference)
//   sikhiuni/functions/api/auth/_handle-rules.js   (this file)
//   punjabiuni/lib/auth/handleRules.ts
//
// Rules: 1–20 chars, lowercase Latin letters + digits + `_` + `-`. Only
// profanity is filtered — no reserved list, no surname/sacred-term lockout.
//
// The exclusion of `@` is LOAD-BEARING, not cosmetic: login's
// username-or-email discrimination splits on `@`, so a handle able to
// contain one would make that split ambiguous.

export const HANDLE_RE = /^[a-z0-9_-]{1,20}$/;

export const PROFANITY_LATIN = [
  // English
  "fuck", "shit", "cunt", "bitch", "asshole", "dick", "pussy", "bastard",
  "motherfucker", "nigger", "faggot", "twat", "slut", "whore", "retard",
  "rape", "cocksucker",
  // Punjabi (transliterated, common spellings)
  "bhenchod", "behenchod", "bhenchhod", "madarchod", "madharchod",
  "chutiya", "chutia", "chutya", "gandu", "gaandu", "randi", "harami",
  "kameena", "kameene", "suar", "lund", "lunda", "gaand", "chudai",
  "chodu", "chod",
];

export function hasProfanity(s) {
  const latin = String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return PROFANITY_LATIN.some((w) => latin.includes(w));
}

export function normalizeHandle(raw) {
  return String(raw ?? "").toLowerCase().trim();
}

/** null when acceptable, else one of: too_short | too_long | invalid | profanity */
export function handleProblem(raw) {
  const u = normalizeHandle(raw);
  if (u.length < 1) return "too_short";
  if (u.length > 20) return "too_long";
  if (!HANDLE_RE.test(u)) return "invalid";
  if (hasProfanity(u)) return "profanity";
  return null;
}

/** Human-readable text for each problem code, so every caller says the same thing. */
export const HANDLE_PROBLEM_MESSAGE = {
  too_short: "Please choose a username.",
  too_long: "Username must be 20 characters or fewer.",
  invalid: "Username can only contain lowercase letters, numbers, _ or -.",
  profanity: "That username contains language we don't allow. Please pick another.",
};
