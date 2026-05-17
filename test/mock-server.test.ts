import { describe, it, expect } from 'vitest';
import { mockParseSync, type AIContext } from '../electron/ai/mock-server.js';

const ctx: AIContext = {
  teachers: ['Ahmet Yılmaz', 'Ayşe Demir'],
  classes: ['9A', '10F'],
  subjects: ['Matematik', 'Beden Eğitimi', 'Fizik'],
  rooms: ['Lab1', '101'],
  days: ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'],
  hoursPerDay: 8,
};

describe('mockParse pattern detection', () => {
  it('1) "Ahmet hoca cuma yok" → TEACHER_NOT_AVAILABLE tüm Cuma', () => {
    const res = mockParseSync('Ahmet hoca cuma yok', ctx);
    expect(res.constraints).toHaveLength(1);
    const c = res.constraints[0]!;
    expect(c.type).toBe('TEACHER_NOT_AVAILABLE');
    expect(c.params['teacher']).toBe('Ahmet Yılmaz');
    expect((c.params['slots'] as any[]).length).toBe(8);
  });

  it('2) "Ahmet hoca cuma 2. ve 5. derslerde olmasın" → 2 slot', () => {
    const res = mockParseSync(
      'Ahmet hoca cuma 2. ve 5. derslerde olmasın',
      ctx,
    );
    expect(res.constraints).toHaveLength(1);
    const c = res.constraints[0]!;
    expect(c.type).toBe('TEACHER_NOT_AVAILABLE');
    expect(c.params['teacher']).toBe('Ahmet Yılmaz');
    expect(c.params['slots']).toEqual([
      { day: 'Cuma', hour: 2 },
      { day: 'Cuma', hour: 5 },
    ]);
  });

  it('3) "Beden eğitimi son derste olsun" → SUBJECT_LAST_HOUR_OF_DAY', () => {
    const res = mockParseSync('Beden eğitimi son derste olsun', ctx);
    expect(res.constraints).toHaveLength(1);
    const c = res.constraints[0]!;
    expect(c.type).toBe('SUBJECT_LAST_HOUR_OF_DAY');
    expect(c.params['subject']).toBe('Beden Eğitimi');
  });

  it('4) "Matematik cuma olmasın 10F için" → SUBJECT_NOT_ON_DAY', () => {
    const res = mockParseSync('Matematik cuma olmasın 10F için', ctx);
    expect(res.constraints).toHaveLength(1);
    const c = res.constraints[0]!;
    expect(c.type).toBe('SUBJECT_NOT_ON_DAY');
    expect(c.params['subject']).toBe('Matematik');
    expect(c.params['class']).toBe('10F');
    expect(c.params['days']).toEqual(['Cuma']);
  });

  it('5) "Ahmet günde max 6 ders" → TEACHER_MAX_HOURS_DAILY', () => {
    const res = mockParseSync('Ahmet günde max 6 ders', ctx);
    expect(res.constraints).toHaveLength(1);
    const c = res.constraints[0]!;
    expect(c.type).toBe('TEACHER_MAX_HOURS_DAILY');
    expect(c.params['teacher']).toBe('Ahmet Yılmaz');
    expect(c.params['maxHours']).toBe(6);
  });

  it('Bilinmeyen istek → constraints boş + low confidence', () => {
    const res = mockParseSync('Lalala bla', ctx);
    expect(res.constraints).toHaveLength(0);
    expect(res.confidence).toBeLessThan(0.5);
  });

  it('Belirsiz isim → unresolved + constraints boş', () => {
    const ambiguous: AIContext = {
      ...ctx,
      teachers: ['Ahmet Yılmaz', 'Ahmet Demir'],
    };
    const res = mockParseSync('Ahmet hoca cuma yok', ambiguous);
    expect(res.constraints).toHaveLength(0);
    expect(res.unresolved.length).toBeGreaterThan(0);
  });
});
