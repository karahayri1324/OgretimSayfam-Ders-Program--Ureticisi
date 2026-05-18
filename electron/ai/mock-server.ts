import type {
  AIConstraint,
  AIResponse,
  ConstraintType,
  DataMutationAction,
  Slot,
} from '../../src/lib/types.js';
import { executeTool, type ToolResult } from './tools.js';


export type AIContext = {
  teachers: string[];
  classes: string[];
  subjects: string[];
  rooms: string[];
  days: string[];
  hoursPerDay: number;
  constraints?: Array<{
    id: number;
    type: string;
    weight: number;
    active: boolean;
    description: string;
  }>;
};

const DAY_NORMALIZE: Record<string, string> = {
  pazartesi: 'Pazartesi',
  pzt: 'Pazartesi',
  pzts: 'Pazartesi',
  ptesi: 'Pazartesi',
  salı: 'Salı',
  sali: 'Salı',
  sal: 'Salı',
  çarşamba: 'Çarşamba',
  carsamba: 'Çarşamba',
  çar: 'Çarşamba',
  car: 'Çarşamba',
  perşembe: 'Perşembe',
  persembe: 'Perşembe',
  per: 'Perşembe',
  cuma: 'Cuma',
  cum: 'Cuma',
  cma: 'Cuma',
  cumartesi: 'Cumartesi',
  cmt: 'Cumartesi',
  pazar: 'Pazar',
  paz: 'Pazar',
};

const WORD_NUMBERS: Record<string, number> = {
  birinci: 1,
  ilk: 1,
  ikinci: 2,
  üçüncü: 3,
  ucuncu: 3,
  dördüncü: 4,
  dorduncu: 4,
  beşinci: 5,
  besinci: 5,
  altıncı: 6,
  altinci: 6,
  yedinci: 7,
  sekizinci: 8,
  dokuzuncu: 9,
  onuncu: 10,
};

const WORD_NUMBERS_CARDINAL: Record<string, number> = {
  bir: 1,
  iki: 2,
  üç: 3,
  uc: 3,
  dört: 4,
  dort: 4,
  beş: 5,
  bes: 5,
  altı: 6,
  alti: 6,
  yedi: 7,
  sekiz: 8,
  dokuz: 9,
  on: 10,
};

function deburr(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/i̇/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o');
}

function normalizeDay(token: string): string | null {
  const t = token.toLocaleLowerCase('tr');
  if (DAY_NORMALIZE[t]) return DAY_NORMALIZE[t];
  const d = deburr(token);
  for (const [k, v] of Object.entries(DAY_NORMALIZE)) {
    if (deburr(k) === d) return v;
  }
  return null;
}

