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
  /** Son program üretimi başarısızsa, AI'ın teşhis+çözüm için kullanacağı kompakt hata bilgisi.
   *  Üretim başarılıysa / hiç denenmediyse alan YOK (undefined). */
  lastGenerationFailure?: {
    reason: string;
    message: string;
    unplaced?: number;
    total?: number;
  };
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

function findCount(text: string): number | null {
  const lower = text.toLocaleLowerCase('tr');
  const re = /(?:max|en\s+fazla|en\s+cok|en\s+çok|gunde|günde|toplamda|haftada)\s+(\d{1,2})/;
  const m = lower.match(re);
  if (m) {
    const n = parseInt(m[1]!, 10);
    if (n > 0 && n <= 50) return n;
  }
  for (const [word, n] of Object.entries(WORD_NUMBERS_CARDINAL)) {
    const pat = new RegExp(`\\b(?:max|en\\s+fazla|en\\s+cok|en\\s+çok|gunde|günde|haftada)\\s+${word}\\b`);
    if (pat.test(lower)) return n;
  }
  const fallback = lower.match(/\b(\d{1,2})\b/);
  if (fallback) {
    const n = parseInt(fallback[1]!, 10);
    if (n > 0 && n <= 50) return n;
  }
  return null;
}

function fuzzyMatch(text: string, candidates: string[]): { exact: string | null; matches: string[] } {
  if (candidates.length === 0) return { exact: null, matches: [] };
  const lowText = deburr(text);
  const hits: string[] = [];
  for (const c of candidates) {
    const lowC = deburr(c);
    if (lowText.includes(lowC)) {
      hits.push(c);
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

function extractRenameTarget(text: string, currentName: string): string | null {
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

const detectTeacherMaxHoursDaily: Detector = (text, lower, ctx) => {
  if (/(haftada|hafta).*(gun|gün)/.test(lower)) return null;
  if (!/(gunde|günde|max|en\s+fazla|en\s+cok|en\s+çok)/.test(lower)) return null;

  const teacherTrigger = /(hoca|ogretmen|öğretmen)/.test(lower);
  const teacherMatch = fuzzyMatch(text, ctx.teachers);
  const subjectMatch = fuzzyMatch(text, ctx.subjects);

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

const detectSubjectMaxHoursDaily: Detector = (text, lower, ctx) => {
  if (!/(ders|brans|branş)/.test(lower)) return null;
  if (!/(gunde|günde|haftada)/.test(lower) && !/(max|en\s+fazla|en\s+cok|en\s+çok)/.test(lower)) {
    return null;
  }
  if (/(hoca|ogretmen|öğretmen)/.test(lower)) return null;

  const n = findCount(text);
  if (n === null) return null;

  const { exact, matches } = fuzzyMatch(text, ctx.subjects);
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

const detectSubjectLastHour: Detector = (text, lower, ctx) => {
  if (!/son\s+ders/.test(lower)) return null;
  if (!/(olsun|yapilsin|yapılsın|olmali|olmalı|olacak)/.test(lower)) {
    if (/(olmasin|olmasın|yok\b)/.test(lower)) return null;
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

const detectSubjectNotOnDay: Detector = (text, lower, ctx) => {
  if (!/(ders|brans|branş)/.test(lower) && !findDays(text).length) return null;
  if (!/(olmasin|olmasın|yok\b|girmesin)/.test(lower)) return null;
  if (/(hoca|ogretmen|öğretmen)/.test(lower)) return null;
  if (/son\s+ders/.test(lower)) return null;

  const days = findDays(text);
  if (days.length === 0) return null;

  const { exact, matches } = fuzzyMatch(text, ctx.subjects);
  if (!exact && matches.length === 0) return null;

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

  const conv = detectConversationalWizard(lowerDeburr, context, history);
  if (conv) return conv;

  const relax = detectRelaxRequest(lowerDeburr, context);
  if (relax) return relax;

  const runSolver = detectRunSolverRequest(text, lowerDeburr, context);
  if (runSolver) return runSolver;

  const perClass = detectPerClassSubjectRoom(text, lowerDeburr, context);
  if (perClass) return perClass;

  const split = detectSplitActivity(text, lowerDeburr, context);
  if (split) return split;

  const slot = detectSetTimetableSlot(text, lowerDeburr, context);
  if (slot) return slot;

  const sub = detectSubstituteTeacher(text, lowerDeburr, context);
  if (sub) return sub;

  const merge = detectMergeActivities(text, lowerDeburr, context);
  if (merge) return merge;

  const exp = detectExport(text, lowerDeburr, context);
  if (exp) return exp;

  const swap = detectSwapSlots(text, lowerDeburr, context);
  if (swap) return swap;

  const pair = detectPairConsecutive(text, lowerDeburr, context);
  if (pair) return pair;

  const nav = detectNavigate(text, lowerDeburr);
  if (nav) return nav;

  const clarifyEarly = detectAmbiguousIntent(lowerDeburr, context);
  if (clarifyEarly) return clarifyEarly;

  const summary = detectSummaryOrListQuery(lowerDeburr, context, text);
  if (summary) return summary;

  const dm = detectDataMutation(text, lower, lowerDeburr, context);
  if (dm) return dm;

  const su = detectScheduleUpdate(text, lower, lowerDeburr, context);
  if (su) return su;

  const q = detectQuery(text, lower, lowerDeburr, context);
  if (q) return q;

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

  const clarify = detectAmbiguousIntent(lowerDeburr, context);
  if (clarify) return clarify;

  return failResponse();
}

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
  return (
    'Şimdi ders dağıtımını yapalım: her sınıf hangi dersten kaç saat görecek? ' +
    '(Örnek: "9A sınıfına 5 saat Matematik ekle"). ' +
    'Veya kısıtlama söyleyebilirsin (örn. "Ahmet hoca Cuma yok"), ya da hazırsan "Programı Üret" diyebilirsin.'
  );
}

function buildWizardAck(prevAssistantText: string, ctx: AIContext): string {
  if (!prevAssistantText) return '';
  let prevAnswer = prevAssistantText;
  try {
    const parsed = JSON.parse(prevAssistantText) as { answer?: string };
    if (parsed.answer) prevAnswer = parsed.answer;
  } catch {
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

function detectSummaryOrListQuery(
  lowerDeburr: string,
  ctx: AIContext,
  text?: string,
): AIResponse | null {
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


function detectQuery(
  text: string,
  lower: string,
  lowerDeburr: string,
  ctx: AIContext,
): AIResponse | null {
  const isQuestion =
    text.trim().endsWith('?') ||
    /\b(hangi|kim|kac|kaç|neyi|nedir|ne\s+kadar|ne\s+zaman|nasil|nasıl)\b/.test(lowerDeburr);

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

function detectScheduleUpdate(
  text: string,
  lower: string,
  lowerDeburr: string,
  ctx: AIContext,
): AIResponse | null {
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

  if (days.length > 0 && /(kaldir|kaldır|cikar|çıkar|iptal|kaldirilsin|kaldırılsın)/.test(lowerDeburr)) {
    return {
      kind: 'schedule_update',
      action: 'remove_day',
      params: { day: days[0] },
      explanation: `${days[0]} günü programdan kaldırılacak. Uygulamak için onaylayın.`,
      confidence: 0.75,
    };
  }

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


function detectDataMutation(
  text: string,
  lower: string,
  lowerDeburr: string,
  ctx: AIContext,
): AIResponse | null {
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

  const allYearMatch = /(tum|tüm)\s*(\d{1,2})\.?\s*(sinif|sınıf)/i.exec(text);
  if (
    allYearMatch &&
    /(\d+)\s*saat/i.test(text) &&
    /(ekle|ata|olsun|gir)/.test(lowerDeburr)
  ) {
    const yearNumber = allYearMatch[2]!;
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

  const mActivity =
    /(\d+)\s*saat\s+([\w\sığüşöçİĞÜŞÖÇ]+?)\s+(?:dersi|brans[ıi]|branş[ıi])/i.exec(
      text,
    ) ??
    /([\w\sığüşöçİĞÜŞÖÇ]+?)\s+(\d+)\s*saat/i.exec(text) ??
    null;
  if (
    mActivity &&
    /(ekle|ilave|atayalim|atayalım|ata|olsun|olur|yapilsin|yapılsın|gir)/.test(
      lowerDeburr,
    )
  ) {
    const hours = parseInt(
      mActivity[1] && /^\d+$/.test(mActivity[1]) ? mActivity[1] : mActivity[2]!,
      10,
    );
    const subjectNameRaw =
      mActivity[1] && /^\d+$/.test(mActivity[1])
        ? mActivity[2]!
        : mActivity[1]!;
    const subjectName = subjectNameRaw
      .trim()
      .replace(/\s+(dersi|brans[ıi]|branş[ıi])\s*$/i, '')
      .trim();

    const tm = fuzzyMatch(text, ctx.teachers);
    const classTokens = extractClassTokens(text);
    const matchedClasses = classTokens.filter((tok) =>
      ctx.classes.some((c) => deburr(c) === deburr(tok)),
    );
    const targetClasses = matchedClasses.length > 0 ? matchedClasses : classTokens;

    if (targetClasses.length > 0 && hours > 0) {
      const actions: DataMutationAction[] = [];
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
      if (tm.exact) {
        actions.push({
          op: 'link_teacher_subject',
          params: { teacher: tm.exact, subject: subjectName },
          description: `${tm.exact} öğretmenine "${subjectName}" yeterliliği ekle`,
        });
      }
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

  if (
    /(hoca|ogretmen|öğretmen)/.test(lower) &&
    /(ekle|ilave|olustur|oluştur)/.test(lowerDeburr) &&
    !/saat/.test(lower)
  ) {
    const tmExisting = fuzzyMatch(text, ctx.teachers);
    if (tmExisting.exact) {
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

  if (
    /(sinif|sınıf|şube|sube)/.test(lower) &&
    /(ekle|ilave|olustur|oluştur|ayir|ayır)/.test(lowerDeburr)
  ) {
    const names = extractClassTokens(text);
    if (names.length > 0) {
      const explicitYearMatch =
        /(\d{1,2})\.?\s*(kademe|sınıfa|sinifa|sınıfta|sinifta)/i.exec(text);
      const explicitYear = explicitYearMatch ? `${explicitYearMatch[1]}. Sınıf` : null;

      const actions: DataMutationAction[] = names.map((name) => {
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
  const beforeRe = new RegExp(
    `([\\wığüşöçİĞÜŞÖÇ.-]+(?:\\s+[\\wığüşöçİĞÜŞÖÇ.-]+){0,2})\\s+${keyword.source}`,
    'i',
  );
  const m = text.match(beforeRe);
  if (m && m[1]) {
    const candidate = m[1].trim();
    if (/^(yeni|ek|bir|bu|şu|o)$/i.test(candidate)) return null;
    return candidate;
  }
  return null;
}

function extractPersonName(text: string): string | null {
  const m = text.match(/([A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?:\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+)+)/);
  if (m && m[1]) return m[1].trim();
  const m2 = text.match(/([A-ZÇĞİÖŞÜ][a-zçğıöşü]{2,})/);
  if (m2 && m2[1]) return m2[1].trim();
  return null;
}

function extractSubjectList(text: string, ctx: AIContext): string[] {
  const anchorRe =
    /^(.+?)\s+(?:dersler(?:i(?:ni)?)?|dersini|dersi|brans(?:lar)?[ıi](?:n[ıi])?|branş(?:lar)?ı(?:nı)?)\s+(?:ekle|ilave|olustur|oluştur|sisteme\s+ekle|programa\s+ekle)/i;
  let head: string;
  const m = anchorRe.exec(text);
  if (m) {
    head = m[1]!;
  } else {
    const re2 = /^(.+?)\s+(?:ekle|ilave|olustur|oluştur)\b/i;
    const m2 = re2.exec(text);
    if (!m2) return [];
    head = m2[1]!;
  }

  head = head.replace(/^\s*(yeni|sisteme|programa|okula|musfredata|müfredata|ders\s+olarak)\s+/i, '').trim();

  const parts = head
    .split(/\s*,\s*|\s+ve\s+|\s+ile\s+|\s*;\s*/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

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
    token = token.replace(/\s+(dersi(?:ni)?|dersleri(?:ni)?|brans[ıi](?:n[ıi])?|branş[ıi](?:n[ıi])?)\s*$/i, '').trim();
    if (!token) continue;
    if (STOP.has(deburr(token).toLowerCase())) continue;

    const ctxMatch = ctx.subjects.find((s) => deburr(s) === deburr(token));
    if (ctxMatch) {
      if (!seen.has(ctxMatch)) {
        seen.add(ctxMatch);
        out.push(ctxMatch);
      }
      continue;
    }

    if (/^[A-ZÇĞİÖŞÜa-zçğıöşü][A-ZÇĞİÖŞÜa-zçğıöşü0-9 .'-]{1,30}$/.test(token)) {
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

export type { ConstraintType };


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

/** Bağlamdaki son-üretim-hatasını sade Türkçe bir teşhis cümlesine çevirir. */
function buildFailurePrefix(
  failure: NonNullable<AIContext['lastGenerationFailure']>,
): string {
  switch (failure.reason) {
    case 'NO_SOLUTION':
      return 'Son üretim başarısız oldu: FET tüm kısıtları aynı anda sağlayamadı (çözüm bulunamadı). ';
    case 'PARTIAL':
      return typeof failure.unplaced === 'number' && typeof failure.total === 'number'
        ? `Son üretimde ${failure.total} dersten ${failure.unplaced} tanesi yerleştirilemedi. `
        : 'Son üretim kısmen tamamlandı; bazı dersler yerleştirilemedi. ';
    case 'TIMEOUT':
      return 'Son üretim zaman aşımına uğradı — çözüm uzayı çok karmaşık. ';
    default:
      return `Son üretim başarısız oldu: ${failure.message} `;
  }
}

function detectRelaxRequest(
  lowerDeburr: string,
  ctx: AIContext,
): AIResponse | null {
  const failure = ctx.lastGenerationFailure ?? null;
  const isRelaxKeyword =
    /(gevset|gevşet|esnet|esnek|ağirlik\s+(dusur|düşür)|onem.{0,15}(dusur|düşür|azalt)|kisitlama.{0,15}(dusur|düşür|azalt))/.test(
      lowerDeburr,
    );
  const isFailureKeyword =
    /(cozum\s+bulunamadi|çözüm\s+bulunamadı|cozulmedi|çözülmedi|fet\s+hata|fet\s+olmadi|fet\s+olmadı|program(i|ı)?\s+(uret|üret).{0,20}(calismadi|çalışmadı|olmadi|olmadı)|oneri\s+ver|öneri\s+ver|nasil\s+cozeyim|nasıl\s+çözeyim)/.test(
      lowerDeburr,
    );
  // Bağlamda GERÇEK bir başarısızlık varsa, kullanıcının "neden / düzelt / çöz / yardım"
  // gibi kısa tepkilerinde de teşhis+çözüm üret. (Saf "üret" komutunu KAÇIRMA: bu kelimeler
  // run_solver tetikleyicileriyle örtüşmez.)
  const isFollowupOnFailure =
    failure != null &&
    /(\bneden\b|\bniye\b|nicin|niçin|olmadi|olmadı|olmuyor|duzelt|düzelt|\bcoz\b|\bçöz\b|yardim|yardım|ne\s+yap|nasil\s+(cozeyim|çözeyim|duzelt|düzelt|yapayim)|oneri|öneri)/.test(
      lowerDeburr,
    );
  if (!isRelaxKeyword && !isFailureKeyword && !isFollowupOnFailure) return null;

  // Pre-flight başarısızlıkları (veri eksik): gevşetme değil, ne ekleneceği rehberliği.
  if (failure) {
    const dataGuide: Record<string, string> = {
      NO_ACTIVITIES:
        'Henüz hiç ders ataması yok. Önce her sınıfa hangi dersten kaç saat verileceğini ekle (örn "9A sınıfına 5 saat Matematik ekle"), sonra tekrar üretelim.',
      NO_TEACHERS:
        'Henüz öğretmen tanımlı değil. Önce öğretmenleri ekleyelim (örn "Ahmet Yılmaz, Matematik öğretmeni ekle"), sonra üretiriz.',
      NO_CLASSES:
        'Henüz sınıf tanımlı değil. Önce sınıfları ekle (örn "9A, 9B, 10A sınıflarını ekle"), sonra üretelim.',
      NO_SCHEDULE:
        'Gün/saat planı eksik. Önce hangi günler ve günde kaç ders saati olduğunu belirle, sonra üretiriz.',
    };
    const guide = dataGuide[failure.reason];
    if (guide) {
      return { kind: 'query', answer: guide, confidence: 0.85 };
    }
  }

  const prefix = failure ? buildFailurePrefix(failure) : '';
  const list = (ctx.constraints ?? []).filter((c) => c.active && c.weight >= 90);

  if (list.length === 0) {
    const tail =
      'Şu an gevşetilebilecek katı kısıtlama yok (aktif tüm kısıtlamalar 90 altında). ' +
      'Muhtemel sebep ders dağıtımı: bir öğretmenin/sınıfın haftalık ders saati toplam slot sayısını aşıyor olabilir, ' +
      'ya da bir güne sığmayacak kadar çok ders var. Çözüm için günlere ders saati ekleyebilir (örn "Cuma gününe 1 saat ekle") ' +
      'veya bir sınıfın ders saatini azaltabilirsin. İstersen birlikte bakalım.';
    return {
      kind: 'query',
      answer: prefix + tail,
      confidence: 0.8,
    };
  }

  const top = [...list]
    .sort((a, b) => b.weight - a.weight || b.type.length - a.type.length)
    .slice(0, 5);

  const actions = top.map((c) => ({
    op: 'set_constraint_weight' as const,
    params: { constraintId: c.id, weight: 70 },
    description: `"${c.description}" → ağırlık ${c.weight} → 70 (esnek)`,
  }));

  const explanation =
    prefix +
    `Bunun en muhtemel sebebi, ağırlığı 100 (katı/zorunlu) olan ${list.length} kısıtlama. ` +
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

function detectPerClassSubjectRoom(
  text: string,
  lowerDeburr: string,
  ctx: AIContext,
): AIResponse | null {
  const isRoomAssign =
    /(salonunda|salonda|dersliginde|dersliğinde|odasinda|odasında|labinda|labında|atolyesinde|atölyesinde|laboratuvarinda|laboratuvarında)/.test(
      lowerDeburr,
    ) && /(yap|olsun|atan|alinsin|alınsın|isle|işle)/.test(lowerDeburr);
  if (!isRoomAssign) return null;
  if (/(olmasin|olmasın|yok\b|kapali|kapalı)/.test(lowerDeburr)) return null;

  let filterClass: string | null = null;
  let filterClassYear: string | null = null;

  const single = lowerDeburr.match(/\b(\d{1,2})\s*[\-/]?\s*([a-z])\b/);
  if (single) {
    filterClass = `${single[1]}${single[2]!.toUpperCase()}`;
  } else {
    const yr = lowerDeburr.match(/\b(\d{1,2})\.?\s*(sinif|sınıf|siniflar|sınıflar|siniflarin|sınıfların|siniflara|sınıflara)/);
    if (yr) filterClassYear = yr[1]!;
  }

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

  const classMatch = lowerDeburr.match(/\b(\d{1,2})\s*([a-z])\b/);
  let className: string | null = null;
  if (classMatch) {
    className = `${classMatch[1]}${classMatch[2]!.toUpperCase()}`;
  } else {
    const fz = fuzzyMatch(text, ctx.classes);
    if (fz.exact) className = fz.exact;
  }
  if (!className) return null;

  const subjects = extractSubjectList(text, ctx);
  if (subjects.length < 2) {
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

  const classMatch = lowerDeburr.match(/\b(\d{1,2})\s*([a-z])\b/);
  if (!classMatch) return null;
  const className = `${classMatch[1]}${classMatch[2]!.toUpperCase()}`;

  let day: string | null = null;
  for (const [key, full] of Object.entries(DAY_NORMALIZE)) {
    if (lowerDeburr.includes(key)) {
      day = full;
      break;
    }
  }
  if (!day) return null;

  const hourMatch = text.match(/(\d{1,2})\.?\s*(?:ders|saat)/);
  if (!hourMatch) return null;
  const hour = parseInt(hourMatch[1]!, 10);
  if (!Number.isFinite(hour) || hour < 1 || hour > 20) return null;

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

  const subj = fuzzyMatch(text, ctx.subjects);
  if (!subj.exact) return null;

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

  const newTeacher = teachers[teachers.length - 1]!;
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

function detectSwapSlots(
  text: string,
  lowerDeburr: string,
  _ctx: AIContext,
): AIResponse | null {
  const hasSwap =
    /(yer\s+degis|yer\s+değiş|swap|degistir|değiştir).*(slot|ders|saat)/.test(lowerDeburr) ||
    /(ile|le|la).*(yer\s+degis|yer\s+değiş)/.test(lowerDeburr);
  if (!hasSwap) return null;

  const classMatches = [...lowerDeburr.matchAll(/\b(\d{1,2})\s*([a-z])\b/g)];
  if (classMatches.length < 1) return null;

  const days: string[] = [];
  for (const [key, full] of Object.entries(DAY_NORMALIZE)) {
    if (lowerDeburr.includes(key)) {
      if (!days.includes(full)) days.push(full);
    }
  }
  if (days.length < 2) return null;

  const hourMatches = [...text.matchAll(/(\d{1,2})\.?\s*(?:ders|saat)/g)];
  if (hourMatches.length < 2) return null;
  const hours = hourMatches.slice(0, 2).map((m) => parseInt(m[1]!, 10));
  if (hours.some((h) => !Number.isFinite(h) || h < 1 || h > 20)) return null;

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

function detectNavigate(text: string, lowerDeburr: string): AIResponse | null {
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
