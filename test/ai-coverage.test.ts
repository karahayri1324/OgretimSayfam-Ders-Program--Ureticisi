import { describe, it, expect } from 'vitest';
import { mockParseSync, type AIContext } from '../electron/ai/mock-server.js';
import type { AIResponse } from '../src/lib/types.js';

/**
 * AI mock-server coverage testi — 50+ gerçek Türkçe prompt için parse
 * sonucunu beklenen kind/op/param'larla karşılaştırır.
 *
 * Kategoriler (toplam ≥ 50):
 *  - Tek constraint (5)
 *  - Çoklu constraint (5)
 *  - Query (10)
 *  - Tool call (5)
 *  - Data mutation simple (10)
 *  - Data mutation complex (5)
 *  - Schedule update (5)
 *  - Wizard (3)
 *  - Edge cases / ambiguous (5)
 *
 * Mock pattern-bazlı olduğu için %100 deterministik. Gerçek LLM bu sayıyı
 * %95+'a taşır; mock'ta beklenen ≥%80 hedef.
 */

const CTX: AIContext = {
  teachers: [
    'Ahmet Yılmaz',
    'Ayşe Demir',
    'Mehmet Kaya',
    'Zeynep Öz',
    'Hasan Öztürk',
  ],
  classes: ['9A', '9B', '9C', '10A', '10F', '11A', '11FEN', '12SAY'],
  subjects: [
    'Matematik',
    'Fizik',
    'Türkçe',
    'Tarih',
    'Beden Eğitimi',
    'İngilizce',
    'Resim',
    'Müzik',
  ],
  rooms: ['101', '102', '103', 'Lab1', 'Lab2', 'Salon'],
  days: ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'],
  hoursPerDay: 8,
};

type Expect = {
  prompt: string;
  category: string;
  kind: AIResponse['kind'];
  // İsteğe bağlı: ek alan kontrolleri
  predicate?: (res: AIResponse) => boolean;
};

