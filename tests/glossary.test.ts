import { describe, it, expect } from 'vitest';
import { toEnglishQuery } from '../src/library/glossary';

describe('Arabic search glossary', () => {
  it('translates plain words and strips the article/suffixes', () => {
    expect(toEnglishQuery('مدرسة').query).toBe('school');
    expect(toEnglishQuery('المدرسة').query).toBe('school');
    expect(toEnglishQuery('بالسيارة').query).toBe('car');
    expect(toEnglishQuery('الطلاب').query).toBe('students');
  });
  it('ignores harakat and hamza variants', () => {
    expect(toEnglishQuery('كِتَاب').query).toBe('book');
    expect(toEnglishQuery('انترنت').query).toBe('internet');
  });
  it('keeps English words and reports unknown Arabic', () => {
    const r = toEnglishQuery('rocket كلمةغريبة');
    expect(r.query).toBe('rocket');
    expect(r.unknown).toEqual(['كلمةغريبة']);
  });
});
