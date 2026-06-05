import { describe, it, expect, beforeEach } from 'vitest';
import { mockParseSync, type AIContext } from '../electron/ai/mock-server.js';
import {
  recordGenerationFailure,
  clearGenerationFailure,
  getGenerationFailure,
  getGenerationFailureContext,
  parseUnplacedFromMessage,
} from '../electron/ai/generation-feedback.js';

function baseCtx(overrides: Partial<AIContext> = {}): AIContext {
  return {
    teachers: ['Ahmet Yılmaz', 'Ayşe Demir'],
    classes: ['9A', '9B'],
    subjects: ['Matematik', 'Fizik'],
    rooms: ['201'],
    days: ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'],
    hoursPerDay: 8,
    constraints: [],
    ...overrides,
  };
}

const STRICT = [
  { id: 1, type: 'CLASS_NOT_AVAILABLE', weight: 100, active: true, description: '9A Cuma yok' },
  { id: 2, type: 'TEACHER_NOT_AVAILABLE', weight: 100, active: true, description: 'Ahmet hoca Cuma boş' },
  { id: 3, type: 'SUBJECT_MAX_HOURS_DAILY', weight: 100, active: true, description: 'Kimya günde en fazla 2 saat' },
];

describe('Round-7 — generation-feedback modülü', () => {
  beforeEach(() => clearGenerationFailure());

  it('record + getGenerationFailureContext: at zaman damgasını gizler, sayıları korur', () => {
    recordGenerationFailure({ reason: 'PARTIAL', message: '3/40 yerleşmedi', unplaced: 3, total: 40 });
    const full = getGenerationFailure();
    expect(full?.at).toBeTypeOf('string');
    const ctx = getGenerationFailureContext();
    expect(ctx).toEqual({ reason: 'PARTIAL', message: '3/40 yerleşmedi', unplaced: 3, total: 40 });
    // Modele gönderilen kompakt nesnede 'at' OLMAMALI.
    expect((ctx as Record<string, unknown>).at).toBeUndefined();
  });

  it('clearGenerationFailure → null', () => {
    recordGenerationFailure({ reason: 'NO_SOLUTION', message: 'olmadı' });
    expect(getGenerationFailureContext()).not.toBeNull();
    clearGenerationFailure();
    expect(getGenerationFailureContext()).toBeNull();
  });

  it('NO_SOLUTION gibi sayı içermeyen hatada unplaced/total alanları eklenmez', () => {
    recordGenerationFailure({ reason: 'NO_SOLUTION', message: 'Çözüm yok' });
    expect(getGenerationFailureContext()).toEqual({ reason: 'NO_SOLUTION', message: 'Çözüm yok' });
  });

  it('parseUnplacedFromMessage: "3/40 ders" → {3,40}; eşleşmezse null', () => {
    expect(parseUnplacedFromMessage('Program tamamlanamadı: 3/40 ders yerleştirilemedi.')).toEqual({
      unplaced: 3,
      total: 40,
    });
    expect(parseUnplacedFromMessage('Çözüm bulunamadı.')).toBeNull();
    expect(parseUnplacedFromMessage('0/0 ders')).toBeNull();
  });
});

describe('Round-7 — mock-server LAST_GENERATION_FAILURE farkındalığı', () => {
  it('NO_SOLUTION + katı kısıt + "düzelt" → set_constraint_weight 70 ve neden açıklaması', () => {
    const ctx = baseCtx({
      constraints: STRICT,
      lastGenerationFailure: { reason: 'NO_SOLUTION', message: 'Çözüm bulunamadı.' },
    });
    const res = mockParseSync('düzelt', ctx) as {
      kind: string;
      actions: { op: string; params: { weight: number } }[];
      explanation: string;
    };
    expect(res.kind).toBe('data_mutation');
    expect(res.actions.length).toBeGreaterThan(0);
    expect(res.actions.every((a) => a.op === 'set_constraint_weight' && a.params.weight === 70)).toBe(true);
    expect(res.explanation).toContain('FET tüm kısıtları aynı anda sağlayamadı');
  });

  it('PARTIAL + sayılar + "neden olmadı?" → açıklamada "40 dersten 3" geçer', () => {
    const ctx = baseCtx({
      constraints: STRICT,
      lastGenerationFailure: { reason: 'PARTIAL', message: '3/40', unplaced: 3, total: 40 },
    });
    const res = mockParseSync('neden olmadı?', ctx) as { kind: string; explanation?: string; answer?: string };
    const text = res.explanation ?? res.answer ?? '';
    expect(text).toContain('40 dersten 3');
  });

  it('NO_ACTIVITIES (veri eksik) → query rehberliği, action yok', () => {
    const ctx = baseCtx({
      constraints: [],
      lastGenerationFailure: { reason: 'NO_ACTIVITIES', message: 'ders ataması yok' },
    });
    const res = mockParseSync('neden olmadı?', ctx) as { kind: string; answer: string };
    expect(res.kind).toBe('query');
    expect(res.answer).toContain('ders ataması');
  });

  it('Hata var ama katı kısıt yok + "düzelt" → query: gevşetilecek katı kısıt yok', () => {
    const ctx = baseCtx({
      constraints: [],
      lastGenerationFailure: { reason: 'NO_SOLUTION', message: 'Çözüm bulunamadı.' },
    });
    const res = mockParseSync('düzelt', ctx) as { kind: string; answer: string };
    expect(res.kind).toBe('query');
    expect(res.answer).toContain('katı kısıtlama yok');
    expect(res.answer).toContain('FET tüm kısıtları aynı anda sağlayamadı');
  });

  it('Hata YOKKEN "neden olmadı?" relax önerisi tetiklemez', () => {
    const ctx = baseCtx({ constraints: STRICT });
    const res = mockParseSync('neden olmadı?', ctx) as {
      kind: string;
      actions?: { op: string }[];
    };
    const hasRelax =
      res.kind === 'data_mutation' &&
      (res.actions ?? []).some((a) => a.op === 'set_constraint_weight');
    expect(hasRelax).toBe(false);
  });
});
