import { describe, it, expect } from 'vitest';
import { validateAIResponse } from '../electron/ai/schema.js';
import { mockParseSync, type AIContext } from '../electron/ai/mock-server.js';

const ctx: AIContext = {
  teachers: ['Ahmet Yılmaz', 'Ayşe Demir'],
  classes: ['9A', '10F'],
  subjects: ['Matematik', 'Beden Eğitimi', 'Fizik'],
  rooms: ['Lab1', '101'],
  days: ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'],
  hoursPerDay: 8,
};

describe('AI schema discriminated union', () => {
  it('legacy constraint format (kind yok) backward compat', () => {
    const raw = {
      constraints: [
        {
          type: 'TEACHER_NOT_AVAILABLE',
          weight: 100,
          active: true,
          params: { teacher: 'Ahmet', slots: [] },
        },
      ],
      confidence: 0.9,
      explanation: 'Test',
      warnings: [],
      unresolved: [],
    };
    const parsed = validateAIResponse(raw);
    expect(parsed.kind ?? 'constraint').toBe('constraint');
    if ((parsed.kind ?? 'constraint') === 'constraint') {
      const cr = parsed as { constraints: unknown[] };
      expect(cr.constraints).toHaveLength(1);
    }
  });

  it('explicit kind:constraint geçerli', () => {
    const raw = {
      kind: 'constraint' as const,
      constraints: [],
      confidence: 0.5,
      explanation: 'Boş',
      warnings: [],
      unresolved: [],
    };
    const parsed = validateAIResponse(raw);
    expect(parsed.kind ?? 'constraint').toBe('constraint');
  });

  it('kind:query geçerli', () => {
    const raw = {
      kind: 'query' as const,
      answer: 'Ahmet 3 derse giriyor.',
      data: [{ class: '9A', subject: 'Matematik' }],
    };
    const parsed = validateAIResponse(raw);
    expect(parsed.kind).toBe('query');
    if (parsed.kind === 'query') {
      expect(parsed.answer).toContain('Ahmet');
    }
  });

  it('kind:tool_call geçerli', () => {
    const raw = {
      kind: 'tool_call' as const,
      tool: 'getTeacherActivities',
      args: { teacher: 'Ahmet' },
      reasoning: 'Dersleri öğrenmem lazım',
    };
    const parsed = validateAIResponse(raw);
    expect(parsed.kind).toBe('tool_call');
    if (parsed.kind === 'tool_call') {
      expect(parsed.tool).toBe('getTeacherActivities');
    }
  });

  it('kind:schedule_update geçerli', () => {
    const raw = {
      kind: 'schedule_update' as const,
      action: 'extend_breaks',
      params: { minutes: 20 },
      explanation: 'Teneffüsler uzatılacak',
    };
    const parsed = validateAIResponse(raw);
    expect(parsed.kind).toBe('schedule_update');
  });

  it('geçersiz schema throw eder', () => {
    expect(() => validateAIResponse({ kind: 'query' })).toThrow();
    expect(() => validateAIResponse({ kind: 'unknown_kind' })).toThrow();
    expect(() => validateAIResponse(null)).toThrow();
  });
});

describe('Mock schedule_update detection (DB-free)', () => {
  it('"teneffüsleri 20 dk uzat" → schedule_update extend_breaks', () => {
    const res = mockParseSync('Teneffüsleri 20 dakika uzat', ctx);
    expect(res.kind).toBe('schedule_update');
    if (res.kind === 'schedule_update') {
      expect(res.action).toBe('extend_breaks');
      expect(res.params['minutes']).toBe(20);
    }
  });

  it('"Cuma günü 1 saat ekle" → schedule_update add_hours_to_day', () => {
    const res = mockParseSync('Cuma günü 1 saat ekle', ctx);
    expect(res.kind).toBe('schedule_update');
    if (res.kind === 'schedule_update') {
      expect(res.action).toBe('add_hours_to_day');
      expect(res.params['day']).toBe('Cuma');
    }
  });
});

describe('Mock constraint backward compat (kind alanı eklendi)', () => {
  it('Ahmet hoca cuma yok hâlâ constraint kind döndürüyor', () => {
    const res = mockParseSync('Ahmet hoca cuma yok', ctx);
    expect(res.kind ?? 'constraint').toBe('constraint');
    if ((res.kind ?? 'constraint') === 'constraint') {
      const cr = res as { constraints: unknown[] };
      expect(cr.constraints).toHaveLength(1);
    }
  });
});

