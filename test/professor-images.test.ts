import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const photos = read('site/assets/data/professors.json');
const provenance = read('site/assets/data/professor-image-provenance-20261114.json');
describe('identity-linked professor image assets', () => {
  it('describes the mixed sources without a blanket public-domain claim', () => {
    const page = readFileSync('web/src/pages/professors.astro', 'utf8');
    expect(page).toContain('Images include sourced photographs, historical depictions and organization logos.');
    expect(page).not.toContain('public domain unless');
  });
  it('serves every mapped file locally, without broken Jodh Singh placeholder', () => {
    for (const photo of Object.values(photos) as any[]) {
      expect(photo.img).toMatch(/^assets\/professors\/[a-z0-9.-]+$/);
      expect(existsSync(`web/public/${photo.img}`), photo.img).toBe(true);
      expect(photo.source).toMatch(/^https:\/\//);
    }
    expect(photos['Jodh Singh']).toBeUndefined();
  });
  it('keeps the public map identical and source copies hash-verified', () => {
    expect(read('web/public/assets/data/professors.json')).toEqual(photos);
    for (const r of provenance.new_records) {
      expect(createHash('sha256').update(readFileSync(`site/${r.img}`)).digest('hex')).toBe(r.sha256);
      expect(readFileSync(`site/${r.img}`).equals(readFileSync(`web/public/${r.img}`))).toBe(true);
      expect(r.source || r.identity_url).toMatch(/^https:\/\//);
      expect(r.licence).toBeTruthy();
      expect(typeof r.release_review_required).toBe('boolean');
    }
  });
  it('labels depictions and institutional logos truthfully', () => {
    expect(photos['Bhai Nand Lal'].kind).toBe('historical painting');
    expect(photos['Harnam Daas Udasi'].kind).toBe('historical illustration');
    expect(photos['Daljit Singh Jawa'].position).toBe('left top');
    expect(photos['Sant Nihal Singh Nirmala'].kind).toBe('historical illustration');
    expect(photos['Sikhi University'].kind).toBe('organization logo');
    expect(photos['Sikh Archive'].kind).toBe('organization logo');
    expect(photos['Bhai Avtar Singh'].position).toBe('25% top');
  });
});