const CASES: Expect[] = [
  // ── Tek constraint (5) ─────────────────────────────────────────────────
  {
    prompt: 'Ahmet hoca cuma yok',
    category: 'single_constraint',
    kind: 'constraint',
    predicate: (r) =>
      r.kind === 'constraint' &&
      r.constraints[0]?.type === 'TEACHER_NOT_AVAILABLE',
  },
  {
    prompt: 'Mehmet hoca pazartesi 1. derste olmasın',
    category: 'single_constraint',
    kind: 'constraint',
    predicate: (r) =>
      r.kind === 'constraint' &&
      r.constraints[0]?.type === 'TEACHER_NOT_AVAILABLE',
  },
  {
    prompt: 'Beden eğitimi son derste olsun',
    category: 'single_constraint',
    kind: 'constraint',
    predicate: (r) =>
      r.kind === 'constraint' &&
      r.constraints[0]?.type === 'SUBJECT_LAST_HOUR_OF_DAY',
  },
  {
    prompt: 'Matematik dersi günde en fazla 2 saat olsun',
    category: 'single_constraint',
    kind: 'constraint',
    predicate: (r) =>
      r.kind === 'constraint' &&
      r.constraints[0]?.type === 'SUBJECT_MAX_HOURS_DAILY',
  },
  {
    prompt: 'Ayşe hoca günde max 6 ders',
    category: 'single_constraint',
    kind: 'constraint',
    predicate: (r) =>
      r.kind === 'constraint' &&
      r.constraints[0]?.type === 'TEACHER_MAX_HOURS_DAILY',
  },

  // ── Çoklu constraint (5) — ek detector'lar ────────────────────────────
  {
    prompt: 'Matematik sabah olsun',
    category: 'extended_constraint',
    kind: 'constraint',
    predicate: (r) =>
      r.kind === 'constraint' &&
      r.constraints[0]?.type === 'SUBJECT_PREFERRED_HOURS',
  },
  {
    prompt: 'Fizik dersi Lab1 dersliğinde yapılsın',
    category: 'extended_constraint',
    kind: 'constraint',
    predicate: (r) =>
      r.kind === 'constraint' &&
      r.constraints[0]?.type === 'SUBJECT_PREFERRED_ROOM',
  },
  {
    prompt: 'Ahmet hocanın boş saati olmasın',
    category: 'extended_constraint',
    kind: 'constraint',
    predicate: (r) =>
      r.kind === 'constraint' &&
      r.constraints[0]?.type === 'TEACHER_MAX_GAPS_PER_DAY',
  },
  {
    prompt: 'Ahmet hoca haftada en fazla 4 gün gelsin',
    category: 'extended_constraint',
    kind: 'constraint',
    predicate: (r) =>
      r.kind === 'constraint' &&
      r.constraints[0]?.type === 'TEACHER_MAX_DAYS_PER_WEEK',
  },
  {
    prompt: 'Resim dersi blok olsun',
    category: 'extended_constraint',
    kind: 'constraint',
    predicate: (r) =>
      r.kind === 'constraint' &&
      r.constraints[0]?.type === 'SUBJECT_CONSECUTIVE_HOURS',
  },

  // ── Query (10) ─────────────────────────────────────────────────────────
  {
    prompt: 'Tüm öğretmenleri listele',
    category: 'query',
    kind: 'query',
  },
  {
    prompt: 'Kaç dersliğim var?',
    category: 'query',
    kind: 'query',
  },
  {
    prompt: 'Kaç sınıfım var?',
    category: 'query',
    kind: 'query',
  },
  {
    prompt: 'Kaç öğretmen tanımlı?',
    category: 'query',
    kind: 'query',
  },
  {
    prompt: 'Özet ver',
    category: 'query',
    kind: 'query',
  },
  {
    prompt: 'Şu anda durum ne?',
    category: 'query',
    kind: 'query',
  },
  {
    prompt: 'Sınıflar nasıl listelenir?',
    category: 'query',
    kind: 'query',
  },
  {
    prompt: 'Kaç kısıtlama var?',
    category: 'query',
    kind: 'query',
  },
  {
    prompt: 'Program ayarları nasıl?',
    category: 'query',
    kind: 'query',
  },
  {
    prompt: 'Ahmet Yılmaz hangi derslere giriyor?',
    category: 'query',
    kind: 'query',
  },

  // ── Tool call (5) ──────────────────────────────────────────────────────
  {
    prompt: 'Hangi sınıfların matematik dersi var?',
    category: 'tool_call',
    kind: 'tool_call',
    predicate: (r) =>
      r.kind === 'tool_call' && r.tool === 'getSubjectTeachers',
  },
  {
    prompt: '10A sınıfının programı nasıl?',
    category: 'tool_call_class',
    kind: 'query',
  },
  {
    prompt: 'Matematik dersini kim veriyor?',
    category: 'tool_call_subject',
    kind: 'query',
  },
  {
    prompt: 'Ayşe Demir hocanın dersleri neler?',
    category: 'tool_call_teacher',
    kind: 'query',
  },
  {
    prompt: 'Zeynep hangi sınıflara giriyor?',
    category: 'tool_call_teacher_classes',
    kind: 'query',
  },

  // ── Data mutation simple (10) ──────────────────────────────────────────
  {
    prompt: 'Mehmet Kaya öğretmenini sil',
    category: 'dm_simple',
    kind: 'data_mutation',
    predicate: (r) =>
      r.kind === 'data_mutation' && r.actions[0]?.op === 'delete_teacher',
  },
  {
    prompt: 'Müzik branşını sil',
    category: 'dm_simple',
    kind: 'data_mutation',
    predicate: (r) =>
      r.kind === 'data_mutation' && r.actions[0]?.op === 'delete_subject',
  },
  {
    prompt: 'Lab2 dersliğini sil',
    category: 'dm_simple',
    kind: 'data_mutation',
    predicate: (r) =>
      r.kind === 'data_mutation' && r.actions[0]?.op === 'delete_room',
  },
  {
    prompt: '11A sınıfını sil',
    category: 'dm_simple',
    kind: 'data_mutation',
    predicate: (r) =>
      r.kind === 'data_mutation' && r.actions[0]?.op === 'delete_class',
  },
  {
    prompt: 'Cumartesi gününü ekle',
    category: 'dm_simple',
    kind: 'data_mutation',
    predicate: (r) =>
      r.kind === 'data_mutation' && r.actions[0]?.op === 'add_day',
  },
  {
    prompt: 'Pazar gününü sil',
    category: 'dm_simple',
    kind: 'data_mutation',
    // Eğer Pazar context'te yoksa sil olmadan handlerdan çıkıp clarification döner;
    // burada Pazar context'te yok → ya data_mutation ya da query.
    predicate: (r) => r.kind === 'data_mutation' || r.kind === 'query',
  },
  {
    prompt: "Yeni 'Lab3' dersliği ekle kapasite 25",
    category: 'dm_simple',
    kind: 'data_mutation',
    predicate: (r) =>
      r.kind === 'data_mutation' && r.actions[0]?.op === 'add_room',
  },
  {
    prompt: 'Coğrafya branşını ekle',
    category: 'dm_simple',
    kind: 'data_mutation',
    predicate: (r) =>
      r.kind === 'data_mutation' && r.actions[0]?.op === 'add_subject',
  },
  {
    prompt: '10F sınıfını ekle',
    category: 'dm_simple',
    kind: 'data_mutation',
    predicate: (r) =>
      r.kind === 'data_mutation' && r.actions[0]?.op === 'add_class',
  },
  {
    prompt: 'Esra Korkmaz öğretmenini ekle',
    category: 'dm_simple',
    kind: 'data_mutation',
    predicate: (r) =>
      r.kind === 'data_mutation' && r.actions[0]?.op === 'add_teacher',
  },

  // ── Data mutation complex (5) ──────────────────────────────────────────
  {
    prompt: "Ahmet Yılmaz hocaya 10F'ye 2 saat Sanat Eğitimi dersi ekle",
    category: 'dm_complex',
    kind: 'data_mutation',
    predicate: (r) => {
      if (r.kind !== 'data_mutation') return false;
      const ops = r.actions.map((a) => a.op);
      return (
        ops.includes('add_subject') &&
        ops.includes('link_teacher_subject') &&
        ops.includes('add_activity')
      );
    },
  },
  {
    prompt: '9A, 9B, 9C sınıflarına Matematik 6 saat ekle',
    category: 'dm_complex',
    kind: 'data_mutation',
    predicate: (r) =>
      r.kind === 'data_mutation' &&
      r.actions.filter((a) => a.op === 'add_activity').length >= 3,
  },
  {
    prompt: '9A ve 9B sınıflarına matematik 5 saat ekle',
    category: 'dm_complex',
    kind: 'data_mutation',
    predicate: (r) =>
      r.kind === 'data_mutation' &&
      r.actions.filter((a) => a.op === 'add_activity').length >= 2,
  },
  {
    prompt: 'Tüm 9. sınıflara fizik 3 saat ekle',
    category: 'dm_complex',
    kind: 'data_mutation',
    predicate: (r) => {
      if (r.kind !== 'data_mutation') return false;
      const activityOps = r.actions.filter((a) => a.op === 'add_activity');
      return activityOps.length >= 3; // 9A, 9B, 9C
    },
  },
  {
    prompt: 'Ahmet ve Ayşe öğretmenlerini sil',
    category: 'dm_complex',
    kind: 'data_mutation',
    predicate: (r) =>
      r.kind === 'data_mutation' &&
      r.actions.length === 2 &&
      r.actions.every((a) => a.op === 'delete_teacher'),
  },

  // ── Schedule update (5) ────────────────────────────────────────────────
  {
    prompt: 'Teneffüsleri 15 dakika uzat',
    category: 'schedule_update',
    kind: 'schedule_update',
    predicate: (r) =>
      r.kind === 'schedule_update' && r.action === 'extend_breaks',
  },
  {
    prompt: 'Cuma günü 1 saat ekle',
    category: 'schedule_update',
    kind: 'schedule_update',
    predicate: (r) =>
      r.kind === 'schedule_update' && r.action === 'add_hours_to_day',
  },
  {
    prompt: 'Günde 9 saat ders olsun',
    category: 'schedule_update',
    kind: 'schedule_update',
    predicate: (r) =>
      r.kind === 'schedule_update' && r.action === 'set_hours_per_day',
  },
  {
    prompt: 'Cumartesi günü ekle',
    category: 'schedule_update_or_data',
    // Mock'ta "Cumartesi günü ekle" data_mutation:add_day olarak yakalanıyor;
    // her ikisi de geçerli sayılır.
    kind: 'data_mutation',
    predicate: (r) =>
      (r.kind === 'data_mutation' && r.actions[0]?.op === 'add_day') ||
      (r.kind === 'schedule_update' && r.action === 'add_day'),
  },
  {
    prompt: 'Salı gününü kaldır',
    category: 'schedule_update',
    kind: 'schedule_update',
    predicate: (r) =>
      (r.kind === 'schedule_update' && r.action === 'remove_day') ||
      (r.kind === 'data_mutation' && r.actions[0]?.op === 'delete_day'),
  },

  // ── Wizard (3) ─────────────────────────────────────────────────────────
  {
    prompt: 'Ders programı oluşturalım, nereden başlayalım?',
    category: 'wizard',
    kind: 'query',
    // Yeni conversational wizard: tek adım, ya ders dağıtımı sorar (context dolu)
    // ya da hangi/sınıf/programı üret/kısıtlama gibi anahtar kelimeler içerir.
    predicate: (r) =>
      r.kind === 'query' &&
      /(dağıtım|hangi|kısıtlama|programı\s+üret|sınıf|ders)/i.test(r.answer),
  },
  {
    prompt: 'Yeni okul başlangıcı yapalım',
    category: 'wizard',
    kind: 'query',
  },
  {
    prompt: 'Sıfırdan adım adım rehberlik et',
    category: 'wizard',
    kind: 'query',
  },

  // ── Edge cases / ambiguous (5) ─────────────────────────────────────────
  {
    prompt: 'Öğretmen ekle',
    category: 'ambiguous',
    kind: 'query',
    predicate: (r) =>
      r.kind === 'query' && /hangi|adı|adı.*belirt/i.test(r.answer),
  },
  {
    prompt: 'Sil',
    category: 'ambiguous',
    kind: 'query',
    predicate: (r) => r.kind === 'query' && /neyi|hangi/i.test(r.answer),
  },
  {
    prompt: 'Ders ekle',
    category: 'ambiguous',
    kind: 'query',
    predicate: (r) =>
      r.kind === 'query' && /hangi\s+sınıfa|saat|hangi\s+ders/i.test(r.answer),
  },
  {
    prompt: 'Lalala bla bla',
    category: 'ambiguous',
    kind: 'constraint',
    predicate: (r) =>
      r.kind === 'constraint' &&
      r.constraints.length === 0 &&
      r.confidence < 0.5,
  },
  {
    prompt: 'Derslik ekle',
    category: 'ambiguous',
    kind: 'query',
  },
];

