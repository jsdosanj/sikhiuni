import { describe, it, expect } from "vitest";
import { fold, queryTerms, withinOneEdit, fieldScore, scoreEntry } from "../web/src/lib/search-core";

const e = (t: string, b = "") => ({ t: fold(t), p: "", o: "", b: fold(b) });

describe("search-core", () => {
  it("folds case, diacritics and romanisation variants, leaving Gurmukhi intact", () => {
    expect(fold("Saahib")).toBe(fold("Sahib"));
    expect(fold("Gurbaanee")).toBe(fold("Gurbani"));
    expect(fold("Āsā")).toBe("asa");
    expect(fold("ਜਪੁ ਜੀ")).toBe("ਜਪੁ ਜੀ");
  });

  it("one-edit distance", () => {
    expect(withinOneEdit("japji", "japjii")).toBe(true);
    expect(withinOneEdit("sukhmani", "sukhmnai")).toBe(false);
    expect(withinOneEdit("histroy", "history")).toBe(false);
    expect(withinOneEdit("histry", "history")).toBe(true);
  });

  it("tolerates a one-letter typo in a 4+ letter term, but scores it below an exact match", () => {
    expect(fieldScore(fold("Sikh History Foundations"), "histry")).toBe(0.75);
    expect(fieldScore(fold("Sikh History Foundations"), "history")).toBe(2);
    expect(fieldScore(fold("Sikh History"), "hist")).toBe(2);
    expect(fieldScore(fold("Ask"), "asx")).toBe(0); // short terms never fuzz
  });

  it("synonyms: 'sikhism' finds a title that only says Sikhi", () => {
    expect(scoreEntry(e("Introduction to Sikhi"), queryTerms("sikhism"), "sikhism")).toBeGreaterThan(0);
  });

  it("ranks a title hit above a body-only hit, and an exact phrase highest", () => {
    const q = queryTerms("guru nanak");
    const title = scoreEntry(e("Guru Nanak Dev Ji: Life"), q, "guru nanak");
    const body = scoreEntry(e("The Ten Gurus", "guru nanak and the nine Gurus"), q, "guru nanak");
    expect(title).toBeGreaterThan(body);
  });

  it("no match scores zero", () => {
    expect(scoreEntry(e("Gardening basics"), queryTerms("gurbani"), "gurbani")).toBe(0);
  });
});