describe('AI schema data_mutation', () => {
  it('kind:data_mutation geçerli (çoklu action)', () => {
    const raw = {
      kind: 'data_mutation' as const,
      actions: [
        {
          op: 'add_subject',
          params: { name: 'Sanat Eğitimi' },
          description: '"Sanat Eğitimi" branşını ekle',
        },
        {
          op: 'add_activity',
          params: { class: '10F', subject: 'Sanat Eğitimi', weeklyHours: 2 },
          description: '10F sınıfına 2 saat Sanat Eğitimi',
        },
      ],
      explanation: '2 işlem önerildi',
      requiresConfirmation: true,
      confidence: 0.9,
    };
    const parsed = validateAIResponse(raw);
    expect(parsed.kind).toBe('data_mutation');
    if (parsed.kind === 'data_mutation') {
      expect(parsed.actions).toHaveLength(2);
      expect(parsed.requiresConfirmation).toBe(true);
    }
  });

  it('data_mutation requiresConfirmation:false reddedilir', () => {
    expect(() =>
      validateAIResponse({
        kind: 'data_mutation',
        actions: [{ op: 'add_subject', params: { name: 'X' }, description: 'X' }],
        explanation: 'x',
        requiresConfirmation: false,
      }),
    ).toThrow();
  });

  it('data_mutation bilinmeyen op reddedilir', () => {
    expect(() =>
      validateAIResponse({
        kind: 'data_mutation',
        actions: [{ op: 'invalid_op', params: {}, description: 'x' }],
        explanation: 'x',
        requiresConfirmation: true,
      }),
    ).toThrow();
  });

  it('data_mutation boş actions reddedilir', () => {
    expect(() =>
      validateAIResponse({
        kind: 'data_mutation',
        actions: [],
        explanation: 'x',
        requiresConfirmation: true,
      }),
    ).toThrow();
  });
});

describe('Mock data_mutation detection', () => {
  it('"Cumartesi günü ekle" → add_day', () => {
    const res = mockParseSync('Cumartesi gününü ekle', ctx);
    expect(res.kind).toBe('data_mutation');
    if (res.kind === 'data_mutation') {
      expect(res.actions).toHaveLength(1);
      expect(res.actions[0]!.op).toBe('add_day');
      expect(res.actions[0]!.params['name']).toBe('Cumartesi');
    }
  });

  it('"Lab1 dersliği ekle kapasite 25" → add_room', () => {
    const res = mockParseSync("Yeni 'Lab3' dersliği ekle kapasite 25", ctx);
    expect(res.kind).toBe('data_mutation');
    if (res.kind === 'data_mutation') {
      expect(res.actions[0]!.op).toBe('add_room');
      expect(res.actions[0]!.params['capacity']).toBe(25);
    }
  });

  it('"Ahmet hocaya 10F\'ye 2 saat sanat dersi ekle" → çoklu action', () => {
    const res = mockParseSync(
      "Ahmet Yılmaz hocaya 10F'ye 2 saat Sanat Eğitimi dersi ekle",
      ctx,
    );
    expect(res.kind).toBe('data_mutation');
    if (res.kind === 'data_mutation') {
      const ops = res.actions.map((a) => a.op);
      expect(ops).toContain('add_subject');
      expect(ops).toContain('link_teacher_subject');
      expect(ops).toContain('add_activity');
    }
  });

  it('"Ahmet Yılmaz öğretmenini sil" → delete_teacher (onay metni içerir)', () => {
    const res = mockParseSync('Ahmet Yılmaz öğretmenini sil', ctx);
    expect(res.kind).toBe('data_mutation');
    if (res.kind === 'data_mutation') {
      expect(res.actions[0]!.op).toBe('delete_teacher');
      expect(res.explanation.toLowerCase()).toContain('onayl');
    }
  });

  it('"ders programı oluşturalım, nereden başlayalım" → query (konuşma)', () => {
    const res = mockParseSync(
      'Ders programı oluşturalım, nereden başlayalım?',
      ctx,
    );
    expect(res.kind).toBe('query');
    if (res.kind === 'query') {
      expect(res.answer.toLowerCase()).toMatch(/(dağıtım|hangi|programı üret|kısıtlama|sınıf)/);
    }
  });

  it('"Müzik branşını sil" → delete_subject', () => {
    const ctxMusic = { ...ctx, subjects: ['Matematik', 'Müzik'] };
    const res = mockParseSync('Müzik dersini sil', ctxMusic);
    expect(res.kind).toBe('data_mutation');
    if (res.kind === 'data_mutation') {
      expect(res.actions[0]!.op).toBe('delete_subject');
      expect(res.actions[0]!.params['name']).toBe('Müzik');
    }
  });
});