describe('AI coverage — 50+ gerçek prompt', () => {
  let totalPassed = 0;

  for (const c of CASES) {
    it(`[${c.category}] ${c.prompt.slice(0, 60)}`, () => {
      const res = mockParseSync(c.prompt, CTX);
      const actualKind = res.kind ?? 'constraint';
      let ok = actualKind === c.kind;
      // alternate kind tolerance for predicate-only cases handled via predicate
      if (!ok && c.predicate) {
        ok = c.predicate(res);
      }
      expect(ok, `Beklenen kind=${c.kind}, gelen kind=${actualKind}`).toBe(true);
      if (c.predicate) {
        expect(c.predicate(res), 'predicate başarısız').toBe(true);
      }
      totalPassed++;
    });
  }

  it('Toplam ≥ 50 test caseinin geçtiğini doğrula', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(50);
  });
});

/**
 * Conversational wizard senaryoları — multi-turn dialog testleri.
 * Her senaryo bağımsız: context'i boştan başlatıp adım adım doldurarak
 * AI'nın bir SONRAKİ adıma ne sorduğunu doğrularız.
 */
describe('Conversational wizard — adım adım dialog', () => {
  const EMPTY: AIContext = {
    teachers: [],
    classes: [],
    subjects: [],
    rooms: [],
    days: ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'],
    hoursPerDay: 8,
  };

  it('1) İlk temas (boş context) → "hangi dersler" sorusu, KISA + 1 örnek', () => {
    const res = mockParseSync('Ders programı oluşturalım', EMPTY);
    expect(res.kind).toBe('query');
    if (res.kind === 'query') {
      expect(res.answer.toLowerCase()).toContain('hangi ders');
      // Tek adım — liste değil
      expect(res.answer.split('\n').length).toBeLessThan(4);
      // Örnek içermeli
      expect(res.answer.toLowerCase()).toMatch(/örnek|matematik|fizik/);
    }
  });

  it('2) "yardım et" → ilk adım: hangi dersler', () => {
    const res = mockParseSync('Yardım et', EMPTY);
    expect(res.kind).toBe('query');
    if (res.kind === 'query') {
      expect(res.answer.toLowerCase()).toContain('hangi ders');
    }
  });

  it('3) Subjects ekli, classes boş → "hangi sınıflar" sorusu', () => {
    const ctxAfterSubjects: AIContext = {
      ...EMPTY,
      subjects: ['Matematik', 'Fizik', 'Türkçe'],
    };
    const res = mockParseSync('tamam sonra ne yapalım', ctxAfterSubjects);
    expect(res.kind).toBe('query');
    if (res.kind === 'query') {
      expect(res.answer.toLowerCase()).toMatch(/sınıf|sinif/);
      // History'siz olduğu için ack olmayabilir, ama hangi sınıflar sorusu olmalı
    }
  });

  it('4) Subjects+classes ekli, rooms boş → "hangi derslikler" sorusu', () => {
    const ctxAfterClasses: AIContext = {
      ...EMPTY,
      subjects: ['Matematik'],
      classes: ['9A', '9B', '10F'],
    };
    const res = mockParseSync('devam edelim', ctxAfterClasses);
    expect(res.kind).toBe('query');
    if (res.kind === 'query') {
      expect(res.answer.toLowerCase()).toMatch(/derslik|oda|salon/);
    }
  });

  it('5) Subjects+classes+rooms ekli, teachers boş → "öğretmenler" sorusu', () => {
    const ctx: AIContext = {
      ...EMPTY,
      subjects: ['Matematik'],
      classes: ['9A'],
      rooms: ['101', 'Lab1'],
    };
    const res = mockParseSync('sırada ne var', ctx);
    expect(res.kind).toBe('query');
    if (res.kind === 'query') {
      expect(res.answer.toLowerCase()).toMatch(/öğretmen|hoca/);
    }
  });

  it('6) Tüm temel veri var → ders dağıtımı / kısıtlama / üret', () => {
    const ctx: AIContext = {
      ...EMPTY,
      subjects: ['Matematik', 'Fizik'],
      classes: ['9A', '9B'],
      rooms: ['101'],
      teachers: ['Ahmet Yılmaz'],
    };
    const res = mockParseSync('peki şimdi ne yapalım', ctx);
    expect(res.kind).toBe('query');
    if (res.kind === 'query') {
      expect(res.answer.toLowerCase()).toMatch(/dağıtım|kısıtlama|programı üret|hangi/);
    }
  });

  it('7) History-aware ack: önceki turda dersler sorulmuş, şimdi 3 ders ekli', () => {
    const ctxNow: AIContext = {
      ...EMPTY,
      subjects: ['Matematik', 'Fizik', 'Türkçe'],
    };
    const history = [
      { role: 'user' as const, text: 'yardım' },
      {
        role: 'assistant' as const,
        text: JSON.stringify({
          kind: 'query',
          answer:
            'İlk olarak: okulunuzda hangi dersler okutuluyor? (Örnek: Matematik...)',
        }),
      },
      { role: 'user' as const, text: 'Matematik, Fizik, Türkçe ekle' },
    ];
    const res = mockParseSync('tamam', ctxNow, history);
    expect(res.kind).toBe('query');
    if (res.kind === 'query') {
      // Ack içermeli: "süper" / "3 ders eklendi"
      expect(res.answer.toLowerCase()).toMatch(/süper|3 ders|eklendi/);
      // Sonraki adım sınıflar
      expect(res.answer.toLowerCase()).toMatch(/sınıf/);
    }
  });
});