function findDays(text: string): string[] {
  const found: string[] = [];
  const tokens = text.split(/[\s,.;:'"`]+/).filter(Boolean);
  for (const tok of tokens) {
    const d = normalizeDay(tok);
    if (d && !found.includes(d)) {
      found.push(d);
      continue;
    }
    const stripped = tok.replace(
      /(da|de|ta|te|dan|den|tan|ten|ya|ye|a|e|nin|nın|nun|nün|n[ıi]n)$/i,
      '',
    );
    if (stripped !== tok && stripped.length >= 3) {
      const d2 = normalizeDay(stripped);
      if (d2 && !found.includes(d2)) found.push(d2);
    }
  }
  return found;
}

function findHours(text: string): number[] {
  const found = new Set<number>();
  const re = /(\d{1,2})\s*\./g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = parseInt(m[1]!, 10);
    if (n >= 1 && n <= 20) found.add(n);
  }
  const lower = text.toLocaleLowerCase('tr');
  for (const [word, n] of Object.entries(WORD_NUMBERS)) {
    const pat = new RegExp(`\\b${word}\\b`);
    if (pat.test(lower)) found.add(n);
  }
  return Array.from(found).sort((a, b) => a - b);
}

/** "max N", "en fazla N", "günde N saat" — tek bir sayı çıkar. */
function findCount(text: string): number | null {
  const lower = text.toLocaleLowerCase('tr');
  // "max 6", "en fazla 4", "günde 2"
  const re = /(?:max|en\s+fazla|en\s+cok|en\s+çok|gunde|günde|toplamda|haftada)\s+(\d{1,2})/;
  const m = lower.match(re);
  if (m) {
    const n = parseInt(m[1]!, 10);
    if (n > 0 && n <= 50) return n;
  }
  // cardinal Türkçe sayı kelimesi
  for (const [word, n] of Object.entries(WORD_NUMBERS_CARDINAL)) {
    const pat = new RegExp(`\\b(?:max|en\\s+fazla|en\\s+cok|en\\s+çok|gunde|günde|haftada)\\s+${word}\\b`);
    if (pat.test(lower)) return n;
  }
  // fallback: ilk geçen 1-2 haneli sayı
  const fallback = lower.match(/\b(\d{1,2})\b/);
  if (fallback) {
    const n = parseInt(fallback[1]!, 10);
    if (n > 0 && n <= 50) return n;
  }
  return null;
}

/** Aday adlardan input'la en iyi eşleşeni döner. {match, ambiguous} */
function fuzzyMatch(text: string, candidates: string[]): { exact: string | null; matches: string[] } {
  if (candidates.length === 0) return { exact: null, matches: [] };
  const lowText = deburr(text);
  const hits: string[] = [];
  for (const c of candidates) {
    const lowC = deburr(c);
    // tam isim geçiyor mu?
    if (lowText.includes(lowC)) {
      hits.push(c);
      continue;
    }
    // adın herhangi bir kelimesi geçiyor mu?
    const parts = lowC.split(/\s+/).filter((p) => p.length >= 3);
    for (const part of parts) {
      // kelime sınırıyla eşleş
      const re = new RegExp(`\\b${escapeRegex(part)}\\b`);
      if (re.test(lowText)) {
        if (!hits.includes(c)) hits.push(c);
        break;
      }
    }
  }
  if (hits.length === 1) return { exact: hits[0]!, matches: hits };
  return { exact: null, matches: hits };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fuzzyMatchMany(text: string, candidates: string[]): string[] {
  if (candidates.length === 0) return [];
  const lowText = deburr(text);
  const hits: string[] = [];
  for (const c of candidates) {
    const lowC = deburr(c);
    if (lowText.includes(lowC)) {
      if (!hits.includes(c)) hits.push(c);
      continue;
    }
    const parts = lowC.split(/\s+/).filter((p) => p.length >= 3);
    for (const part of parts) {
      const re = new RegExp(`\\b${escapeRegex(part)}\\b`);
      if (re.test(lowText)) {
        if (!hits.includes(c)) hits.push(c);
        break;
      }
    }
  }
  return hits;
}

/**
 * "X'i Y olarak değiştir/yap" pattern'inden Y'yi çıkartır.
 * X = currentName parametresi (matched fuzzy). Y trimlenmiş olarak döner,
 * boş/eşitse null.
 */
function extractRenameTarget(text: string, currentName: string): string | null {
  // "X olarak ..." veya "X'i Y olarak" — Y kısmını yakala
  const re = new RegExp(
    `(?:${escapeRegex(currentName)})['"’ʼ]?[a-zçğıöşü]?[\\s]+(?:olarak|adini|adıni|adını|olarak\\s+yap|yeniden\\s+adlandir|yeniden\\s+adlandır)[\\s]+([\\wçğıöşüÇĞİÖŞÜ0-9._-]{1,40})`,
    'i',
  );
  const m = re.exec(text);
  if (m && m[1]) {
    const target = m[1].trim();
    if (target && deburr(target).toLowerCase() !== deburr(currentName).toLowerCase()) {
      return target;
    }
  }
  const re2 = /([A-Za-z0-9çğıöşüÇĞİÖŞÜ._-]{1,40})\s+(?:olarak|olarak\s+yap)\b/i;
  const m2 = re2.exec(text);
  if (m2 && m2[1]) {
    const target = m2[1].trim();
    if (target && deburr(target).toLowerCase() !== deburr(currentName).toLowerCase()) {
      return target;
    }
  }
  return null;
}

function inferWeight(text: string): number {
  const lower = text.toLocaleLowerCase('tr');
  if (/(kesinlikle|asla|yasak|olmaz)/.test(lower)) return 100;
  if (/(olmasın|yapmasın|olmasin|girmesin|musait\s+degil|müsait\s+değil|yok\b|kapali|kapalı)/.test(lower)) return 100;
  if (/(olsa\s+iyi|tercih\s+ederim|tercihen|olsa\s+güzel|iyi\s+olur)/.test(lower)) return 80;
  if (/(mumkunse|mümkünse|imkan\s+varsa|imkân\s+varsa)/.test(lower)) return 60;
  if (/(olabilir|bazen)/.test(lower)) return 40;
  return 100;
}

function buildFullDaySlots(day: string, hoursPerDay: number): Slot[] {
  const out: Slot[] = [];
  for (let h = 1; h <= hoursPerDay; h++) out.push({ day, hour: h });
  return out;
}

function buildSlots(days: string[], hours: number[]): Slot[] {
  const out: Slot[] = [];
  for (const d of days) for (const h of hours) out.push({ day: d, hour: h });
  return out;
}


type Detector = (text: string, lower: string, ctx: AIContext) =>
  | { constraint: AIConstraint; warnings?: string[]; unresolved?: string[] }
  | null;

const detectTeacherNotAvailableFullDay: Detector = (text, lower, ctx) => {
  const teacherTrigger = /(hoca|ogretmen|öğretmen)/.test(lower);
  if (!teacherTrigger) return null;
  const noTrigger = /(yok\b|olmasin|olmasın|musait\s+degil|müsait\s+değil|gelmez|gelmesin)/.test(lower);
  if (!noTrigger) return null;
  if (/\d+\s*\.\s*ders|\d+\s*\.\s*saat/.test(lower)) return null;
  if (Object.keys(WORD_NUMBERS).some((w) => new RegExp(`\\b${w}\\b`).test(lower))) return null;

  const days = findDays(text);
  if (days.length === 0) return null;

  const { exact, matches } = fuzzyMatch(text, ctx.teachers);
  const weight = inferWeight(text);
  const slots = days.flatMap((d) => buildFullDaySlots(d, ctx.hoursPerDay));

  if (!exact) {
    return {
      constraint: {
        type: 'TEACHER_NOT_AVAILABLE',
        weight,
        active: true,
        params: { teacher: null, slots },
      },
      unresolved:
        matches.length === 0
          ? ['Belirtilen öğretmen adı bağlamda bulunamadı']
          : [`'${matches.join(', ')}' adları arasından hangisi belirsiz`],
    };
  }
  return {
    constraint: {
      type: 'TEACHER_NOT_AVAILABLE',
      weight,
      active: true,
      params: { teacher: exact, slots },
    },
  };
};

/** 2) "X hoca Y günü Z. derste olmasın" (tekli veya çoklu saat) */
const detectTeacherNotAvailableHours: Detector = (text, lower, ctx) => {
  const teacherTrigger = /(hoca|ogretmen|öğretmen)/.test(lower);
  if (!teacherTrigger) return null;
  const noTrigger = /(olmasin|olmasın|yok\b|girmesin|musait\s+degil|müsait\s+değil)/.test(lower);
  if (!noTrigger) return null;

  const days = findDays(text);
  const hours = findHours(text);
  if (days.length === 0 || hours.length === 0) return null;

  const { exact, matches } = fuzzyMatch(text, ctx.teachers);
  const weight = inferWeight(text);
  const slots = buildSlots(days, hours);

  if (!exact) {
    return {
      constraint: {
        type: 'TEACHER_NOT_AVAILABLE',
        weight,
        active: true,
        params: { teacher: null, slots },
      },
      unresolved:
        matches.length === 0
          ? ['Belirtilen öğretmen adı bağlamda bulunamadı']
          : [`'${matches.join(', ')}' adları arasından hangisi belirsiz`],
    };
  }
  return {
    constraint: {
      type: 'TEACHER_NOT_AVAILABLE',
      weight,
      active: true,
      params: { teacher: exact, slots },
    },
  };
};

/** 7) "X hoca günde en fazla N ders" — Ya da X bir öğretmen adı ise direkt eşleşir. */
const detectTeacherMaxHoursDaily: Detector = (text, lower, ctx) => {
  // "haftada ... gün" pattern'i TEACHER_MAX_DAYS_PER_WEEK detector'ına ait —
  // burada işlemeyelim.
  if (/(haftada|hafta).*(gun|gün)/.test(lower)) return null;
  // Max-hours sözlük tetikleyicisi yoksa atla
  if (!/(gunde|günde|max|en\s+fazla|en\s+cok|en\s+çok)/.test(lower)) return null;

  const teacherTrigger = /(hoca|ogretmen|öğretmen)/.test(lower);
  const teacherMatch = fuzzyMatch(text, ctx.teachers);
  const subjectMatch = fuzzyMatch(text, ctx.subjects);

  // Eğer "hoca" yoksa ve metin bir derse de eşleşiyorsa (öğretmen değil), subject pattern'e bırak.
  if (!teacherTrigger) {
    if (subjectMatch.exact) return null;
    if (!teacherMatch.exact && teacherMatch.matches.length === 0) return null;
  }

  const n = findCount(text);
  if (n === null) return null;

  const weight = inferWeight(text);

  if (!teacherMatch.exact) {
    return {
      constraint: {
        type: 'TEACHER_MAX_HOURS_DAILY',
        weight,
        active: true,
        params: { teacher: null, maxHours: n },
      },
      unresolved:
        teacherMatch.matches.length === 0
          ? ['Belirtilen öğretmen adı bağlamda bulunamadı']
          : [`'${teacherMatch.matches.join(', ')}' adları arasından hangisi belirsiz`],
    };
  }
  return {
    constraint: {
      type: 'TEACHER_MAX_HOURS_DAILY',
      weight,
      active: true,
      params: { teacher: teacherMatch.exact, maxHours: n },
    },
  };
};

/** 6) "X dersi günde en fazla N saat" */
const detectSubjectMaxHoursDaily: Detector = (text, lower, ctx) => {
  if (!/(ders|brans|branş)/.test(lower)) return null;
  if (!/(gunde|günde|haftada)/.test(lower) && !/(max|en\s+fazla|en\s+cok|en\s+çok)/.test(lower)) {
    return null;
  }
  if (/(hoca|ogretmen|öğretmen)/.test(lower)) return null;

  const n = findCount(text);
  if (n === null) return null;

  const { exact, matches } = fuzzyMatch(text, ctx.subjects);
  // Eğer metin ders adıyla eşleşmiyorsa (sadece "ders" kelimesi geçiyorsa) bu detector'a uygun değil.
  if (!exact && matches.length === 0) return null;

  const klass = fuzzyMatch(text, ctx.classes);
  const weight = inferWeight(text);

  if (!exact) {
    return {
      constraint: {
        type: 'SUBJECT_MAX_HOURS_DAILY',
        weight,
        active: true,
        params: { subject: null, class: klass.exact, maxHours: n },
      },
      unresolved: [`'${matches.join(', ')}' dersleri arasından hangisi belirsiz`],
    };
  }
  return {
    constraint: {
      type: 'SUBJECT_MAX_HOURS_DAILY',
      weight,
      active: true,
      params: { subject: exact, class: klass.exact, maxHours: n },
    },
  };
};

/** 4) "X dersi son derste olsun" */
const detectSubjectLastHour: Detector = (text, lower, ctx) => {
  if (!/son\s+ders/.test(lower)) return null;
  if (!/(olsun|yapilsin|yapılsın|olmali|olmalı|olacak)/.test(lower)) {
    // "son derste olmasın" yine SUBJECT_LAST_HOUR_OF_DAY değil — atla
    if (/(olmasin|olmasın|yok\b)/.test(lower)) return null;
    // Aksi takdirde "son derste olsun" var sayalım ama açık ifade yoksa zayıf eşleşme
  }

  const { exact, matches } = fuzzyMatch(text, ctx.subjects);
  const klass = fuzzyMatch(text, ctx.classes);
  const weight = inferWeight(text);

  if (!exact) {
    return {
      constraint: {
        type: 'SUBJECT_LAST_HOUR_OF_DAY',
        weight,
        active: true,
        params: { subject: null, class: klass.exact },
      },
      unresolved:
        matches.length === 0
          ? ['Belirtilen ders adı bağlamda bulunamadı']
          : [`'${matches.join(', ')}' dersleri arasından hangisi belirsiz`],
    };
  }
  return {
    constraint: {
      type: 'SUBJECT_LAST_HOUR_OF_DAY',
      weight,
      active: true,
      params: { subject: exact, class: klass.exact },
    },
  };
};

/** 3) "X dersi Y günü olmasın/yok" */
const detectSubjectNotOnDay: Detector = (text, lower, ctx) => {
  if (!/(ders|brans|branş)/.test(lower) && !findDays(text).length) return null;
  if (!/(olmasin|olmasın|yok\b|girmesin)/.test(lower)) return null;
  if (/(hoca|ogretmen|öğretmen)/.test(lower)) return null; // teacher pattern'leri
  if (/son\s+ders/.test(lower)) return null;

  const days = findDays(text);
  if (days.length === 0) return null;

  // Saat verilmişse bu CLASS_NOT_AVAILABLE değil ama yine SUBJECT_NOT_ON_DAY için saat
  // gerekli değil — saat varsa farklı pattern eşleşmiş olur.
  const { exact, matches } = fuzzyMatch(text, ctx.subjects);
  if (!exact && matches.length === 0) return null; // ders adayı yoksa muhtemelen başka pattern

  const klass = fuzzyMatch(text, ctx.classes);
  const weight = inferWeight(text);

  if (!exact) {
    return {
      constraint: {
        type: 'SUBJECT_NOT_ON_DAY',
        weight,
        active: true,
        params: { subject: null, class: klass.exact, days },
      },
      unresolved: [`'${matches.join(', ')}' dersleri arasından hangisi belirsiz`],
    };
  }
  return {
    constraint: {
      type: 'SUBJECT_NOT_ON_DAY',
      weight,
      active: true,
      params: { subject: exact, class: klass.exact, days },
    },
  };
};

/** 5) "X sınıfı Y günü Z. derste yok" */
const detectClassNotAvailable: Detector = (text, lower, ctx) => {
  if (!/(sinif|sınıf)/.test(lower)) return null;
  if (!/(olmasin|olmasın|yok\b|kapali|kapalı|musait\s+degil|müsait\s+değil)/.test(lower)) return null;

  const days = findDays(text);
  const hours = findHours(text);
  if (days.length === 0) return null;

  const { exact, matches } = fuzzyMatch(text, ctx.classes);
  const weight = inferWeight(text);
  const slots = hours.length > 0
    ? buildSlots(days, hours)
    : days.flatMap((d) => buildFullDaySlots(d, ctx.hoursPerDay));

  if (!exact) {
    return {
      constraint: {
        type: 'CLASS_NOT_AVAILABLE',
        weight,
        active: true,
        params: { class: null, slots },
      },
      unresolved:
        matches.length === 0
          ? ['Belirtilen sınıf bağlamda bulunamadı']
          : [`'${matches.join(', ')}' sınıfları arasından hangisi belirsiz`],
    };
  }
  return {
    constraint: {
      type: 'CLASS_NOT_AVAILABLE',
      weight,
      active: true,
      params: { class: exact, slots },
    },
  };
};

/** 8) "X derliği Y günü kapalı" */
const detectRoomNotAvailable: Detector = (text, lower, ctx) => {
  if (!/(derslik|derligi|derliği|oda|lab|salon)/.test(lower)) return null;
  if (!/(kapali|kapalı|olmasin|olmasın|yok\b|musait\s+degil|müsait\s+değil)/.test(lower)) return null;

  const days = findDays(text);
  if (days.length === 0) return null;

  const hours = findHours(text);
  const { exact, matches } = fuzzyMatch(text, ctx.rooms);
  const weight = inferWeight(text);

  const slots = hours.length > 0
    ? buildSlots(days, hours)
    : days.flatMap((d) => buildFullDaySlots(d, ctx.hoursPerDay));

  if (!exact) {
    return {
      constraint: {
        type: 'ROOM_NOT_AVAILABLE',
        weight,
        active: true,
        params: { room: null, slots },
      },
      unresolved:
        matches.length === 0
          ? ['Belirtilen derslik bağlamda bulunamadı']
          : [`'${matches.join(', ')}' derslikleri arasından hangisi belirsiz`],
    };
  }
  return {
    constraint: {
      type: 'ROOM_NOT_AVAILABLE',
      weight,
      active: true,
      params: { room: exact, slots },
    },
  };
};

/**
 * Detector sırası önemli — daha spesifik olanlar (saat verilmiş teacher) önce gelmeli.
 */
const detectors: Detector[] = [
  detectTeacherNotAvailableHours,
  detectTeacherMaxHoursDaily,
  detectTeacherNotAvailableFullDay,
  detectSubjectMaxHoursDaily,
  detectSubjectLastHour,
  detectClassNotAvailable,
  detectRoomNotAvailable,
  detectSubjectNotOnDay,
];

function failResponse(): AIResponse {
  return {
    kind: 'constraint',
    constraints: [],
    confidence: 0.2,
    explanation:
      "Talebinizi anlayamadım. Şu formatta deneyin: 'Ahmet hoca cuma 2. derste olmasın' veya 'Ahmet hangi derslere giriyor?'",
    warnings: [],
    unresolved: [],
  };
}

/**
 * mockParse — text + context (+ optional history) alıp deterministik bir AIResponse üretir.
 *
 * Önce data_mutation / schedule_update / wizard guide / query pattern'lerini dener
 * (agentic mode); eşleşme olmazsa eski constraint detector zincirine düşer.
 * Pattern bulunmazsa düşük güvenli "anlayamadım" döner.
 *
 * `history`: önceki kullanıcı/asistan mesajları — multi-turn context için.
 * Mock şu an history'i kullanmıyor (deterministik pattern bazlı çalışır), ama
 * imza gerçek LLM client'la uyumlu kalsın diye burada.
 */
export type MockHistoryEntry = {
  role: 'user' | 'assistant' | 'system';
  text: string;
};

export function mockParse(
  text: string,
  context: AIContext,
  history: MockHistoryEntry[] | unknown[] = [],
): Promise<AIResponse> {
  return Promise.resolve(
    mockParseSync(text, context, history as MockHistoryEntry[]),
  );
}

export function mockParseSync(
  text: string,
  context: AIContext,
  history: MockHistoryEntry[] = [],
): AIResponse {
  if (!text || !text.trim()) return failResponse();

  const lower = text.toLocaleLowerCase('tr');
  const lowerDeburr = deburr(lower);

  // 0) Conversational wizard — kullanıcı yardım/devam istiyorsa context'e göre
  //    TEK ADIM (1 soru, 1 örnek) ile yanıt ver. History'i de hesaba katar.
  const conv = detectConversationalWizard(lowerDeburr, context, history);
  if (conv) return conv;

  // 0.4) "Kısıtlamayı gevşet" / "çözüm önerisi" — generate başarısız olduğunda
  //      veya kullanıcı manuel istediğinde, ağırlığı yüksek kısıtlamaları
  //      düşürmeyi öneren data_mutation döndürür.
  const relax = detectRelaxRequest(lowerDeburr, context);
  if (relax) return relax;

  // 0.45) "Programı üret" / "şimdi başlat" / "150 saniyede üret" — AI doğrudan
  //       FET'i tetikleyebilir. run_solver kindi döner, kullanıcı onay kartından
  //       "Üretimi başlat" basınca generate IPC çalışır.
  const runSolver = detectRunSolverRequest(text, lowerDeburr, context);
  if (runSolver) return runSolver;

  // 0.46) "9. sınıfların müzik derslerini X salonunda yap" — class-filtreli
  //       subject-room. SUBJECT_PREFERRED_ROOM global olduğu için bu tip
  //       filtreli istekler ACTIVITY_PREFERRED_ROOM olarak per-aktivite
  //       eklenmeli. data_mutation ile add_activity_constraint çağırılır.
  const perClass = detectPerClassSubjectRoom(text, lowerDeburr, context);
  if (perClass) return perClass;

  // 0.47) Split activity — "X sınıfı sanat saatinde 2 gruba bölünür"
  const split = detectSplitActivity(text, lowerDeburr, context);
  if (split) return split;

  // 0.48) Slot editing — "9A salı 3. ders fizik olsun"
  const slot = detectSetTimetableSlot(text, lowerDeburr, context);
  if (slot) return slot;

  // 0.49) Substitute teacher — "Ahmet hocanın 9A fiziğini Cem'e ver"
  const sub = detectSubstituteTeacher(text, lowerDeburr, context);
  if (sub) return sub;

  // 0.50) Merge activities — "9A ve 9B beraber müzik dinleyecek"
  const merge = detectMergeActivities(text, lowerDeburr, context);
  if (merge) return merge;

  // 0.51) Export — "9A programını PDF olarak indir"
  const exp = detectExport(text, lowerDeburr, context);
  if (exp) return exp;

  // 0.52) Slot swap — "9A salı 3 ile cuma 5 yer değiştirsin"
  const swap = detectSwapSlots(text, lowerDeburr, context);
  if (swap) return swap;

  // 0.53) Pair consecutive — "Fizik ve Matematik peş peşe olsun"
  const pair = detectPairConsecutive(text, lowerDeburr, context);
  if (pair) return pair;

  // 0.54) Navigate — "Öğretmenler sayfasına geç"
  const nav = detectNavigate(text, lowerDeburr);
  if (nav) return nav;

  // 0.5) Belirsiz kısa istek ("Öğretmen ekle", "Sil", "Ders ekle") — netleştir.
  //      Data_mutation'dan önce çalışmalı, aksi takdirde "Öğretmen" adında
  //      bir öğretmen yaratmaya çalışır (extractPersonName "Öğretmen"i ad sayar).
  const clarifyEarly = detectAmbiguousIntent(lowerDeburr, context);
  if (clarifyEarly) return clarifyEarly;

  // 2) Genel sorgu — "tüm öğretmenleri listele", "kaç dersliğim var", "özet"
  const summary = detectSummaryOrListQuery(lowerDeburr, context, text);
  if (summary) return summary;

  // 3) Data mutation — CRUD intent
  const dm = detectDataMutation(text, lower, lowerDeburr, context);
  if (dm) return dm;

  // 4) Schedule update — "teneffüsleri uzat", "cuma 1 saat ekle"
  const su = detectScheduleUpdate(text, lower, lowerDeburr, context);
  if (su) return su;

  // 5) Query pattern'leri — mock kısayol: tool'u çağır, query döndür
  const q = detectQuery(text, lower, lowerDeburr, context);
  if (q) return q;

  // 6) Eski constraint detector zinciri
  for (const detect of detectors) {
    const hit = detect(text, lower, context);
    if (hit) {
      const c = hit.constraint;
      const unresolved = hit.unresolved ?? [];
      const warnings = hit.warnings ?? [];
      const confidence = unresolved.length > 0 ? 0.5 : 0.9;
      return {
        kind: 'constraint',
        constraints: unresolved.length > 0 ? [] : [c],
        confidence,
        explanation: buildExplanation(c, unresolved),
        warnings,
        unresolved,
      };
    }
  }

  // 7) Ek constraint detector'ları (sabah saatleri, son saat global, blok,
  //    no-gaps, teacher-max-days, vb. — extendedDetectors).
  for (const detect of extendedDetectors) {
    const hit = detect(text, lower, context);
    if (hit) {
      const c = hit.constraint;
      const unresolved = hit.unresolved ?? [];
      const warnings = hit.warnings ?? [];
      const confidence = unresolved.length > 0 ? 0.5 : 0.9;
      return {
        kind: 'constraint',
        constraints: unresolved.length > 0 ? [] : [c],
        confidence,
        explanation: buildExplanation(c, unresolved),
        warnings,
        unresolved,
      };
    }
  }

  // 8) Belirsiz/eksik intent — kullanıcıya netleştirici soru sor (query)
  const clarify = detectAmbiguousIntent(lowerDeburr, context);
  if (clarify) return clarify;

  return failResponse();
}

/**
 * Conversational wizard — slop liste yerine ADIM ADIM konuşma.
 *
 * Tetikleyiciler:
 *   - "yardım", "başla", "nereden başlayalım", "ders programı yapalım"
 *   - "devam", "sonraki adım", "tamam sonra ne", "şimdi ne"
 *   - "bitti", "ekledim", "tamamladım"  (kullanıcı bir adımı bitirdiğinde)
 *
 * Context-aware sıra (boş → soru):
 *   1. subjects boş    → "Hangi dersler okutuluyor?"
 *   2. classes boş     → "Hangi sınıflarınız var?"
 *   3. rooms boş       → "Hangi dersliklerınız var?"
 *   4. teachers boş    → "Öğretmenler ve branşları?"
 *   5. activities yok  → "Ders dağıtımı: hangi sınıfa hangi ders kaç saat?"
 *   6. hepsi tamam     → "Kısıtlama var mı? Yoksa 'Programı Üret' diyebilirsiniz."
 *
 * History-aware: son asistan turunda hangi adımı sorduysak, kullanıcının
 * cevabına "süper, X eklendi" şeklinde acknowledge ekler.
 *
 * Yanıt KISA + TEK ADIM (1 soru, 1 örnek).
 */
function detectConversationalWizard(
  lowerDeburr: string,
  ctx: AIContext,
  history: MockHistoryEntry[],
): AIResponse | null {
  const firstContact = [
    'ders programi olustur',
    'ders programi yapal',
    'nereden basla',
    'nereden baslayal',
    'nasil baslayal',
    'yardim et',
    'yardim',
    'rehberlik et',
    'adim adim',
    'sirayla anlat',
    'baslangic',
    'yeni okul',
    'sifirdan',
    'birlikte yapal',
    'beraber yapal',
    'baslayal',
  ];
  const continuation = [
    'devam edelim',
    'devam',
    'sonraki adim',
    'sonraki',
    'simdi ne',
    'simdi ne yapal',
    'sonra ne',
    'tamam sonra ne',
    'tamam',
    'peki',
    'evet devam',
    'sirada ne',
    'baska ne',
    'ekledim',
    'tamamladim',
    'bitti',
    'oldu',
  ];

  const isFirst = firstContact.some((t) => lowerDeburr.includes(t));
  const isCont = continuation.some(
    (t) => lowerDeburr === t || lowerDeburr.startsWith(t + ' ') || lowerDeburr.endsWith(' ' + t) || lowerDeburr.includes(' ' + t + ' '),
  );
  if (!isFirst && !isCont) return null;

  // History'den önceki adımı anla — son assistant mesajında hangi alanı sorduk?
  const lastAssistant = [...history].reverse().find((h) => h.role === 'assistant');
  const ack = buildWizardAck(lastAssistant?.text ?? '', ctx);
  const step = buildWizardNextStep(ctx);

  const answer = ack ? `${ack} ${step}` : step;
  return {
    kind: 'query',
    answer,
    confidence: 0.9,
  };
}

/**
 * Context'e bakarak SONRAKİ tek adımı soran kısa metni kurar.
 * Hiç boş alan yoksa "Kısıtlama söyleyin ya da Programı Üret" der.
 */
function buildWizardNextStep(ctx: AIContext): string {
  if (ctx.subjects.length === 0) {
    return 'İlk olarak: okulunuzda hangi dersler okutuluyor? (Örnek: Matematik, Fizik, Türkçe, Tarih)';
  }
  if (ctx.classes.length === 0) {
    return 'Şimdi sınıflarınızı söyle (örn: 9A, 9B, 10F). Virgülle ayırabilirsin.';
  }
  if (ctx.rooms.length === 0) {
    return 'Hangi derslikleriniz var? (Örnek: 101, 102, Lab1, Salon)';
  }
  if (ctx.teachers.length === 0) {
    return 'Öğretmenleri ekleyelim. Adlarını ve verdikleri dersi söyle. (Örnek: "Ahmet Yılmaz, Matematik öğretmeni ekle")';
  }
  // Son adım: ders dağıtımı / kısıtlamalar
  return (
    'Şimdi ders dağıtımını yapalım: her sınıf hangi dersten kaç saat görecek? ' +
    '(Örnek: "9A sınıfına 5 saat Matematik ekle"). ' +
    'Veya kısıtlama söyleyebilirsin (örn. "Ahmet hoca Cuma yok"), ya da hazırsan "Programı Üret" diyebilirsin.'
  );
}

/**
 * Son asistan mesajının içeriğine göre kısa bir "süper" / "harika" acknowledgement
 * üretir. Eğer önceki turda "hangi dersler" sorduysak ve şimdi ctx.subjects dolu
 * görünüyorsa: "Süper, N ders eklendi: ...". Aksi takdirde boş string döner.
 */
function buildWizardAck(prevAssistantText: string, ctx: AIContext): string {
  if (!prevAssistantText) return '';
  // prev içerikten JSON parse edebiliyorsak answer içine bakalım
  let prevAnswer = prevAssistantText;
  try {
    const parsed = JSON.parse(prevAssistantText) as { answer?: string };
    if (parsed.answer) prevAnswer = parsed.answer;
  } catch {
    // text düz string olabilir — sorun yok
  }
  const p = deburr(prevAnswer);

  if (/hangi\s+dersler/.test(p) && ctx.subjects.length > 0) {
    return `Süper, ${ctx.subjects.length} ders eklendi (${ctx.subjects.slice(0, 4).join(', ')}${ctx.subjects.length > 4 ? '…' : ''}).`;
  }
  if (/hangi\s+sinif/.test(p) && ctx.classes.length > 0) {
    return `Harika, ${ctx.classes.length} sınıf hazır (${ctx.classes.slice(0, 4).join(', ')}${ctx.classes.length > 4 ? '…' : ''}).`;
  }
  if (/hangi\s+derslik/.test(p) && ctx.rooms.length > 0) {
    return `Tamam, ${ctx.rooms.length} derslik kayıtlı.`;
  }
  if (/(ogretmen|hoca)/.test(p) && ctx.teachers.length > 0) {
    return `Güzel, ${ctx.teachers.length} öğretmen ekli.`;
  }
  return '';
}

/**
 * Liste/özet sorularını yakala — "tüm öğretmenler", "kaç sınıfım var", "özet ver",
 * "sınıflar nasıl", "kaç derslik var", "şu anda durum ne".
 *
 * Gerçek LLM bu noktada context-builder DB'den çektiği listelerden cevap üretir;
 * mock tarafı doğrudan AIContext'ten çeker.
 */
function detectSummaryOrListQuery(
  lowerDeburr: string,
  ctx: AIContext,
  text?: string,
): AIResponse | null {
  // ÖNCELİK: "hangi sınıfların [DERS] dersi var" → tool_call (subject teachers)
  if (
    text &&
    /(hangi\s+sinif|hangi\s+sınıf)/.test(lowerDeburr) &&
    /(ders|brans|branş)/.test(lowerDeburr)
  ) {
    const subj = fuzzyMatch(text, ctx.subjects);
    if (subj.exact) {
      return {
        kind: 'tool_call',
        tool: 'getSubjectTeachers',
        args: { subject: subj.exact },
        reasoning: `Hangi sınıfların "${subj.exact}" dersi olduğunu öğreniyorum`,
      };
    }
  }

  // "tüm öğretmenleri listele" / "öğretmenler kimler"
  if (
    /\b(tum|tüm)?\s*(ogretmenler|öğretmenler|hocalar)/.test(lowerDeburr) &&
    /(listele|kimler|hangileri|neler|nelerdir|var)/.test(lowerDeburr)
  ) {
    return {
      kind: 'query',
      answer:
        ctx.teachers.length === 0
          ? 'Henüz hiç öğretmen tanımlı değil.'
          : `Toplam ${ctx.teachers.length} öğretmen var: ${ctx.teachers.join(', ')}.`,
      data: ctx.teachers.map((name) => ({ name })),
      confidence: 0.95,
    };
  }
  // "sınıflar nasıl" / "tüm sınıfları listele"
  if (
    /\b(siniflar|sınıflar)/.test(lowerDeburr) &&
    /(nasil|nasıl|listele|hangileri|neler|var)/.test(lowerDeburr)
  ) {
    return {
      kind: 'query',
      answer:
        ctx.classes.length === 0
          ? 'Henüz hiç sınıf tanımlı değil.'
          : `Toplam ${ctx.classes.length} sınıf var: ${ctx.classes.join(', ')}.`,
      data: ctx.classes.map((name) => ({ name })),
      confidence: 0.95,
    };
  }
  // "kaç X var" / "kaç X tanımlı" — derslik / sınıf / öğretmen / branş / gün
  // Not: lowerDeburr'de ğ→g olduğu için "dersliğim" → "dersligim" olur;
  // "derslig" kökü ile yakalanır.
  if (/\b(kac|kaç)\b/.test(lowerDeburr)) {
    if (/(derslik|derslig|oda)/.test(lowerDeburr)) {
      return {
        kind: 'query',
        answer: `Şu anda ${ctx.rooms.length} derslik tanımlı${ctx.rooms.length > 0 ? `: ${ctx.rooms.join(', ')}` : ''}.`,
        confidence: 0.95,
      };
    }
    if (/(sinif|sınıf)/.test(lowerDeburr)) {
      return {
        kind: 'query',
        answer: `Şu anda ${ctx.classes.length} sınıf tanımlı${ctx.classes.length > 0 ? `: ${ctx.classes.join(', ')}` : ''}.`,
        confidence: 0.95,
      };
    }
    if (/(hoca|ogretmen|öğretmen)/.test(lowerDeburr)) {
      return {
        kind: 'query',
        answer: `Şu anda ${ctx.teachers.length} öğretmen tanımlı${ctx.teachers.length > 0 ? `: ${ctx.teachers.join(', ')}` : ''}.`,
        confidence: 0.95,
      };
    }
    if (/(brans|branş)/.test(lowerDeburr)) {
      return {
        kind: 'query',
        answer: `Şu anda ${ctx.subjects.length} branş tanımlı${ctx.subjects.length > 0 ? `: ${ctx.subjects.join(', ')}` : ''}.`,
        confidence: 0.95,
      };
    }
  }
  if (
    /(\bozet\b|özet|durum\s+ne|durumu\s+ne|rapor|kisa\s+bilgi|kısa\s+bilgi|toplu\s+bak|\bdurum\b|\btoplam\b)/.test(
      lowerDeburr,
    )
  ) {
    return {
      kind: 'query',
      answer: [
        'Mevcut durum özeti:',
        `• Branşlar: ${ctx.subjects.length} (${ctx.subjects.slice(0, 5).join(', ') || '-'}${ctx.subjects.length > 5 ? '…' : ''})`,
        `• Öğretmenler: ${ctx.teachers.length}`,
        `• Sınıflar: ${ctx.classes.length}`,
        `• Derslikler: ${ctx.rooms.length}`,
        `• Günler: ${ctx.days.length} (${ctx.days.join(', ')})`,
        `• Günlük ders saati: ${ctx.hoursPerDay}`,
      ].join('\n'),
      confidence: 0.95,
    };
  }
  return null;
}

/**
 * Belirsiz intent yakalandığında kullanıcıya netleştirici soru sor.
 *  - "öğretmen ekle" → ad iste
 *  - "sil" → hedef iste
 *  - "ders ekle" → sınıf+saat iste
 *  - "sınıf ekle" → ad iste
 *  - "derslik ekle" → ad+kapasite iste
 */
function detectAmbiguousIntent(
  lowerDeburr: string,
  _ctx: AIContext,
): AIResponse | null {
  const trimmed = lowerDeburr.trim();
  if (
    /^(ogretmen|öğretmen|hoca)\s+ekle\.?$/.test(trimmed) ||
    /^yeni\s+(ogretmen|öğretmen|hoca)\.?$/.test(trimmed)
  ) {
    return {
      kind: 'query',
      answer:
        'Hangi öğretmeni eklemek istersiniz? Lütfen adını ve (varsa) branşını belirtin. Örnek: "Ahmet Yılmaz adında Matematik öğretmeni ekle".',
      confidence: 0.7,
    };
  }
  if (/^(sil|kaldir|kaldır|cikar|çıkar)\.?$/.test(trimmed)) {
    return {
      kind: 'query',
      answer:
        'Neyi silmek istediğinizi belirtin: bir öğretmen mi, sınıf mı, derslik mi, branş mı, gün mü? Örnek: "Ahmet Yılmaz öğretmenini sil".',
      confidence: 0.6,
    };
  }
  if (
    /^(ders|brans|branş)\s+ekle\.?$/.test(trimmed) ||
    /^yeni\s+ders\.?$/.test(trimmed)
  ) {
    return {
      kind: 'query',
      answer:
        'Hangi sınıfa, hangi dersi, kaç saat eklemek istersiniz? Örnek: "9A sınıfına 4 saat Matematik ekle".',
      confidence: 0.7,
    };
  }
  if (
    /^(sinif|sınıf|şube|sube)\s+ekle\.?$/.test(trimmed) ||
    /^yeni\s+(sinif|sınıf)\.?$/.test(trimmed)
  ) {
    return {
      kind: 'query',
      answer:
        'Hangi sınıfı eklemek istersiniz? Örnek: "10F sınıfını ekle" veya "9A, 9B, 9C sınıflarını ekle".',
      confidence: 0.7,
    };
  }
  if (
    /^(derslik|oda|salon|lab)\s+ekle\.?$/.test(trimmed) ||
    /^yeni\s+(derslik|oda)\.?$/.test(trimmed)
  ) {
    return {
      kind: 'query',
      answer:
        'Hangi dersliği eklemek istersiniz? Adını ve (varsa) kapasitesini belirtin. Örnek: "Lab1 dersliği ekle, kapasite 25".',
      confidence: 0.7,
    };
  }
  return null;
}

// --- Query / schedule_update detectors -------------------------------------

/**
 * Mock için query pattern'leri:
 *   - "X hoca hangi derslere", "X hocanın dersleri"  → getTeacherActivities
 *   - "X hangi sınıflara giriyor"                    → getTeacherActivities (sınıflar)
 *   - "[branş] kim veriyor", "[branş] hocası"        → getSubjectTeachers
 *   - "[sınıf] hangi dersler", "[sınıf] programı"    → getClassActivities
 *   - "kaç kısıtlama", "kısıtlamalar"                → countConstraints
 *   - "saat kaç", "program ayarları", "günde ders"   → getScheduleSettings
 *   - "kaç saat", "toplam saati"                     → getTeacherActivities (totalHours)
 */
function detectQuery(
  text: string,
  lower: string,
  lowerDeburr: string,
  ctx: AIContext,
): AIResponse | null {
  const isQuestion =
    text.trim().endsWith('?') ||
    /\b(hangi|kim|kac|kaç|neyi|nedir|ne\s+kadar|ne\s+zaman|nasil|nasıl)\b/.test(lowerDeburr);

  // Kısıtlama sayısı
  if (
    /(kac|kaç)\s+kisitlama|kac\s+kisit/.test(lowerDeburr) ||
    /(kisitlamalar|kısıtlamalar)\s+(neler|listesi|kac)/.test(lowerDeburr) ||
    /(aktif\s+kisitlama|aktif\s+kısıtlama)/.test(lowerDeburr)
  ) {
    const tool = executeTool('countConstraints', {});
    return toQueryResponse(
      tool,
      (r) => {
        const data = r as {
          count: number;
          active: number;
          inactive: number;
          byType: Record<string, number>;
          bySource: Record<string, number>;
        };
        const typeStr = Object.entries(data.byType)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        return `Toplam ${data.count} kısıtlama var (${data.active} aktif, ${data.inactive} pasif). Kaynak: AI ${data.bySource['ai'] ?? 0}, manuel ${data.bySource['manual'] ?? 0}.${typeStr ? ' Tip dağılımı — ' + typeStr + '.' : ''}`;
      },
      'tool_call:countConstraints',
    );
  }

  // Program ayarları
  if (
    /(program\s+ayar|saat\s+kac|saat\s+kaç|gunde\s+(kac|kaç)\s+ders|kac\s+gun|kaç\s+gün|haftada\s+(kac|kaç)\s+gun|teneffus)/.test(
      lowerDeburr,
    )
  ) {
    const tool = executeTool('getScheduleSettings', {});
    return toQueryResponse(
      tool,
      (r) => {
        const data = r as {
          daysCount: number;
          hoursPerDay: number;
          days: string[];
          hours: { name: string }[];
        };
        return `Programınızda ${data.daysCount} gün (${data.days.join(', ')}) ve günde ${data.hoursPerDay} ders saati var.`;
      },
      'tool_call:getScheduleSettings',
    );
  }

  // Aktif kısıtlama listesi
  if (/(kisitlama|kısıtlama).*(liste|neler|var)/.test(lowerDeburr) && isQuestion) {
    const tool = executeTool('listActiveConstraints', {});
    return toQueryResponse(
      tool,
      (r) => {
        const data = r as { count: number; constraints: { type: string }[] };
        const types = Array.from(new Set(data.constraints.map((c) => c.type)));
        return `Şu an ${data.count} aktif kısıtlama var. Tipler: ${types.join(', ') || '-'}.`;
      },
      'tool_call:listActiveConstraints',
    );
  }

  // Sınıf programı — "[sınıf] hangi dersler", "[sınıf] programı"
  const klassMatch = fuzzyMatch(text, ctx.classes);
  if (
    klassMatch.exact &&
    (/(hangi\s+ders|hangi\s+brans|hangi\s+branş|ne\s+ders|programi|programı|dersler[ıi])/.test(
      lowerDeburr,
    ) ||
      /(sinif|sınıf).*(dersleri|programi|programı)/.test(lowerDeburr))
  ) {
    const tool = executeTool('getClassActivities', { class: klassMatch.exact });
    return toQueryResponse(
      tool,
      (r) => {
        const data = r as {
          class: string;
          activities: { subject: string; teacher: string | null; weeklyHours: number }[];
          totalHours: number;
        };
        if (data.activities.length === 0) {
          return `${data.class} sınıfı için tanımlı ders bulunamadı.`;
        }
        const list = data.activities
          .map(
            (a) =>
              `${a.subject} (${a.weeklyHours} saat${a.teacher ? ', ' + a.teacher : ''})`,
          )
          .join(', ');
        return `${data.class} sınıfının dersleri: ${list}. Toplam ${data.totalHours} saat/hafta.`;
      },
      'tool_call:getClassActivities',
      (r) =>
        (r as {
          activities: { subject: string; teacher: string | null; weeklyHours: number }[];
        }).activities,
    );
  }

  // Branşı veren öğretmenler — "X kim veriyor", "X hocası kim"
  const subjMatch = fuzzyMatch(text, ctx.subjects);
  if (
    subjMatch.exact &&
    (/(kim\s+veriyor|kim\s+veriyo|hocasi|hocası|kim\s+girer|kim\s+girigor|kim\s+giriyor|hocalar[ıi]|kim)/.test(
      lowerDeburr,
    )) &&
    !/(hoca\s+(hangi|kac|kaç))/.test(lowerDeburr)
  ) {
    const tool = executeTool('getSubjectTeachers', { subject: subjMatch.exact });
    return toQueryResponse(
      tool,
      (r) => {
        const data = r as { subject: string; teachers: string[]; count: number };
        if (data.count === 0) return `${data.subject} dersini veren öğretmen bulunamadı.`;
        return `${data.subject} dersini veren ${data.count} öğretmen: ${data.teachers.join(', ')}.`;
      },
      'tool_call:getSubjectTeachers',
      (r) => (r as { teachers: string[] }).teachers,
    );
  }

  // Öğretmen aktiviteleri — "X hoca hangi dersler", "X kaç saat", "X hocanın dersleri"
  const teacherMatch = fuzzyMatch(text, ctx.teachers);
  if (
    teacherMatch.exact &&
    (/(hangi\s+ders|hangi\s+brans|hangi\s+branş|hangi\s+sinif|hangi\s+sınıf|kac\s+saat|kaç\s+saat|ne\s+ders|toplam\s+saat|dersleri|hocanin\s+dersleri|hocanın\s+dersleri|gir(iy|iyo)or|hangi)/.test(
      lowerDeburr,
    ))
  ) {
    const tool = executeTool('getTeacherActivities', { teacher: teacherMatch.exact });
    return toQueryResponse(
      tool,
      (r) => {
        const data = r as {
          teacher: string;
          activities: { class: string; subject: string; weeklyHours: number }[];
          totalHours: number;
        };
        if (data.activities.length === 0) {
          return `${data.teacher} öğretmeni için tanımlı ders bulunamadı.`;
        }
        const list = data.activities
          .map((a) => `${a.class} ${a.subject} (${a.weeklyHours} saat)`)
          .join(', ');
        return `${data.teacher} şu derslere giriyor: ${list}. Toplam ${data.totalHours} saat/hafta.`;
      },
      'tool_call:getTeacherActivities',
      (r) =>
        (r as {
          activities: { class: string; subject: string; weeklyHours: number }[];
        }).activities,
    );
  }

  // Birden çok öğretmen aday — fuzzy ambig
  if (
    teacherMatch.matches.length > 1 &&
    /(hangi|kac|kaç|ne)/.test(lowerDeburr)
  ) {
    return {
      kind: 'query',
      answer: `Birden fazla öğretmen aday görünüyor: ${teacherMatch.matches.join(', ')}. Lütfen tam adı belirtin.`,
      confidence: 0.5,
    };
  }

  return null;
}

/** Mock için tool sonucunu query response'a çevirir. */
function toQueryResponse(
  tool: ToolResult,
  formatAnswer: (result: unknown) => string,
  _tag: string,
  extractData?: (result: unknown) => unknown[] | undefined,
): AIResponse {
  if ('error' in tool) {
    return {
      kind: 'query',
      answer: `Soruyu cevaplayamadım: ${tool.error}`,
      confidence: 0.4,
    };
  }
  const data = extractData ? extractData(tool.result) : undefined;
  return {
    kind: 'query',
    answer: formatAnswer(tool.result),
    data,
    confidence: 0.9,
  };
}

/**
 * Schedule update detector:
 *   - "teneffüsleri 20 dk uzat" → action='extend_breaks'
 *   - "Cuma'ya 1 saat ekle"     → action='add_hour_to_day'
 *   - "günde 9 saat olsun"      → action='set_hours_per_day'
 *   - "[gun] kaldir/cikar"      → action='remove_day'
 */
function detectScheduleUpdate(
  text: string,
  lower: string,
  lowerDeburr: string,
  ctx: AIContext,
): AIResponse | null {
  // "teneffüs/teneffus ... uzat" — break extension
  if (/(teneffus|teneffüs).*(uzat|artir|artır|ekle)/.test(lowerDeburr)) {
    const minutes = findCount(text) ?? 5;
    return {
      kind: 'schedule_update',
      action: 'extend_breaks',
      params: { minutes },
      explanation: `Teneffüs sürelerini ${minutes} dakika uzatma önerisi. Uygulamak için onaylayın.`,
      confidence: 0.85,
    };
  }

  // "[gun] ... saat ekle" / "[gun]'a saat ekle"
  const days = findDays(text);
  if (days.length > 0 && /(saat|ders).*(ekle|ilave)/.test(lowerDeburr)) {
    const count = findCount(text) ?? 1;
    return {
      kind: 'schedule_update',
      action: 'add_hours_to_day',
      params: { day: days[0], count },
      explanation: `${days[0]} gününe ${count} ders saati ekleme önerisi. Uygulamak için onaylayın.`,
      confidence: 0.8,
    };
  }

  // "günde N saat" — hours per day set
  // Branş/öğretmen kelimesi varsa bu schedule değil, constraint amaçlı.
  // Bu yüzden burada subject/teacher token'ları varsa atla — constraint
  // detector'ları (SUBJECT_MAX_HOURS_DAILY vb.) yakalayacak.
  if (/(gunde|günde).*(\d+).*(saat|ders).*(olsun|yap|olmali|olmalı)/.test(lowerDeburr)) {
    const hasSubjectMention = fuzzyMatch(text, ctx.subjects).matches.length > 0;
    const hasTeacherMention = fuzzyMatch(text, ctx.teachers).matches.length > 0;
    const hasClassMention = fuzzyMatch(text, ctx.classes).matches.length > 0;
    if (!hasSubjectMention && !hasTeacherMention && !hasClassMention) {
      const n = findCount(text);
      if (n !== null) {
        return {
          kind: 'schedule_update',
          action: 'set_hours_per_day',
          params: { hoursPerDay: n },
          explanation: `Günde ders saati sayısı ${n} olarak ayarlanacak. Uygulamak için onaylayın.`,
          confidence: 0.8,
        };
      }
    }
  }

  // "[gun] kaldir / cikar / iptal"
  if (days.length > 0 && /(kaldir|kaldır|cikar|çıkar|iptal|kaldirilsin|kaldırılsın)/.test(lowerDeburr)) {
    return {
      kind: 'schedule_update',
      action: 'remove_day',
      params: { day: days[0] },
      explanation: `${days[0]} günü programdan kaldırılacak. Uygulamak için onaylayın.`,
      confidence: 0.75,
    };
  }

  // "[gun] ekle" — add day
  if (days.length > 0 && /(ekle|ilave)/.test(lowerDeburr) && !ctx.days.includes(days[0]!)) {
    return {
      kind: 'schedule_update',
      action: 'add_day',
      params: { day: days[0] },
      explanation: `${days[0]} günü programa eklenecek. Uygulamak için onaylayın.`,
      confidence: 0.75,
    };
  }

  return null;
}

// --- Data mutation detectors -----------------------------------------------

/**
 * "Ahmet hocayı ekle", "10F sınıfını ekle", "Lab1 dersliği kapasite 25"...
 * Tek mesajdan çoklu action çıkartır:
 *  - "Ahmet hocaya 10F'ye 2 saat sanat dersi ekle" → 3 action (subject + link + activity)
 *  - "Mehmet hocayı sil" → 1 action (delete_teacher, destructive)
 *
 * Bu detector pattern-bazlı; gerçek LLM çok daha esnek olur. Test/dev için yeterli.
 */
function detectDataMutation(
  text: string,
  lower: string,
  lowerDeburr: string,
  ctx: AIContext,
): AIResponse | null {
  // 0) ÇOKLU silme: "Ahmet ve Ayşe öğretmenlerini sil"
  if (
    /(hoca|ogretmen|öğretmen)/.test(lower) &&
    /\b(sil|kaldir|kaldır)\b/.test(lowerDeburr) &&
    /\s+ve\s+/.test(lowerDeburr) &&
    !/(ekle|ilave|olustur|oluştur)/.test(lowerDeburr)
  ) {
    const teacherHits = fuzzyMatchMany(text, ctx.teachers);
    if (teacherHits.length >= 2) {
      const actions: DataMutationAction[] = teacherHits.map((name) => ({
        op: 'delete_teacher' as const,
        params: { name },
        description: `${name} öğretmenini sil`,
      }));
      return buildMutation(
        actions,
        `${teacherHits.length} öğretmeni (${teacherHits.join(', ')}) ve atandıkları tüm dersleri silmek üzeresiniz. Bu işlem geri alınamaz. Onaylıyor musunuz?`,
      );
    }
  }

  // 0b) "Lab1 dersliğini 102 olarak değiştir/yeniden adlandır" — update_room
  // Önce update_X pattern'lerini yakalamamız lazım (sil/ekle'den önce).
  if (
    /(derslik|oda|lab|salon)/.test(lower) &&
    /(yeniden\s+adlandir|yeniden\s+adlandır|olarak\s+degistir|olarak\s+değiştir|adini\s+degistir|adını\s+değiştir|olarak\s+yap)/.test(
      lowerDeburr,
    )
  ) {
    const rm = fuzzyMatch(text, ctx.rooms);
    if (rm.exact) {
      const newName = extractRenameTarget(text, rm.exact);
      if (newName) {
        return buildMutation(
          [
            {
              op: 'update_room',
              params: { name: rm.exact, newName },
              description: `"${rm.exact}" dersliğini "${newName}" olarak yeniden adlandır`,
            },
          ],
          `"${rm.exact}" dersliği "${newName}" olarak güncellenecek.`,
        );
      }
    }
  }

  // 0c) "9A'yı 9F olarak değiştir/yap" — update_class
  if (
    /(sinif|sınıf)/.test(lower) &&
    /(olarak\s+degistir|olarak\s+değiştir|olarak\s+yap|yeniden\s+adlandir|yeniden\s+adlandır|adini\s+degistir|adını\s+değiştir)/.test(
      lowerDeburr,
    )
  ) {
    const cm = fuzzyMatch(text, ctx.classes);
    if (cm.exact) {
      const newName = extractRenameTarget(text, cm.exact);
      if (newName) {
        return buildMutation(
          [
            {
              op: 'update_class',
              params: { name: cm.exact, newName },
              description: `${cm.exact} sınıfını ${newName} olarak yeniden adlandır`,
            },
          ],
          `${cm.exact} sınıfı ${newName} olarak güncellenecek.`,
        );
      }
    }
  }

  // 0d) "Ahmet hocayı Matematikten çıkar/al" — unlink_teacher_subject
  if (
    /(hoca|ogretmen|öğretmen)/.test(lower) &&
    /(cikar|çıkar|al(?:\s|$))/.test(lowerDeburr) &&
    /(dersinden|dersten|brans(?:i|ı)?ndan|branşından|yeterliliğ|yeterligi)/.test(
      lowerDeburr,
    )
  ) {
    const tm = fuzzyMatch(text, ctx.teachers);
    const sm = fuzzyMatch(text, ctx.subjects);
    if (tm.exact && sm.exact) {
      return buildMutation(
        [
          {
            op: 'unlink_teacher_subject',
            params: { teacher: tm.exact, subject: sm.exact },
            description: `${tm.exact} öğretmeninin "${sm.exact}" yeterliliğini kaldır`,
          },
        ],
        `${tm.exact} öğretmeninin "${sm.exact}" yeterliliği kaldırılacak.`,
      );
    }
  }

  // 0e) "Tüm 9. sınıflara fizik 3 saat ekle" — kademe bazlı çoklu activity
  // "Tüm 10. sınıflara matematik 5 saat ekle"
  const allYearMatch = /(tum|tüm)\s*(\d{1,2})\.?\s*(sinif|sınıf)/i.exec(text);
  if (
    allYearMatch &&
    /(\d+)\s*saat/i.test(text) &&
    /(ekle|ata|olsun|gir)/.test(lowerDeburr)
  ) {
    const yearNumber = allYearMatch[2]!;
    // Context'teki "9X" sınıflarını filtrele
    const yearClasses = ctx.classes.filter((c) =>
      new RegExp(`^${yearNumber}[A-Za-zÇĞİÖŞÜçğıöşü]`).test(c),
    );
    const hourMatch = /(\d+)\s*saat/i.exec(text);
    const subjMatch = fuzzyMatch(text, ctx.subjects);
    if (yearClasses.length > 0 && hourMatch && subjMatch.exact) {
      const hours = parseInt(hourMatch[1]!, 10);
      const actions: DataMutationAction[] = yearClasses.map((c) => ({
        op: 'add_activity' as const,
        params: {
          class: c,
          subject: subjMatch.exact,
          weeklyHours: hours,
        },
        description: `${c} sınıfına ${hours} saat "${subjMatch.exact}"`,
      }));
      return buildMutation(
        actions,
        `${yearNumber}. kademedeki ${yearClasses.length} sınıfa (${yearClasses.join(', ')}) ${hours} saat "${subjMatch.exact}" eklenecek.`,
      );
    }
  }

  // "Cumartesi günü ekle" / "Pazar gününü ekle" — add_day (öncelik: gun kelimesi)
  if (/\b(gun|gün)\b/.test(lower) && /(ekle|ilave)/.test(lowerDeburr)) {
    const days = findDays(text);
    for (const d of days) {
      if (!ctx.days.includes(d)) {
        return buildMutation(
          [
            {
              op: 'add_day',
              params: { name: d },
              description: `"${d}" gününü programa ekle`,
            },
          ],
          `"${d}" günü programa eklenecek.`,
        );
      }
    }
  }
  // "Pazartesi gününü sil", "Pazar gününü sil"
  // "gün" / "günü" / "gününü" form'larını kapsayacak şekilde gevşetildi.
  // ctx.days'de olmasa bile delete_day önerisi gönderilir — backend
  // mutation-executor "bulunamadı" hatası ile düzgün kapanır.
  if (
    /\b(gun|gün)[uü]?n?[uü]?\b/.test(lower) &&
    /\b(sil|kaldir|kaldır|cikar|çıkar)\b/.test(lowerDeburr)
  ) {
    const days = findDays(text);
    if (days.length > 0) {
      const d = days[0]!;
      return buildMutation(
        [
          {
            op: 'delete_day',
            params: { name: d },
            description: `"${d}" gününü programdan kaldır`,
          },
        ],
        `"${d}" günü programdan kaldırılacak. Bu işlem geri alınamaz.`,
      );
    }
  }

  // Destructive — "X hocasını sil", "X öğretmenini sil"
  if (
    /(hoca|ogretmen|öğretmen)/.test(lower) &&
    /\b(sil|kaldir|kaldır|cikar|çıkar)\b/.test(lowerDeburr) &&
    !/(ekle|ilave|olustur|oluştur)/.test(lowerDeburr)
  ) {
    const tm = fuzzyMatch(text, ctx.teachers);
    if (tm.exact) {
      return buildMutation(
        [
          {
            op: 'delete_teacher',
            params: { name: tm.exact },
            description: `${tm.exact} öğretmenini sil`,
          },
        ],
        `${tm.exact} öğretmenini ve atandığı tüm dersleri silmek üzeresiniz. Bu işlem geri alınamaz. Onaylıyor musunuz?`,
      );
    }
  }

  // "X dersini sil", "X branşını sil"
  if (
    /(ders|brans|branş)/.test(lower) &&
    /\b(sil|kaldir|kaldır)\b/.test(lowerDeburr) &&
    !/(hoca|ogretmen|öğretmen|derslik|sinif|sınıf)/.test(lower) &&
    !/(ekle|ilave)/.test(lowerDeburr)
  ) {
    const sm = fuzzyMatch(text, ctx.subjects);
    if (sm.exact) {
      return buildMutation(
        [
          {
            op: 'delete_subject',
            params: { name: sm.exact },
            description: `"${sm.exact}" branşını sil`,
          },
        ],
        `"${sm.exact}" branşını silmek üzeresiniz. Bu işlem geri alınamaz. Onaylıyor musunuz?`,
      );
    }
  }

  // "X dersliğini sil" / "X odasını sil"
  if (
    /(derslik|oda|salon|lab)/.test(lower) &&
    /\b(sil|kaldir|kaldır)\b/.test(lowerDeburr) &&
    !/(ekle|ilave)/.test(lowerDeburr)
  ) {
    const rm = fuzzyMatch(text, ctx.rooms);
    if (rm.exact) {
      return buildMutation(
        [
          {
            op: 'delete_room',
            params: { name: rm.exact },
            description: `"${rm.exact}" dersliğini sil`,
          },
        ],
        `"${rm.exact}" dersliğini silmek üzeresiniz. Bu işlem geri alınamaz. Onaylıyor musunuz?`,
      );
    }
  }

  // "X sınıfını sil"
  if (
    /(sinif|sınıf)/.test(lower) &&
    /\b(sil|kaldir|kaldır)\b/.test(lowerDeburr) &&
    !/(ekle|ilave)/.test(lowerDeburr)
  ) {
    const cm = fuzzyMatch(text, ctx.classes);
    if (cm.exact) {
      return buildMutation(
        [
          {
            op: 'delete_class',
            params: { name: cm.exact },
            description: `${cm.exact} sınıfını sil`,
          },
        ],
        `${cm.exact} sınıfını silmek üzeresiniz. Bu sınıfa bağlı tüm dersler de silinecektir. Onaylıyor musunuz?`,
      );
    }
  }

  // "X dersliği ekle, kapasite N" → add_room
  if (
    /(derslik|oda|salon|lab)/.test(lower) &&
    /(ekle|ilave|olustur|oluştur)/.test(lowerDeburr)
  ) {
    const name = extractQuotedOrAfter(text, /(derslik|oda|salon|lab)/i);
    if (name) {
      const capacityMatch = lower.match(/kapasite\s*[:=]?\s*(\d{1,3})/);
      const cap = capacityMatch ? parseInt(capacityMatch[1]!, 10) : 30;
      return buildMutation(
        [
          {
            op: 'add_room',
            params: { name, capacity: cap },
            description: `"${name}" dersliği ekle (kapasite ${cap})`,
          },
        ],
        `"${name}" adlı yeni derslik ${cap} kapasiteyle eklenecek.`,
      );
    }
  }

  // Çoklu: "X hocaya Y sınıfına Z saat W dersi ekle"
  // Yeni: "Matematik 6 saat 9A,9B,9C sınıflarında olsun"
  // "Matematik dersini 9A 9B 9C'ye 6 saat olarak ata"
  const mActivity =
    /(\d+)\s*saat\s+([\w\sığüşöçİĞÜŞÖÇ]+?)\s+(?:dersi|brans[ıi]|branş[ıi])/i.exec(
      text,
    ) ??
    // Alternatif: "[Ders adı] [N saat] [Sınıflar]..."
    /([\w\sığüşöçİĞÜŞÖÇ]+?)\s+(\d+)\s*saat/i.exec(text) ??
    null;
  if (
    mActivity &&
    /(ekle|ilave|atayalim|atayalım|ata|olsun|olur|yapilsin|yapılsın|gir)/.test(
      lowerDeburr,
    )
  ) {
    // İki regex farklı capture gruplarına sahip — birleşik mantık:
    const hours = parseInt(
      mActivity[1] && /^\d+$/.test(mActivity[1]) ? mActivity[1] : mActivity[2]!,
      10,
    );
    const subjectNameRaw =
      mActivity[1] && /^\d+$/.test(mActivity[1])
        ? mActivity[2]!
        : mActivity[1]!;
    // Trim ve "dersi"/"branşı" gibi son ekleri temizle
    const subjectName = subjectNameRaw
      .trim()
      .replace(/\s+(dersi|brans[ıi]|branş[ıi])\s*$/i, '')
      .trim();

    const tm = fuzzyMatch(text, ctx.teachers);
    // ÇOKLU SINIF: cümleden tüm class token'lerini çıkar
    const classTokens = extractClassTokens(text);
    const matchedClasses = classTokens.filter((tok) =>
      ctx.classes.some((c) => deburr(c) === deburr(tok)),
    );
    // Eğer context'te eşleşen yoksa: yine de kullan (AI tarafı yeni ders ataması yapıyor olabilir)
    const targetClasses = matchedClasses.length > 0 ? matchedClasses : classTokens;

    if (targetClasses.length > 0 && hours > 0) {
      const actions: DataMutationAction[] = [];
      // 1. ensure subject
      const subjectExists = ctx.subjects.some(
        (s) => deburr(s) === deburr(subjectName),
      );
      if (!subjectExists) {
        actions.push({
          op: 'add_subject',
          params: { name: subjectName },
          description: `"${subjectName}" dersini ekle (yoksa)`,
        });
      }
      // 2. teacher link (optional)
      if (tm.exact) {
        actions.push({
          op: 'link_teacher_subject',
          params: { teacher: tm.exact, subject: subjectName },
          description: `${tm.exact} öğretmenine "${subjectName}" yeterliliği ekle`,
        });
      }
      // 3. her sınıf için ayrı activity
      for (const className of targetClasses) {
        actions.push({
          op: 'add_activity',
          params: {
            class: className,
            subject: subjectName,
            teacher: tm.exact ?? null,
            weeklyHours: hours,
          },
          description: `${className} sınıfına ${hours} saat "${subjectName}"${tm.exact ? ` (${tm.exact})` : ''}`,
        });
      }
      return buildMutation(
        actions,
        targetClasses.length > 1
          ? `${targetClasses.length} sınıfa "${subjectName}" dersi (${hours} saat) eklenecek: ${targetClasses.join(', ')}`
          : `${targetClasses[0]} sınıfına ${hours} saat "${subjectName}" eklenecek.`,
      );
    }
  }

  // "X hocasını ekle" / "X öğretmeni ekle, branşı Y"
  if (
    /(hoca|ogretmen|öğretmen)/.test(lower) &&
    /(ekle|ilave|olustur|oluştur)/.test(lowerDeburr) &&
    !/saat/.test(lower)
  ) {
    // teacher name candidate — context'te varsa atla, yoksa user'ın yazdığı isim al
    const tmExisting = fuzzyMatch(text, ctx.teachers);
    if (tmExisting.exact) {
      // zaten var → idempotent skip
      return buildMutation(
        [
          {
            op: 'add_teacher',
            params: { name: tmExisting.exact },
            description: `${tmExisting.exact} öğretmenini ekle (zaten var, atlanacak)`,
          },
        ],
        `${tmExisting.exact} zaten kayıtlı. Yine de eklemek isterseniz onaylayın.`,
      );
    }
    const name = extractPersonName(text);
    if (name) {
      const sm = fuzzyMatch(text, ctx.subjects);
      const actions: DataMutationAction[] = [
        {
          op: 'add_teacher',
          params: { name },
          description: `"${name}" öğretmenini ekle`,
        },
      ];
      if (sm.exact) {
        actions.push({
          op: 'link_teacher_subject',
          params: { teacher: name, subject: sm.exact },
          description: `${name} → "${sm.exact}" yeterliliği`,
        });
      }
      return buildMutation(
        actions,
        `"${name}" öğretmeni${sm.exact ? ` ve "${sm.exact}" yeterliliği` : ''} eklenecek.`,
      );
    }
  }

  const hasSubjectKeyword =
    /(brans|branş|ders|dersi|dersini|dersleri|derslerini|brans[ıi]|branş[ıi])/.test(
      lower,
    );
  const hasMultipleNouns = /,/.test(text) || /\s+ve\s+/.test(lowerDeburr);
  if (
    (hasSubjectKeyword || hasMultipleNouns) &&
    /(ekle|ilave|olustur|oluştur)/.test(lowerDeburr) &&
    !/(hoca|ogretmen|öğretmen|sinif|sınıf|derslik|oda|salon|lab)/.test(lower) &&
    !/saat/.test(lower) &&
    !/\b\d/.test(text)
  ) {
    const subjectNames = extractSubjectList(text, ctx);
    if (subjectNames.length > 1) {
      const actions: DataMutationAction[] = subjectNames.map((name) => ({
        op: 'add_subject' as const,
        params: { name },
        description: `"${name}" branşını ekle`,
      }));
      return buildMutation(
        actions,
        `${subjectNames.length} branş eklenecek: ${subjectNames.join(', ')}.`,
      );
    }
    // Tek branş — eski davranış
    if (subjectNames.length === 1) {
      return buildMutation(
        [
          {
            op: 'add_subject',
            params: { name: subjectNames[0]! },
            description: `"${subjectNames[0]}" branşını ekle`,
          },
        ],
        `"${subjectNames[0]}" branşı eklenecek.`,
      );
    }
    const name = extractQuotedOrAfter(text, /(brans|branş|ders|dersi|branşı|branşi)/i);
    if (name) {
      return buildMutation(
        [
          {
            op: 'add_subject',
            params: { name },
            description: `"${name}" branşını ekle`,
          },
        ],
        `"${name}" branşı eklenecek.`,
      );
    }
  }

  // "X sınıfı ekle" / "10F, 11A, 12FEN sınıflarını ekle" / "9A 9B 9C 9D ekle"
  // Sınıf adından kademe (year) otomatik çıkarılır: "10F" → "10. Sınıf"
  if (
    /(sinif|sınıf|şube|sube)/.test(lower) &&
    /(ekle|ilave|olustur|oluştur|ayir|ayır)/.test(lowerDeburr)
  ) {
    const names = extractClassTokens(text);
    if (names.length > 0) {
      // Cümlede açıkça belirtilmiş bir kademe var mı? ("10. sınıfa ekle")
      const explicitYearMatch =
        /(\d{1,2})\.?\s*(kademe|sınıfa|sinifa|sınıfta|sinifta)/i.exec(text);
      const explicitYear = explicitYearMatch ? `${explicitYearMatch[1]}. Sınıf` : null;

      const actions: DataMutationAction[] = names.map((name) => {
        // Adın başındaki rakamları yakalayıp kademe çıkar: 10F → 10. Sınıf
        const yearFromName = /^(\d{1,2})/.exec(name);
        const yearName =
          explicitYear ?? (yearFromName ? `${yearFromName[1]}. Sınıf` : undefined);
        return {
          op: 'add_class' as const,
          params: yearName ? { name, year: yearName } : { name },
          description: `${name} sınıfını ekle${yearName ? ` (${yearName})` : ''}`,
        };
      });
      return buildMutation(
        actions,
        names.length > 1
          ? `${names.length} sınıf eklenecek: ${names.join(', ')}`
          : `${names[0]} sınıfı${actions[0].params['year'] ? ` ${actions[0].params['year']} kademesinde` : ''} eklenecek.`,
      );
    }
  }

  return null;
}

function buildMutation(actions: DataMutationAction[], explanation: string): AIResponse {
  return {
    kind: 'data_mutation',
    actions,
    explanation,
    requiresConfirmation: true,
    confidence: 0.85,
  };
}

function extractQuotedOrAfter(text: string, keyword: RegExp): string | null {
  const quoted = text.match(/['"`]([^'"`]{1,40})['"`]/);
  if (quoted) return quoted[1]!.trim();
  // "Lab1 dersliği" pattern — keyword'den ÖNCE 1-3 kelime
  const beforeRe = new RegExp(
    `([\\wığüşöçİĞÜŞÖÇ.-]+(?:\\s+[\\wığüşöçİĞÜŞÖÇ.-]+){0,2})\\s+${keyword.source}`,
    'i',
  );
  const m = text.match(beforeRe);
  if (m && m[1]) {
    const candidate = m[1].trim();
    // genel/yapısal kelimelerse atla
    if (/^(yeni|ek|bir|bu|şu|o)$/i.test(candidate)) return null;
    return candidate;
  }
  return null;
}

/**
 * Türkçe insan adı çıkarımı: "Ahmet Yılmaz öğretmeni ekle" → "Ahmet Yılmaz".
 * Çok basit heuristic — büyük harfle başlayan ardışık 2 kelime.
 */
function extractPersonName(text: string): string | null {
  const m = text.match(/([A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?:\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+)+)/);
  if (m && m[1]) return m[1].trim();
  // tek kelime: "Ahmet öğretmen ekle"
  const m2 = text.match(/([A-ZÇĞİÖŞÜ][a-zçğıöşü]{2,})/);
  if (m2 && m2[1]) return m2[1].trim();
  return null;
}

/**
 * Sınıf adı: "10F", "11FEN", "9-A", "9A", "11SAY" gibi
 */
/** Cümleden birden fazla sınıf adı çıkarır (virgül/boşluk ayrımı destekli).
 *  Örnek: "9A, 9B, 9C sınıflarını ekle" → ["9A","9B","9C"]
 *         "10F sınıfı ekle" → ["10F"]
 *         "11FEN ve 11SAY ekle" → ["11FEN","11SAY"]
 */
/**
 * Çoklu branş çıkarımı:
 *   "Matematik, Fizik, Türkçe derslerini ekle" → ["Matematik","Fizik","Türkçe"]
 *   "Matematik ve Fizik ekle"                  → ["Matematik","Fizik"]
 *   "Tarih ve Coğrafya derslerini sisteme ekle"→ ["Tarih","Coğrafya"]
 *
 * Strateji:
 *   1. Cümleden "ders/branş/ekle" anahtar kelimelerinden ÖNCEKİ kısmı al.
 *   2. Bu kısmı virgül ve "ve"/"ile" ile böl.
 *   3. Her token için: context'te birebir eşleşme varsa onu al; yoksa
 *      stop-word filtresinden geçer ve büyük harfle başlayan ise alınır.
 */
function extractSubjectList(text: string, ctx: AIContext): string[] {
  // Anchor: "X ekle/ilave/oluştur"; ya da "X dersini/derslerini/branşını ekle"
  // Önce "dersleri/derslerini/dersini/branşını/branşlarını" gibi belirleyici
  // sufix'i bul, ondan önceki kısmı al.
  const anchorRe =
    /^(.+?)\s+(?:dersler(?:i(?:ni)?)?|dersini|dersi|brans(?:lar)?[ıi](?:n[ıi])?|branş(?:lar)?ı(?:nı)?)\s+(?:ekle|ilave|olustur|oluştur|sisteme\s+ekle|programa\s+ekle)/i;
  let head: string;
  const m = anchorRe.exec(text);
  if (m) {
    head = m[1]!;
  } else {
    // "X ekle" — daha gevşek; "ekle" kelimesine kadar kısmı al
    const re2 = /^(.+?)\s+(?:ekle|ilave|olustur|oluştur)\b/i;
    const m2 = re2.exec(text);
    if (!m2) return [];
    head = m2[1]!;
  }

  // "Yeni" / "Sisteme" / "Programa" gibi giriş kelimelerini temizle
  head = head.replace(/^\s*(yeni|sisteme|programa|okula|musfredata|müfredata|ders\s+olarak)\s+/i, '').trim();

  // Virgül, noktalı virgül, "ve", "ile" ile böl
  const parts = head
    .split(/\s*,\s*|\s+ve\s+|\s+ile\s+|\s*;\s*/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // STOP-WORD filtresi — eğitim domain'inde anlamsız tokenları at
  const STOP = new Set([
    'yeni', 'okula', 'okulda', 'okulumuza', 'okulumuzda', 'sisteme', 'programa',
    'müfredata', 'mufredata', 'ders', 'dersi', 'dersini', 'dersleri',
    'derslerini', 'branş', 'brans', 'branşı', 'branşını', 'branşlar',
    'branşlarını', 'branslar', 'a', 've', 'ile', 'ekle', 'ekler',
  ]);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of parts) {
    let token = raw.trim();
    // Trailing "dersi/branşı" gibi ekleri temizle
    token = token.replace(/\s+(dersi(?:ni)?|dersleri(?:ni)?|brans[ıi](?:n[ıi])?|branş[ıi](?:n[ıi])?)\s*$/i, '').trim();
    if (!token) continue;
    if (STOP.has(deburr(token).toLowerCase())) continue;

    // 1. Context'te eşleşme var mı? (Var ise canonical adını kullan)
    const ctxMatch = ctx.subjects.find((s) => deburr(s) === deburr(token));
    if (ctxMatch) {
      if (!seen.has(ctxMatch)) {
        seen.add(ctxMatch);
        out.push(ctxMatch);
      }
      continue;
    }

    // 2. Yeni branş — sadece isim olarak görünüyorsa al (sayı/sembol değil)
    if (/^[A-ZÇĞİÖŞÜa-zçğıöşü][A-ZÇĞİÖŞÜa-zçğıöşü0-9 .'-]{1,30}$/.test(token)) {
      // Title case'e çevir — kullanıcı "matematik" yazdı diye DB'ye "matematik" yazmayalım
      const titled = token
        .split(/\s+/)
        .map((w) => (w.length > 1 ? w[0]!.toLocaleUpperCase('tr') + w.slice(1).toLocaleLowerCase('tr') : w))
        .join(' ');
      if (!seen.has(titled)) {
        seen.add(titled);
        out.push(titled);
      }
    }
  }
  return out;
}

function extractClassTokens(text: string): string[] {
  const regex = /\b(\d{1,2}[A-ZÇĞİÖŞÜa-zçğıöşü-]{0,8})\b/g;
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const raw = m[1].trim();
    // Pür sayı (örn. "5") veya çok kısa (sadece 2 karakter ama harfsiz) → atla
    if (/^\d+$/.test(raw)) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

function buildExplanation(c: AIConstraint, unresolved: string[]): string {
  if (unresolved.length > 0) {
    return `Talebinizdeki referansı netleştiremedim: ${unresolved.join('; ')}. Lütfen tam adı belirtin.`;
  }
  switch (c.type) {
    case 'TEACHER_NOT_AVAILABLE': {
      const t = c.params['teacher'] as string;
      const slots = (c.params['slots'] as Slot[]) ?? [];
      if (slots.length === 0) return `${t} öğretmeni için müsaitsizlik kısıtlaması eklendi.`;
      const byDay = groupByDay(slots);
      const parts = Object.entries(byDay).map(([d, hs]) => {
        if (hs.length === 0 || hs.includes(null as unknown as number))
          return `${d} (tüm gün)`;
        return `${d} ${hs.join(', ')}. ders`;
      });
      return `${t} öğretmeninin ${parts.join(' / ')} müsait olmaması kısıtlaması eklendi.`;
    }
    case 'TEACHER_MAX_HOURS_DAILY':
      return `${c.params['teacher']} öğretmeninin günde en fazla ${c.params['maxHours']} ders işlemesi kısıtlaması eklendi.`;
    case 'SUBJECT_NOT_ON_DAY':
      return `${c.params['subject']} dersinin ${(c.params['days'] as string[]).join(', ')} günü/leri için engellenmesi kısıtlaması eklendi.`;
    case 'SUBJECT_LAST_HOUR_OF_DAY':
      return `${c.params['subject']} dersinin günün son saatinde işlenmesi kısıtlaması eklendi.`;
    case 'SUBJECT_MAX_HOURS_DAILY':
      return `${c.params['subject']} dersinin günde en fazla ${c.params['maxHours']} saat olması kısıtlaması eklendi.`;
    case 'CLASS_NOT_AVAILABLE':
      return `${c.params['class']} sınıfı için belirtilen zaman dilimlerinde müsait olmama kısıtlaması eklendi.`;
    case 'ROOM_NOT_AVAILABLE':
      return `${c.params['room']} dersliğinin belirtilen zaman dilimlerinde kapalı olması kısıtlaması eklendi.`;
    default:
      return `${c.type} kısıtlaması eklendi.`;
  }
}

function groupByDay(slots: Slot[]): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const s of slots) {
    const k = s.day ?? '(gün yok)';
    if (!out[k]) out[k] = [];
    if (s.hour !== null) out[k]!.push(s.hour);
  }
  return out;
}

/** TipleConstraintType kullanmayı dışarıya açık tutalım (helper). */
export type { ConstraintType };

// ---------------------------------------------------------------------------
// Genişletilmiş constraint detector'ları (ek pattern seti)
// mockParseSync zinciri arkasından kullanılır (extendedDetectors loop).
// ---------------------------------------------------------------------------

const detectSubjectLastHourGlobal: Detector = (text, lower, ctx) => {
  if (!/(son\s+saat|son\s+ders|son\s+saate)/.test(lower)) return null;
  if (/(olmasin|olmasın)/.test(lower)) return null;
  const { exact, matches } = fuzzyMatch(text, ctx.subjects);
  if (!exact && matches.length === 0) return null;
  const klass = fuzzyMatch(text, ctx.classes);
  const weight = inferWeight(text);
  if (!exact) {
    return {
      constraint: {
        type: 'SUBJECT_LAST_HOUR_OF_DAY',
        weight,
        active: true,
        params: { subject: null, class: klass.exact },
      },
      unresolved: [`'${matches.join(', ')}' dersleri arasından hangisi belirsiz`],
    };
  }
  return {
    constraint: {
      type: 'SUBJECT_LAST_HOUR_OF_DAY',
      weight,
      active: true,
      params: { subject: exact, class: klass.exact },
    },
  };
};

const detectSubjectPreferredHours: Detector = (text, lower, ctx) => {
  if (!/(sabah|ilk\s+ders|ilk\s+saat|sabahtan|erken\s+saat)/.test(lower)) return null;
  const { exact, matches } = fuzzyMatch(text, ctx.subjects);
  if (!exact && matches.length === 0) return null;
  const klass = fuzzyMatch(text, ctx.classes);
  const weight = inferWeight(text);
  const preferredHours = [1, 2, 3, 4];
  if (!exact) {
    return {
      constraint: {
        type: 'SUBJECT_PREFERRED_HOURS',
        weight,
        active: true,
        params: { subject: null, class: klass.exact, preferredHours },
      },
      unresolved: [`'${matches.join(', ')}' dersleri arasından hangisi belirsiz`],
    };
  }
  return {
    constraint: {
      type: 'SUBJECT_PREFERRED_HOURS',
      weight,
      active: true,
      params: { subject: exact, class: klass.exact, preferredHours },
    },
  };
};

const detectSubjectPreferredRoom: Detector = (text, lower, ctx) => {
  if (
    !/(yapil|yapıl|olsun|olarak\s+atan|dersliginde|dersliğinde|odasinda|odasında|laboratuvar|lab|salonunda|salonda|salonu|atolye|atölye)/.test(
      lower,
    )
  ) {
    return null;
  }
  if (/(olmasin|olmasın|yok\b|kapali|kapalı)/.test(lower)) return null;
  const subj = fuzzyMatch(text, ctx.subjects);
  const room = fuzzyMatch(text, ctx.rooms);
  if (!subj.exact || !room.exact) return null;
  const weight = inferWeight(text);
  return {
    constraint: {
      type: 'SUBJECT_PREFERRED_ROOM',
      weight,
      active: true,
      params: { subject: subj.exact, room: room.exact },
    },
  };
};

const detectTeacherNoGaps: Detector = (text, lower, ctx) => {
  if (!/(bos\s+saat|boş\s+saat|boşluk|bosluk|pencere|gap)/.test(lower)) return null;
  if (!/(olmasin|olmasın|yok\b|istemiyorum|0\s+olsun)/.test(lower)) return null;
  if (!/(hoca|ogretmen|öğretmen)/.test(lower)) return null;
  const tm = fuzzyMatch(text, ctx.teachers);
  const weight = inferWeight(text);
  if (!tm.exact) {
    return {
      constraint: {
        type: 'TEACHER_MAX_GAPS_PER_DAY',
        weight,
        active: true,
        params: { teacher: null, maxGaps: 0 },
      },
      unresolved:
        tm.matches.length === 0
          ? ['Belirtilen öğretmen adı bağlamda bulunamadı']
          : [`'${tm.matches.join(', ')}' adları arasından hangisi belirsiz`],
    };
  }
  return {
    constraint: {
      type: 'TEACHER_MAX_GAPS_PER_DAY',
      weight,
      active: true,
      params: { teacher: tm.exact, maxGaps: 0 },
    },
  };
};

const detectClassNoGaps: Detector = (text, lower, ctx) => {
  if (!/(bos\s+saat|boş\s+saat|boşluk|bosluk)/.test(lower)) return null;
  if (!/(olmasin|olmasın|yok\b|istemiyorum|0\s+olsun)/.test(lower)) return null;
  if (!/(sinif|sınıf)/.test(lower)) return null;
  const cm = fuzzyMatch(text, ctx.classes);
  const weight = inferWeight(text);
  if (!cm.exact) return null;
  return {
    constraint: {
      type: 'CLASS_MAX_GAPS_PER_WEEK',
      weight,
      active: true,
      params: { class: cm.exact, maxGaps: 0 },
    },
  };
};

const detectTeacherMaxDays: Detector = (text, lower, ctx) => {
  if (!/(haftada|hafta).*(gun|gün)/.test(lower) && !/(gun|gün)\s+gel/.test(lower)) {
    return null;
  }
  if (!/(hoca|ogretmen|öğretmen)/.test(lower)) return null;
  const n = findCount(text);
  if (n === null) return null;
  const tm = fuzzyMatch(text, ctx.teachers);
  const weight = inferWeight(text);
  if (!tm.exact) return null;
  return {
    constraint: {
      type: 'TEACHER_MAX_DAYS_PER_WEEK',
      weight,
      active: true,
      params: { teacher: tm.exact, maxDays: n },
    },
  };
};

const detectSubjectBlock: Detector = (text, lower, ctx) => {
  if (!/(blok|cift\s+saat|çift\s+saat|ardisik|ardışık|art\s+arda|pespese|peşpeşe)/.test(lower)) {
    return null;
  }
  const subj = fuzzyMatch(text, ctx.subjects);
  if (!subj.exact) return null;
  const klass = fuzzyMatch(text, ctx.classes);
  const weight = inferWeight(text);
  const explicit = findCount(text);
  const blockDuration =
    explicit !== null && explicit >= 2 && explicit <= 4 ? explicit : 2;
  return {
    constraint: {
      type: 'SUBJECT_CONSECUTIVE_HOURS',
      weight,
      active: true,
      params: { subject: subj.exact, class: klass.exact, blockDuration },
    },
  };
};

/** "Tuncay günün son saatinde olmasın" → TEACHER_NOT_LAST_HOUR */
const detectTeacherNotLastHour: Detector = (text, lower, ctx) => {
  if (!/(son\s+saat|son\s+ders)/.test(lower)) return null;
  if (!/(olmasin|olmasın|girmesin|yok\b|musait\s+degil|müsait\s+değil)/.test(lower))
    return null;
  const tm = fuzzyMatch(text, ctx.teachers);
  if (!tm.exact) return null;
  const subj = fuzzyMatch(text, ctx.subjects);
  if (subj.exact) return null;
  const weight = inferWeight(text);
  return {
    constraint: {
      type: 'TEACHER_NOT_LAST_HOUR',
      weight,
      active: true,
      params: { teacher: tm.exact },
    },
  };
};

/** "X öğretmeni ilk saatte olmasın" → TEACHER_NOT_FIRST_HOUR */
const detectTeacherNotFirstHour: Detector = (text, lower, ctx) => {
  if (!/(ilk\s+saat|ilk\s+ders|birinci\s+saat|birinci\s+ders)/.test(lower))
    return null;
  if (!/(olmasin|olmasın|girmesin|yok\b|musait\s+degil|müsait\s+değil)/.test(lower))
    return null;
  const tm = fuzzyMatch(text, ctx.teachers);
  if (!tm.exact) return null;
  const subj = fuzzyMatch(text, ctx.subjects);
  if (subj.exact) return null;
  const weight = inferWeight(text);
  return {
    constraint: {
      type: 'TEACHER_NOT_FIRST_HOUR',
      weight,
      active: true,
      params: { teacher: tm.exact },
    },
  };
};

/** "X için Y ilk saatte yapılmasın" → SUBJECT_NOT_FIRST_HOUR */
const detectSubjectNotFirstHour: Detector = (text, lower, ctx) => {
  if (!/(ilk\s+saat|ilk\s+ders|birinci\s+saat|birinci\s+ders)/.test(lower))
    return null;
  if (!/(yapilmasin|yapılmasın|olmasin|olmasın|girmesin)/.test(lower)) return null;
  const subj = fuzzyMatch(text, ctx.subjects);
  if (!subj.exact) return null;
  const klass = fuzzyMatch(text, ctx.classes);
  const weight = inferWeight(text);
  return {
    constraint: {
      type: 'SUBJECT_NOT_FIRST_HOUR',
      weight,
      active: true,
      params: { subject: subj.exact, class: klass.exact },
    },
  };
};

/** "X sınıfı günde en fazla N ders alsın" → CLASS_MAX_HOURS_DAILY */
const detectClassMaxHoursDaily: Detector = (text, lower, ctx) => {
  if (!/(sinif|sınıf)/.test(lower)) return null;
  if (!/(gunde|günde|haftada)/.test(lower) && !/(max|en\s+fazla)/.test(lower)) {
    return null;
  }
  const cm = fuzzyMatch(text, ctx.classes);
  if (!cm.exact) return null;
  const n = findCount(text);
  if (n === null) return null;
  if (/(hoca|ogretmen|öğretmen)/.test(lower)) return null;
  const weight = inferWeight(text);
  return {
    constraint: {
      type: 'CLASS_MAX_HOURS_DAILY',
      weight,
      active: true,
      params: { class: cm.exact, maxHours: n },
    },
  };
};

/** "Tüm öğretmenler haftada en fazla N gün gelsin" → ALL_TEACHERS_MAX_DAYS_PER_WEEK */
const detectAllTeachersMaxDays: Detector = (_text, lower) => {
  if (
    !/(tum\s+(hoca|ogretmen|öğretmen)|tüm\s+(hoca|ogretmen|öğretmen)|butun\s+(hoca|ogretmen|öğretmen)|bütün\s+(hoca|ogretmen|öğretmen))/.test(
      lower,
    )
  ) {
    return null;
  }
  if (!/(haftada|hafta).*(gun|gün)/.test(lower)) return null;
  const m = lower.match(/(\d{1,2})/);
  if (!m) return null;
  const n = parseInt(m[1]!, 10);
  if (n < 1 || n > 7) return null;
  return {
    constraint: {
      type: 'ALL_TEACHERS_MAX_DAYS_PER_WEEK',
      weight: 100,
      active: true,
      params: { maxDays: n },
    },
  };
};

const extendedDetectors: Detector[] = [
  detectSubjectLastHourGlobal,
  detectSubjectPreferredHours,
  detectSubjectPreferredRoom,
  detectTeacherNoGaps,
  detectClassNoGaps,
  detectTeacherMaxDays,
  detectSubjectBlock,
  detectTeacherNotLastHour,
  detectTeacherNotFirstHour,
  detectSubjectNotFirstHour,
  detectClassMaxHoursDaily,
  detectAllTeachersMaxDays,
];

/**
 * "Çözüm bulunamadı, kısıtlamayı gevşet" → context.constraints içindeki
 * weight=100 olan en agresif 3-5 kısıtlamayı 70'e düşürmeyi öneren
 * data_mutation döndürür. Kullanıcı kartlardan tek tek seçip onaylar.
 *
 * Tetikleyiciler:
 *   - "kısıtlamayı/kuralı/önemi gevşet", "ağırlık düşür", "esnet"
 *   - "çözüm bulunamadı", "neden çözülmedi", "fet hata", "öneri", "çözemedi"
 *   - "programı üret çalışmadı / olmadı"
 */
function detectRelaxRequest(
  lowerDeburr: string,
  ctx: AIContext,
): AIResponse | null {
  const isRelaxKeyword =
    /(gevset|gevşet|esnet|esnek|ağirlik\s+(dusur|düşür)|onem.{0,15}(dusur|düşür|azalt)|kisitlama.{0,15}(dusur|düşür|azalt))/.test(
      lowerDeburr,
    );
  const isFailureKeyword =
    /(cozum\s+bulunamadi|çözüm\s+bulunamadı|cozulmedi|çözülmedi|fet\s+hata|fet\s+olmadi|fet\s+olmadı|program(i|ı)?\s+(uret|üret).{0,20}(calismadi|çalışmadı|olmadi|olmadı)|oneri\s+ver|öneri\s+ver|nasil\s+cozeyim|nasıl\s+çözeyim)/.test(
      lowerDeburr,
    );
  if (!isRelaxKeyword && !isFailureKeyword) return null;

  const list = (ctx.constraints ?? []).filter((c) => c.active && c.weight >= 90);
  if (list.length === 0) {
    return {
      kind: 'query',
      answer:
        'Şu an gevşetilebilecek katı kısıtlama yok. Aktif tüm kısıtlamalar zaten 90 altında. ' +
        'Yine de programı üretemiyorsan: ders dağıtımında bir öğretmenin haftalık saati sınıf kapasitesini aşıyor olabilir, ' +
        'ya da bir sınıfın bir günlük ders saati günün toplam saatinden fazla. Ders Dağılımı ekranını gözden geçirir misin?',
      confidence: 0.8,
    };
  }

  // En "katı" 5 kısıtlamayı al (weight desc, type uzunluğu desc — daha spesifik olanlar önce).
  const top = [...list]
    .sort(
      (a, b) => b.weight - a.weight || b.type.length - a.type.length,
    )
    .slice(0, 5);

  const actions = top.map((c) => ({
    op: 'set_constraint_weight' as const,
    params: { constraintId: c.id, weight: 70 },
    description: `"${c.description}" → ağırlık ${c.weight} → 70 (esnek)`,
  }));

  const explanation =
    `Programın üretilememesinin en muhtemel sebebi, ağırlığı 100 (katı/zorunlu) olan ${list.length} kısıtlama. ` +
    `Aşağıdaki ${top.length} kısıtlamanın ağırlığını 70'e düşürürsek FET bunları "tercih" olarak görür, ` +
    `tam tatmin edemese bile size en yakın çözümü bulur. Onayla, programı tekrar üretelim.`;

  return {
    kind: 'data_mutation',
    actions,
    explanation,
    requiresConfirmation: true,
    confidence: 0.75,
  };
}

function detectRunSolverRequest(
  text: string,
  lowerDeburr: string,
  _ctx: AIContext,
): AIResponse | null {
  const hasIntent =
    /\b(uret|üret|olustur|oluştur|baslat|başlat|calistir|çalıştır)\b/.test(
      lowerDeburr,
    );
  if (!hasIntent) return null;

  const isStrong =
    /(program(i|ı)?\s+(uret|üret|olustur|oluştur|baslat|başlat|calistir|çalıştır))/.test(
      lowerDeburr,
    ) ||
    /(simdi|şimdi|hemen|artik|artık|hadi)\s+(uret|üret|baslat|başlat|olustur|oluştur)/.test(
      lowerDeburr,
    ) ||
    /(uretmeye|üretmeye|baslamaya|başlamaya)\s+(basla|başla|hazirim|hazırım)/.test(
      lowerDeburr,
    );
  if (!isStrong) return null;

  if (/(ekle|ilave|kayit|kayıt|sil|kaldir|kaldır)/.test(lowerDeburr)) {
    return null;
  }

  let timeLimitSec: number | undefined;
  const lowerTr = text.toLocaleLowerCase('tr');
  const m = lowerTr.match(
    /(\d{1,4})\s*(saniye|sn|saniyede|dakika|dakikada|dk|dakikalik|dakikalık)/i,
  );
  if (m) {
    const n = parseInt(m[1]!, 10);
    const unit = m[2]!.toLowerCase();
    if (unit.startsWith('dak') || unit === 'dk' || unit === 'dakikada') {
      timeLimitSec = n * 60;
    } else {
      timeLimitSec = n;
    }
    if (timeLimitSec < 10) timeLimitSec = 10;
    if (timeLimitSec > 3600) timeLimitSec = 3600;
  }

  const explanation = timeLimitSec
    ? `FET çözücüsünü ${timeLimitSec} saniye üst limitle başlatacağım. Hazırsan onayla.`
    : 'FET çözücüsünü mevcut zaman limitiyle başlatacağım. Hazırsan onayla.';

  return {
    kind: 'run_solver',
    timeLimitSec,
    explanation,
    confidence: 0.92,
  };
}

/**
 * "9. sınıfların müzik derslerini Bilgisayar salonunda yap" gibi
 * class-filtreli subject-room atamaları.
 *
 * Algoritma:
 *   1. Sınıf yılı parse et: "9." / "9. sınıf" / "9. sınıflar" / "10. sınıfların"
 *      → yearPrefix = "9" / "10"
 *      veya tek sınıf: "9A", "10F" → class adı
 *   2. Subject fuzzy match (ctx.subjects)
 *   3. Room fuzzy match (ctx.rooms)
 *   4. data_mutation döndür: tek action add_activity_constraint, filter ile
 *
 * Tetikleyici: salonunda/dersliginde/odasinda/labında/atölyesinde + yap/olsun
 */
function detectPerClassSubjectRoom(
  text: string,
  lowerDeburr: string,
  ctx: AIContext,
): AIResponse | null {
  // Trigger
  const isRoomAssign =
    /(salonunda|salonda|dersliginde|dersliğinde|odasinda|odasında|labinda|labında|atolyesinde|atölyesinde|laboratuvarinda|laboratuvarında)/.test(
      lowerDeburr,
    ) && /(yap|olsun|atan|alinsin|alınsın|isle|işle)/.test(lowerDeburr);
  if (!isRoomAssign) return null;
  if (/(olmasin|olmasın|yok\b|kapali|kapalı)/.test(lowerDeburr)) return null;

  // Sınıf filtresi tespit et — önce tek-sınıf (9A, 10F), sonra yıl (9., 10. sınıf)
  let filterClass: string | null = null;
  let filterClassYear: string | null = null;

  const single = lowerDeburr.match(/\b(\d{1,2})\s*[\-/]?\s*([a-z])\b/);
  if (single) {
    filterClass = `${single[1]}${single[2]!.toUpperCase()}`;
  } else {
    const yr = lowerDeburr.match(/\b(\d{1,2})\.?\s*(sinif|sınıf|siniflar|sınıflar|siniflarin|sınıfların|siniflara|sınıflara)/);
    if (yr) filterClassYear = yr[1]!;
  }

  // En az bir filtre olmalı — yoksa zaten global SUBJECT_PREFERRED_ROOM yeter
  if (!filterClass && !filterClassYear) return null;

  const subj = fuzzyMatch(text, ctx.subjects);
  const room = fuzzyMatch(text, ctx.rooms);
  if (!subj.exact || !room.exact) return null;

  const weight = inferWeight(text);
  const filter: Record<string, string> = { subject: subj.exact };
  if (filterClass) filter.class = filterClass;
  if (filterClassYear) filter.classYear = filterClassYear;

  const filterDesc = filterClass
    ? `${filterClass} sınıfının`
    : `${filterClassYear}. sınıfların`;

  const description = `${filterDesc} ${subj.exact} dersleri → ${room.exact} (her aktiviteye ayrı kısıtlama)`;

  return {
    kind: 'data_mutation',
    actions: [
      {
        op: 'add_activity_constraint',
        params: {
          type: 'ACTIVITY_PREFERRED_ROOM',
          filter,
          params: { room: room.exact },
          weight,
        },
        description,
      },
    ],
    explanation: `${filterDesc} ${subj.exact} derslerini ${room.exact} dersliğinde yapacağım. ` +
      `Bu, her ilgili aktiviteye ayrı bir ACTIVITY_PREFERRED_ROOM kısıtlaması ekler — ` +
      `FET o derslerin sadece bu derslikte çakışmasını ayarlar.`,
    requiresConfirmation: true,
    confidence: 0.88,
  };
}

/**
 * "X sınıfı sanat saatinde 2 gruba bölünür: görsel sanatlar ve müzik"
 */
function detectSplitActivity(
  text: string,
  lowerDeburr: string,
  ctx: AIContext,
): AIResponse | null {
  const isSplit =
    /(bol(un|unur|er|uyor|me|elim|sun)|2\s+gruba|iki\s+gruba|3\s+gruba|uc\s+gruba|gruplar|parcal|ayir|ayril)/.test(
      lowerDeburr,
    ) ||
    /aynı\s+saatte\s+(farkli|farklı)\s+ders/.test(text.toLocaleLowerCase('tr'));
  if (!isSplit) return null;

  // Class
  const classMatch = lowerDeburr.match(/\b(\d{1,2})\s*([a-z])\b/);
  let className: string | null = null;
  if (classMatch) {
    className = `${classMatch[1]}${classMatch[2]!.toUpperCase()}`;
  } else {
    const fz = fuzzyMatch(text, ctx.classes);
    if (fz.exact) className = fz.exact;
  }
  if (!className) return null;

  // En az 2 subject çıkar
  const subjects = extractSubjectList(text, ctx);
  if (subjects.length < 2) {
    // Tek subject geçmiş ama 2+ grup denmiş — netleştir
    return {
      kind: 'query',
      answer: `${className} sınıfını gruplara bölecek dersleri tek tek söyle. Örnek: "Görsel Sanatlar ve Müzik"`,
      confidence: 0.7,
    };
  }

  const hours = parseLeadingInt(text) ?? 2;
  const groups = subjects.map((s) => ({ subject: s }));

  return {
    kind: 'data_mutation',
    actions: [
      {
        op: 'add_split_activity',
        params: {
          class: className,
          weeklyHours: hours,
          groups,
        },
        description: `${className} → ${groups.length} grup (${subjects.join(' | ')}), ${hours} saat`,
      },
    ],
    explanation:
      `${className} sınıfını ${groups.length} gruba böleceğim: ${subjects.join(', ')}. ` +
      `Tüm gruplar aynı saatte başlayacak (FET ConstraintActivitiesSameStartingTime). ` +
      `Her grup için haftalık ${hours} saat aktivite oluşturulacak.`,
    requiresConfirmation: true,
    confidence: 0.85,
  };
}

/**
 * "9A salı 3. ders fizik olsun" / "9A pazartesi 1. ders matematik kilitle"
 */
function detectSetTimetableSlot(
  text: string,
  lowerDeburr: string,
  ctx: AIContext,
): AIResponse | null {
  const hasSlotKeywords =
    /(\d+\.?\s*ders|ders\s+saat|saat).*?(olsun|yap|degis|değiş|kilit|sabitle)/.test(
      lowerDeburr,
    ) ||
    /(slot|hucre|hücre).*?(olsun|degis|değiş)/.test(lowerDeburr);
  if (!hasSlotKeywords) return null;

  // Class
  const classMatch = lowerDeburr.match(/\b(\d{1,2})\s*([a-z])\b/);
  if (!classMatch) return null;
  const className = `${classMatch[1]}${classMatch[2]!.toUpperCase()}`;

  // Day
  let day: string | null = null;
  for (const [key, full] of Object.entries(DAY_NORMALIZE)) {
    if (lowerDeburr.includes(key)) {
      day = full;
      break;
    }
  }
  if (!day) return null;

  // Hour
  const hourMatch = text.match(/(\d{1,2})\.?\s*(?:ders|saat)/);
  if (!hourMatch) return null;
  const hour = parseInt(hourMatch[1]!, 10);
  if (!Number.isFinite(hour) || hour < 1 || hour > 20) return null;

  // Subject
  const subj = fuzzyMatch(text, ctx.subjects);
  if (!subj.exact) return null;

  return {
    kind: 'data_mutation',
    actions: [
      {
        op: 'set_timetable_slot',
        params: { class: className, day, hour, subject: subj.exact },
        description: `${className} ${day} ${hour}. ders → ${subj.exact} (kilit)`,
      },
    ],
    explanation:
      `${className} sınıfının ${day} günü ${hour}. dersini ${subj.exact} olarak kilitleyeceğim. ` +
      `Programı yeniden ürettiğinde FET bu slot'u koruyacak.`,
    requiresConfirmation: true,
    confidence: 0.88,
  };
}

function detectSubstituteTeacher(
  text: string,
  lowerDeburr: string,
  ctx: AIContext,
): AIResponse | null {
  const hasSubKeywords =
    /(yerine|degistir|değiştir|al(sin|sın)|ver(sin|sın)?|ata|atan)/.test(lowerDeburr) &&
    /(hoca|ogretmen|öğretmen)/.test(lowerDeburr);
  if (!hasSubKeywords) return null;
  if (/(ekle|sil|kaldir|kaldır)/.test(lowerDeburr)) return null;

  const classMatch = lowerDeburr.match(/\b(\d{1,2})\s*([a-z])\b/);
  if (!classMatch) return null;
  const className = `${classMatch[1]}${classMatch[2]!.toUpperCase()}`;

  // Subject
  const subj = fuzzyMatch(text, ctx.subjects);
  if (!subj.exact) return null;

  // 2 teacher — eski + yeni
  const teachers = ctx.teachers
    .map((t) => {
      const escapedName = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(
        `\\b${escapedName.split(/\s+/)[0]!}`,
        'i',
      );
      return re.test(text) ? t : null;
    })
    .filter((x): x is string => x !== null);
  if (teachers.length < 1) return null;

  const newTeacher = teachers[teachers.length - 1]!; // son geçen = yeni
  const description = `${className} × ${subj.exact} → öğretmen: ${newTeacher}`;

  return {
    kind: 'data_mutation',
    actions: [
      {
        op: 'substitute_teacher',
        params: {
          class: className,
          subject: subj.exact,
          newTeacher,
        },
        description,
      },
    ],
    explanation:
      `${className} sınıfının ${subj.exact} dersinin öğretmenini ${newTeacher} olarak değiştireceğim. ` +
      `${newTeacher} hoca ${subj.exact} branşına yeterli değilse otomatik linkleyeceğim.`,
    requiresConfirmation: true,
    confidence: 0.82,
  };
}

/**
 * "9A ve 9B beraber müzik dinleyecek" — multi-class shared activity
 */
function detectMergeActivities(
  text: string,
  lowerDeburr: string,
  ctx: AIContext,
): AIResponse | null {
  const hasMerge =
    /(berab(er|erce)|birlikt(e|en)|ortak|birles(ik|tir)|birleş|aynı\s+anda)/.test(
      lowerDeburr,
    );
  if (!hasMerge) return null;

  // Multiple classes
  const classRegex = /\b(\d{1,2}\s*[a-z])\b/g;
  const matches = [...lowerDeburr.matchAll(classRegex)];
  if (matches.length < 2) return null;
  const classes = Array.from(
    new Set(matches.map((m) => m[1]!.replace(/\s+/g, '').toUpperCase())),
  );
  if (classes.length < 2) return null;

  const subj = fuzzyMatch(text, ctx.subjects);
  if (!subj.exact) return null;

  const hours = parseLeadingInt(text) ?? 1;
  const description = `${classes.join(' + ')} → ${subj.exact} birleşik (${hours} saat)`;

  return {
    kind: 'data_mutation',
    actions: [
      {
        op: 'merge_activities',
        params: {
          classes,
          subject: subj.exact,
          weeklyHours: hours,
        },
        description,
      },
    ],
    explanation:
      `${classes.join(' + ')} sınıflarını ${subj.exact} dersinde birleştireceğim. ` +
      `Bu sınıflar aynı saatte aynı öğretmenle dersi alır (FET aynı saatte başlamaya zorlar).`,
    requiresConfirmation: true,
    confidence: 0.82,
  };
}

/**
 * "9A programını PDF olarak indir" / "Tüm programı excel'e aktar"
 */
function detectExport(
  text: string,
  lowerDeburr: string,
  ctx: AIContext,
): AIResponse | null {
  const isExport =
    /(indir|aktar|export|cikti|çıktı|kaydet|dosya|al(sin|sın)?)/.test(lowerDeburr) &&
    /(pdf|excel|xls|xlsx|html|yazdir|yazdır)/.test(lowerDeburr);
  if (!isExport) return null;

  let format = 'pdf';
  if (/excel|xls|xlsx/.test(lowerDeburr)) format = 'excel';
  else if (/html/.test(lowerDeburr)) format = 'html';

  // Sınıf scope (opsiyonel)
  let cls: string | null = null;
  const classMatch = lowerDeburr.match(/\b(\d{1,2})\s*([a-z])\b/);
  if (classMatch) {
    cls = `${classMatch[1]}${classMatch[2]!.toUpperCase()}`;
  } else {
    const fz = fuzzyMatch(text, ctx.classes);
    if (fz.exact && /(sinif|sınıf|class)/.test(lowerDeburr)) cls = fz.exact;
  }

  const params: Record<string, string> = { format };
  if (cls) params.class = cls;
  const desc = cls
    ? `${cls} programı → ${format.toUpperCase()}`
    : `Tüm program → ${format.toUpperCase()}`;

  return {
    kind: 'data_mutation',
    actions: [
      {
        op: 'export_timetable',
        params,
        description: desc,
      },
    ],
    explanation: cls
      ? `${cls} sınıfının programını ${format.toUpperCase()} olarak export edeceğim. Program sayfasına geçilecek ve indirme tetiklenecek.`
      : `Tüm okul programını ${format.toUpperCase()} olarak export edeceğim. Program sayfasına geçilecek.`,
    requiresConfirmation: true,
    confidence: 0.88,
  };
}

function parseLeadingInt(text: string): number | null {
  const m = text.match(/\b(\d{1,2})\s*(saat|ders|adet|tane)/i);
  if (!m) return null;
  const n = parseInt(m[1]!, 10);
  if (n < 1 || n > 20) return null;
  return n;
}

/**
 * "9A salı 3 ile cuma 5 yer değiştirsin" → swap_timetable_slots
 * İki (class, day, hour) çiftini parse eder.
 */
function detectSwapSlots(
  text: string,
  lowerDeburr: string,
  _ctx: AIContext,
): AIResponse | null {
  const hasSwap =
    /(yer\s+degis|yer\s+değiş|swap|degistir|değiştir).*(slot|ders|saat)/.test(lowerDeburr) ||
    /(ile|le|la).*(yer\s+degis|yer\s+değiş)/.test(lowerDeburr);
  if (!hasSwap) return null;

  // İki sınıf + iki gün + iki saat çıkar
  const classMatches = [...lowerDeburr.matchAll(/\b(\d{1,2})\s*([a-z])\b/g)];
  if (classMatches.length < 1) return null;

  // Gün eşleştirme
  const days: string[] = [];
  for (const [key, full] of Object.entries(DAY_NORMALIZE)) {
    if (lowerDeburr.includes(key)) {
      if (!days.includes(full)) days.push(full);
    }
  }
  if (days.length < 2) return null;

  // Saat eşleştirme
  const hourMatches = [...text.matchAll(/(\d{1,2})\.?\s*(?:ders|saat)/g)];
  if (hourMatches.length < 2) return null;
  const hours = hourMatches.slice(0, 2).map((m) => parseInt(m[1]!, 10));
  if (hours.some((h) => !Number.isFinite(h) || h < 1 || h > 20)) return null;

  // İkinci sınıf yoksa aynısı varsay (aynı sınıf içi swap)
  const class1 = `${classMatches[0]![1]}${classMatches[0]![2]!.toUpperCase()}`;
  const class2 =
    classMatches.length >= 2
      ? `${classMatches[1]![1]}${classMatches[1]![2]!.toUpperCase()}`
      : class1;

  return {
    kind: 'data_mutation',
    actions: [
      {
        op: 'swap_timetable_slots',
        params: {
          slot1: { class: class1, day: days[0], hour: hours[0] },
          slot2: { class: class2, day: days[1], hour: hours[1] },
        },
        description: `${class1} ${days[0]}/${hours[0]} ↔ ${class2} ${days[1]}/${hours[1]}`,
      },
    ],
    explanation:
      `${class1} ${days[0]} ${hours[0]}. ders ile ${class2} ${days[1]} ${hours[1]}. ders'i ` +
      `yer değiştireceğim. Her iki aktiviteye ACTIVITY_FIXED_TIME constraint eklenir; ` +
      `programı yeniden üretince FET swap'i uygular.`,
    requiresConfirmation: true,
    confidence: 0.82,
  };
}

function detectPairConsecutive(
  text: string,
  lowerDeburr: string,
  ctx: AIContext,
): AIResponse | null {
  const hasConsecutive =
    /(pes\s+pese|peş\s+peşe|ardisik|ardışık|hemen\s+ardin|hemen\s+ardın|art\s+arda|consecutive|bir\s+arada|yan\s+yana)/.test(
      lowerDeburr,
    );
  if (!hasConsecutive) return null;
  if (/blok\s+halinde|blok\s+ders/.test(lowerDeburr)) return null;

  const subjects = extractSubjectList(text, ctx);
  if (subjects.length < 2) return null;

  const classMatch = lowerDeburr.match(/\b(\d{1,2})\s*([a-z])\b/);
  let className: string | null = null;
  if (classMatch) {
    className = `${classMatch[1]}${classMatch[2]!.toUpperCase()}`;
  } else if (ctx.classes.length === 1) {
    className = ctx.classes[0]!;
  } else {
    // Sınıf belli değilse netleştir
    return {
      kind: 'query',
      answer: `'${subjects[0]}' ve '${subjects[1]}' hangi sınıf için peş peşe olsun? Örnek: "9A için Fizik ve Matematik peş peşe"`,
      confidence: 0.7,
    };
  }

  return {
    kind: 'data_mutation',
    actions: [
      {
        op: 'pair_subjects_consecutive',
        params: {
          class: className,
          subject1: subjects[0],
          subject2: subjects[1],
        },
        description: `${className} → '${subjects[0]}' hemen ardından '${subjects[1]}'`,
      },
    ],
    explanation:
      `${className} sınıfında '${subjects[0]}' bittikten hemen sonra '${subjects[1]}' başlamasını ` +
      `zorunlu kılan TWO_ACTIVITIES_CONSECUTIVE kısıtlaması ekleyeceğim. ` +
      `FET bu iki aktiviteyi aynı günde peş peşe yerleştirecek.`,
    requiresConfirmation: true,
    confidence: 0.85,
  };
}

/**
 * "Öğretmenler sayfasına geç" → navigate_to
 *
 * SIKI: hem "sayfa/ekran/page" gibi navigation anchor hem de uygun verb gerekli.
 * Aksi takdirde "Beden eğitimi son derste olsun" veya "Kaç dersliğim var?"
 * gibi başka intent'ler false positive olur.
 */
function detectNavigate(text: string, lowerDeburr: string): AIResponse | null {
  // Anchor: explicit "sayfa" veya "ekran" veya "page" + navigation verb
  const hasPageAnchor =
    /\b(sayfa(?:ya|sina|sina|sını|sinin|sının|si|sı)?|ekran(?:a|ina|ına|ini|ını|i|ı)?|page)\b/.test(
      lowerDeburr,
    );
  if (!hasPageAnchor) return null;
  const hasNavVerb =
    /\b(gec|geç|git|gotur|götür|ac|aç|yonlendi|yönlendi|navigate|don|dön)\b/.test(
      lowerDeburr,
    );
  if (!hasNavVerb) return null;

  // CRUD niyeti varsa atla — "öğretmen sayfasına yeni ekle" gibi
  if (/\b(ekle|sil|kaldir|kaldır|guncelle|güncelle|olustur|oluştur)\b/.test(lowerDeburr)) {
    return null;
  }

  const pageMap: Array<[RegExp, string]> = [
    [/\b(ogretmen|öğretmen)/, 'teachers'],
    [/\b(sinif|sınıf)(?!a|ı|i)/, 'classes'],
    [/\b(derslik|derslikler|oda)\b/, 'rooms'],
    [/\b(ders\s+dagilim|ders\s+dağılım|aktivite|aktiviteler)\b/, 'activities'],
    [/\b(dersler\b|ders\s+sayfas|ders\s+ekran)/, 'subjects'],
    [/\b(gun\s+saat|gün\s+saat|saat\s+plan|gun\s+plan|gün\s+plan)\b/, 'schedule'],
    [/\b(kisitlam|kısıtlam)/, 'constraints'],
    [/\b(uret|üret|generate|uretim|üretim)\b/, 'generate'],
    [/\b(program(?!\s+olu)|cizelge|çizelge|timetable)\b/, 'timetable'],
    [/\b(ayar|settings|setting)\b/, 'settings'],
    [/\b(gelismis|gelişmiş|advanced)\b/, 'advanced'],
    [/\b(baslangic|başlangıç|hosgeldin|hoşgeldin|welcome|ana\s+sayfa|home)\b/, 'welcome'],
  ];
  for (const [re, page] of pageMap) {
    if (re.test(lowerDeburr)) {
      return {
        kind: 'data_mutation',
        actions: [
          {
            op: 'navigate_to',
            params: { page },
            description: `/${page} sayfasına geç`,
          },
        ],
        explanation: `/${page} sayfasına yönlendireceğim.`,
        requiresConfirmation: true,
        confidence: 0.88,
      };
    }
  }
  return null;
}