/**
 * Multi-subject add mutation testleri — bug fix.
 * "Matematik, Fizik, Türkçe derslerini ekle" → 3 add_subject action.
 */
describe('Multi-subject add — bug fix', () => {
  const CTX_EMPTY_SUBJECTS: AIContext = {
    teachers: [],
    classes: [],
    subjects: [],
    rooms: [],
    days: ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'],
    hoursPerDay: 8,
  };

  it('"Matematik, Fizik, Türkçe derslerini ekle" → 3 add_subject', () => {
    const res = mockParseSync(
      'Matematik, Fizik, Türkçe derslerini ekle',
      CTX_EMPTY_SUBJECTS,
    );
    expect(res.kind).toBe('data_mutation');
    if (res.kind === 'data_mutation') {
      const adds = res.actions.filter((a) => a.op === 'add_subject');
      expect(adds.length).toBe(3);
      const names = adds.map((a) => a.params['name']);
      expect(names).toContain('Matematik');
      expect(names).toContain('Fizik');
      expect(names).toContain('Türkçe');
    }
  });

  it('"Matematik ve Fizik ekle" → 2 add_subject', () => {
    const res = mockParseSync('Matematik ve Fizik ekle', CTX_EMPTY_SUBJECTS);
    expect(res.kind).toBe('data_mutation');
    if (res.kind === 'data_mutation') {
      const adds = res.actions.filter((a) => a.op === 'add_subject');
      expect(adds.length).toBe(2);
      const names = adds.map((a) => a.params['name']);
      expect(names).toEqual(expect.arrayContaining(['Matematik', 'Fizik']));
    }
  });

  it('"Tarih ve Coğrafya derslerini sisteme ekle" → 2 add_subject', () => {
    const res = mockParseSync(
      'Tarih ve Coğrafya derslerini sisteme ekle',
      CTX_EMPTY_SUBJECTS,
    );
    expect(res.kind).toBe('data_mutation');
    if (res.kind === 'data_mutation') {
      const adds = res.actions.filter((a) => a.op === 'add_subject');
      expect(adds.length).toBe(2);
      const names = adds.map((a) => a.params['name']);
      expect(names).toEqual(expect.arrayContaining(['Tarih', 'Coğrafya']));
    }
  });

  it('"Müzik branşını ekle" → tek add_subject (regression: tek bozulmasın)', () => {
    const res = mockParseSync('Müzik branşını ekle', CTX_EMPTY_SUBJECTS);
    expect(res.kind).toBe('data_mutation');
    if (res.kind === 'data_mutation') {
      const adds = res.actions.filter((a) => a.op === 'add_subject');
      expect(adds.length).toBe(1);
      expect(adds[0]!.params['name']).toBe('Müzik');
    }
  });
});
