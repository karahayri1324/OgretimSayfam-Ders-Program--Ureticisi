
import type { Constraint, ConstraintType } from '../../../src/lib/types.js';
import type { BuilderContext, SkippedConstraint } from '../types.js';

export type ConstraintSection = 'time' | 'space';

export type ConstraintNode = {
  section: ConstraintSection;
  tag: string;
  body: Record<string, unknown>;
};

export type HandlerResult = ConstraintNode[] | null;


function skip(ctx: BuilderContext, c: Constraint, reason: string): null {
  ctx.skipped.push({ constraintId: c.id, type: c.type, reason });
  return null;
}

function getStr(params: Record<string, unknown>, key: string): string | null {
  const v = params[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function getNum(params: Record<string, unknown>, key: string): number | null {
  const v = params[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
}

function getArr(params: Record<string, unknown>, key: string): unknown[] {
  const v = params[key];
  return Array.isArray(v) ? v : [];
}

type FetSlot = { Day: string; Hour: string };
type FetPreferredSlot = { Preferred_Day: string; Preferred_Hour: string };

function toPreferredSlots(slots: FetSlot[]): FetPreferredSlot[] {
  return slots.map((s) => ({ Preferred_Day: s.Day, Preferred_Hour: s.Hour }));
}

function expandSlots(
  raw: unknown[],
  ctx: BuilderContext,
): { slots: FetSlot[]; unknownDays: string[]; unknownHours: number[] } {
  const slots: FetSlot[] = [];
  const unknownDays = new Set<string>();
  const unknownHours = new Set<number>();

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as { day?: unknown; hour?: unknown };
    const dayNames: string[] = [];
    if (obj.day === null || obj.day === undefined) {
      for (const d of ctx.days) dayNames.push(d.name);
    } else if (typeof obj.day === 'string') {
      const dayObj = ctx.dayByName.get(obj.day);
      if (!dayObj) {
        unknownDays.add(obj.day);
        continue;
      }
      dayNames.push(dayObj.name);
    }

    const hours: number[] = [];
    if (obj.hour === null || obj.hour === undefined) {
      for (let i = 1; i <= ctx.hours.length; i++) hours.push(i);
    } else {
      // hour numeric VEYA numerik-string olabilir (constraint params z.record(z.any()) olduğundan
      // SlotSchema'nın hour:number'ı hiç zorlanmıyor). getNum gibi coerce et; aksi halde '3' gibi
      // string saat ikisi de eşleşmeyip hours boş kalıyor, not-available/teneffüs/tercih kısıtı
      // sessizce düşüyordu (#1).
      const hv =
        typeof obj.hour === 'number'
          ? obj.hour
          : typeof obj.hour === 'string' &&
              obj.hour.trim() !== '' &&
              !Number.isNaN(Number(obj.hour))
            ? Number(obj.hour)
            : NaN;
      if (!Number.isFinite(hv) || !ctx.hourByOrder.has(hv)) {
        if (Number.isFinite(hv)) unknownHours.add(hv);
        continue;
      }
      hours.push(hv);
    }

    for (const d of dayNames) {
      for (const h of hours) {
        const hourObj = ctx.hourByOrder.get(h);
        if (!hourObj) continue;
        slots.push({ Day: d, Hour: hourObj.name });
      }
    }
  }
  return {
    slots,
    unknownDays: [...unknownDays],
    unknownHours: [...unknownHours],
  };
}

function commonTail(c: Constraint): { Active: boolean; Comments: string } {
  return { Active: c.active, Comments: c.notes ?? '' };
}


function teacherNotAvailable(c: Constraint, ctx: BuilderContext): HandlerResult {
  const name = getStr(c.params, 'teacher');
  if (!name) return skip(ctx, c, 'teacher alanı boş');
  if (!ctx.teacherByName.has(name)) return skip(ctx, c, `Bilinmeyen öğretmen: "${name}"`);
  const rawSlots = getArr(c.params, 'slots');
  if (rawSlots.length === 0) return skip(ctx, c, 'slots boş');
  const { slots, unknownDays, unknownHours } = expandSlots(rawSlots, ctx);
  if (slots.length === 0) {
    return skip(
      ctx,
      c,
      `Geçerli slot bulunamadı (bilinmeyen gün: ${unknownDays.join(',')}; saat: ${unknownHours.join(',')})`,
    );
  }
  return [{
    section: 'time',
    tag: 'ConstraintTeacherNotAvailableTimes',
    body: {
      Weight_Percentage: c.weight,
      Teacher: name,
      Number_of_Not_Available_Times: slots.length,
      Not_Available_Time: slots,
      ...commonTail(c),
    },
  }];
}

function teacherMaxDaysPerWeek(c: Constraint, ctx: BuilderContext): HandlerResult {
  const name = getStr(c.params, 'teacher');
  if (!name) return skip(ctx, c, 'teacher alanı boş');
  if (!ctx.teacherByName.has(name)) return skip(ctx, c, `Bilinmeyen öğretmen: "${name}"`);
  const max = getNum(c.params, 'maxDays');
  if (max === null) return skip(ctx, c, 'maxDays eksik');
  return [{
    section: 'time',
    tag: 'ConstraintTeacherMaxDaysPerWeek',
    body: {
      Weight_Percentage: c.weight,
      Max_Days_Per_Week: Math.floor(max),
      Teacher_Name: name,
      ...commonTail(c),
    },
  }];
}

function teacherMaxHoursDaily(c: Constraint, ctx: BuilderContext): HandlerResult {
  const name = getStr(c.params, 'teacher');
  if (!name) return skip(ctx, c, 'teacher alanı boş');
  if (!ctx.teacherByName.has(name)) return skip(ctx, c, `Bilinmeyen öğretmen: "${name}"`);
  const max = getNum(c.params, 'maxHours');
  if (max === null) return skip(ctx, c, 'maxHours eksik');
  return [{
    section: 'time',
    tag: 'ConstraintTeacherMaxHoursDaily',
    body: {
      Weight_Percentage: c.weight,
      Teacher_Name: name,
      Maximum_Hours_Daily: Math.floor(max),
      ...commonTail(c),
    },
  }];
}

function teacherMaxGapsPerDay(c: Constraint, ctx: BuilderContext): HandlerResult {
  const name = getStr(c.params, 'teacher');
  if (!name) return skip(ctx, c, 'teacher alanı boş');
  if (!ctx.teacherByName.has(name)) return skip(ctx, c, `Bilinmeyen öğretmen: "${name}"`);
  const max = getNum(c.params, 'maxGaps');
  if (max === null) return skip(ctx, c, 'maxGaps eksik');
  return [{
    section: 'time',
    tag: 'ConstraintTeacherMaxGapsPerDay',
    body: {
      Weight_Percentage: c.weight,
      Max_Gaps: Math.floor(max),
      Teacher_Name: name,
      ...commonTail(c),
    },
  }];
}

function teacherMaxGapsPerWeek(c: Constraint, ctx: BuilderContext): HandlerResult {
  const name = getStr(c.params, 'teacher');
  if (!name) return skip(ctx, c, 'teacher alanı boş');
  if (!ctx.teacherByName.has(name)) return skip(ctx, c, `Bilinmeyen öğretmen: "${name}"`);
  const max = getNum(c.params, 'maxGaps');
  if (max === null) return skip(ctx, c, 'maxGaps eksik');
  return [{
    section: 'time',
    tag: 'ConstraintTeacherMaxGapsPerWeek',
    body: {
      Weight_Percentage: c.weight,
      Max_Gaps: Math.floor(max),
      Teacher_Name: name,
      ...commonTail(c),
    },
  }];
}

function teachersMaxGapsPerWeek(c: Constraint, ctx: BuilderContext): HandlerResult {
  const max = getNum(c.params, 'maxGaps');
  if (max === null) return skip(ctx, c, 'maxGaps eksik');
  return [{
    section: 'time',
    tag: 'ConstraintTeachersMaxGapsPerWeek',
    body: {
      Weight_Percentage: c.weight,
      Max_Gaps: Math.floor(max),
      ...commonTail(c),
    },
  }];
}


function classNotAvailable(c: Constraint, ctx: BuilderContext): HandlerResult {
  const cls = getStr(c.params, 'class');
  const targetClassNames: string[] = cls
    ? [cls]
    : ctx.classes.map((k) => k.name);
  if (cls && !ctx.classByName.has(cls)) {
    return skip(ctx, c, `Bilinmeyen sınıf: "${cls}"`);
  }
  if (targetClassNames.length === 0) {
    return skip(ctx, c, 'Hedef sınıf yok (class alanı boş ve sistemde sınıf tanımlı değil)');
  }
  const rawSlots = getArr(c.params, 'slots');
  if (rawSlots.length === 0) return skip(ctx, c, 'slots boş');
  const { slots, unknownDays, unknownHours } = expandSlots(rawSlots, ctx);
  if (slots.length === 0) {
    return skip(
      ctx,
      c,
      `Geçerli slot bulunamadı (bilinmeyen gün: ${unknownDays.join(',')}; saat: ${unknownHours.join(',')})`,
    );
  }
  return targetClassNames.map((name) => ({
    section: 'time' as const,
    tag: 'ConstraintStudentsSetNotAvailableTimes',
    body: {
      Weight_Percentage: c.weight,
      Students: name,
      Number_of_Not_Available_Times: slots.length,
      Not_Available_Time: slots,
      ...commonTail(c),
    },
  }));
}

function classMaxGapsPerWeek(c: Constraint, ctx: BuilderContext): HandlerResult {
  const cls = getStr(c.params, 'class');
  if (!cls) return skip(ctx, c, 'class alanı boş');
  if (!ctx.classByName.has(cls)) return skip(ctx, c, `Bilinmeyen sınıf: "${cls}"`);
  const max = getNum(c.params, 'maxGaps');
  if (max === null) return skip(ctx, c, 'maxGaps eksik');
  return [{
    section: 'time',
    tag: 'ConstraintStudentsSetMaxGapsPerWeek',
    body: {
      Weight_Percentage: c.weight,
      Max_Gaps: Math.floor(max),
      Students: cls,
      ...commonTail(c),
    },
  }];
}


function activitiesForSubject(
  ctx: BuilderContext,
  subjectName: string,
  className: string | null,
): { dbIds: number[]; fetIds: number[] } {
  const subj = ctx.subjectByName.get(subjectName);
  if (!subj) return { dbIds: [], fetIds: [] };
  const cls = className ? ctx.classByName.get(className) : null;
  const dbIds: number[] = [];
  const fetIds: number[] = [];
  for (const a of ctx.activities) {
    if (a.subjectId !== subj.id) continue;
    if (className && (!cls || a.classId !== cls.id)) continue;
    dbIds.push(a.id);
    const expanded = ctx.fetActivityIdsByActivity.get(a.id) ?? [];
    fetIds.push(...expanded);
  }
  return { dbIds, fetIds };
}

function subjectNotOnDay(c: Constraint, ctx: BuilderContext): HandlerResult {
  const subj = getStr(c.params, 'subject');
  if (!subj) return skip(ctx, c, 'subject alanı boş');
  if (!ctx.subjectByName.has(subj)) return skip(ctx, c, `Bilinmeyen ders: "${subj}"`);
  const cls = getStr(c.params, 'class');
  if (cls && !ctx.classByName.has(cls)) return skip(ctx, c, `Bilinmeyen sınıf: "${cls}"`);
  const days = getArr(c.params, 'days')
    .filter((d): d is string => typeof d === 'string')
    .map(d => d.trim());
  if (days.length === 0) return skip(ctx, c, 'days boş');

  const unknownDays = days.filter(d => !ctx.dayByName.has(d));
  if (unknownDays.length > 0) {
    return skip(ctx, c, `Bilinmeyen gün(ler): ${unknownDays.join(', ')}`);
  }

  const { fetIds } = activitiesForSubject(ctx, subj, cls);
  if (fetIds.length === 0) {
    return skip(ctx, c, `Eşleşen aktivite bulunamadı (subject="${subj}", class="${cls ?? '*'}")`);
  }

  const allowedSlots: FetSlot[] = [];
  for (const d of ctx.days) {
    if (days.includes(d.name)) continue;
    for (const h of ctx.hours) {
      allowedSlots.push({ Day: d.name, Hour: h.name });
    }
  }

  const preferredAllowed = toPreferredSlots(allowedSlots);
  return fetIds.map(id => ({
    section: 'time' as const,
    tag: 'ConstraintActivityPreferredTimeSlots',
    body: {
      Weight_Percentage: c.weight,
      Activity_Id: id,
      Number_of_Preferred_Time_Slots: preferredAllowed.length,
      Preferred_Time_Slot: preferredAllowed,
      ...commonTail(c),
    },
  }));
}

function subjectPreferredHours(c: Constraint, ctx: BuilderContext): HandlerResult {
  const subj = getStr(c.params, 'subject');
  if (!subj) return skip(ctx, c, 'subject alanı boş');
  if (!ctx.subjectByName.has(subj)) return skip(ctx, c, `Bilinmeyen ders: "${subj}"`);
  const cls = getStr(c.params, 'class');
  if (cls && !ctx.classByName.has(cls)) return skip(ctx, c, `Bilinmeyen sınıf: "${cls}"`);

  const prefRaw = getArr(c.params, 'preferredHours')
    .map(v => (typeof v === 'number' ? v : Number(v)))
    .filter(v => Number.isFinite(v));
  if (prefRaw.length === 0) return skip(ctx, c, 'preferredHours boş');

  const validHours = prefRaw.filter(h => ctx.hourByOrder.has(h));
  if (validHours.length === 0) return skip(ctx, c, 'Geçerli saat yok');

  const slots: FetSlot[] = [];
  for (const d of ctx.days) {
    for (const h of validHours) {
      const hourObj = ctx.hourByOrder.get(h);
      if (hourObj) slots.push({ Day: d.name, Hour: hourObj.name });
    }
  }

  const preferredSlots = toPreferredSlots(slots);

  // FET'te sınıfsız "ders X şu saatlerde" için geçerli bir tag yoktur
  // (ConstraintSubjectPreferredTimeSlots tanımsızdır → fet-cl yok sayar). Dersin TÜM
  // aktivitelerini (sınıf verilmişse yalnız o sınıfınkini) per-aktivite kısıtla.
  const { fetIds } = activitiesForSubject(ctx, subj, cls);
  if (fetIds.length === 0) return skip(ctx, c, 'Eşleşen aktivite yok');
  return fetIds.map(id => ({
    section: 'time' as const,
    tag: 'ConstraintActivityPreferredTimeSlots',
    body: {
      Weight_Percentage: c.weight,
      Activity_Id: id,
      Number_of_Preferred_Time_Slots: preferredSlots.length,
      Preferred_Time_Slot: preferredSlots,
      ...commonTail(c),
    },
  }));
}

function subjectLastHourOfDay(c: Constraint, ctx: BuilderContext): HandlerResult {
  const subj = getStr(c.params, 'subject');
  if (!subj) return skip(ctx, c, 'subject alanı boş');
  if (!ctx.subjectByName.has(subj)) return skip(ctx, c, `Bilinmeyen ders: "${subj}"`);
  const cls = getStr(c.params, 'class');
  if (cls && !ctx.classByName.has(cls)) return skip(ctx, c, `Bilinmeyen sınıf: "${cls}"`);

  const { fetIds } = activitiesForSubject(ctx, subj, cls);
  if (fetIds.length === 0) return skip(ctx, c, 'Eşleşen aktivite yok');

  return fetIds.map(id => ({
    section: 'time' as const,
    tag: 'ConstraintActivityEndsStudentsDay',
    body: {
      Weight_Percentage: c.weight,
      Activity_Id: id,
      ...commonTail(c),
    },
  }));
}

function subjectMaxHoursDaily(c: Constraint, ctx: BuilderContext): HandlerResult {
  const subj = getStr(c.params, 'subject');
  if (!subj) return skip(ctx, c, 'subject alanı boş');
  if (!ctx.subjectByName.has(subj)) return skip(ctx, c, `Bilinmeyen ders: "${subj}"`);
  const cls = getStr(c.params, 'class');
  if (cls && !ctx.classByName.has(cls)) return skip(ctx, c, `Bilinmeyen sınıf: "${cls}"`);
  const max = getNum(c.params, 'maxHours');
  if (max === null) return skip(ctx, c, 'maxHours eksik');

  const { fetIds } = activitiesForSubject(ctx, subj, cls);
  if (fetIds.length === 0) return skip(ctx, c, 'Eşleşen aktivite yok');

  // FET'te bir aktivite KÜMESİ için doğrudan "günde azami saat" kısıtı yoktur
  // (ConstraintActivitiesMaxHoursDaily geçersiz tag; FET yalnız teacher/students-set/activity-tag
  // bazlı destekler). Activity-tag altyapısı gerektirir → geçersiz XML üretmek yerine temiz atla.
  return skip(ctx, c, `FET ders-bazlı günlük azami saat kısıtını doğrudan desteklemiyor (maxHours=${Math.floor(max)})`);
}

function subjectConsecutiveHours(c: Constraint, ctx: BuilderContext): HandlerResult {
  const subj = getStr(c.params, 'subject');
  if (!subj) return skip(ctx, c, 'subject alanı boş');
  if (!ctx.subjectByName.has(subj)) return skip(ctx, c, `Bilinmeyen ders: "${subj}"`);
  const cls = getStr(c.params, 'class');
  if (cls && !ctx.classByName.has(cls)) return skip(ctx, c, `Bilinmeyen sınıf: "${cls}"`);

  // Ardışıklık aynı sınıfın aynı dersinin ALT-aktiviteleri (blok parçaları) için anlamlıdır.
  // Eski kod sınıf belirtilmediğinde TÜM sınıfların fetId'lerini düz bir listede (i,i+1) eşleştirip
  // farklı sınıfların alakasız derslerini ardışık olmaya zorluyordu (rastgele, çoğu zaman çözümsüz) (#2).
  // Çiftlemeyi her aktivitenin yalnız kendi alt-aktiviteleri içinde yap.
  const subjObj = ctx.subjectByName.get(subj)!;
  const clsObj = cls ? ctx.classByName.get(cls) : null;
  const pairs: ConstraintNode[] = [];
  for (const a of ctx.activities) {
    if (a.subjectId !== subjObj.id) continue;
    if (clsObj && a.classId !== clsObj.id) continue;
    const ids = ctx.fetActivityIdsByActivity.get(a.id) ?? [];
    for (let i = 0; i + 1 < ids.length; i += 2) {
      pairs.push({
        section: 'time',
        tag: 'ConstraintTwoActivitiesConsecutive',
        body: {
          Weight_Percentage: c.weight,
          First_Activity_Id: ids[i],
          Second_Activity_Id: ids[i + 1],
          ...commonTail(c),
        },
      });
    }
  }
  if (pairs.length === 0) {
    return skip(ctx, c, 'Ardışıklık için aynı sınıf+derste en az 2 alt-aktivite (blok) gerekli');
  }
  return pairs;
}


function roomNotAvailable(c: Constraint, ctx: BuilderContext): HandlerResult {
  const room = getStr(c.params, 'room');
  if (!room) return skip(ctx, c, 'room alanı boş');
  if (!ctx.roomByName.has(room)) return skip(ctx, c, `Bilinmeyen derslik: "${room}"`);
  const rawSlots = getArr(c.params, 'slots');
  if (rawSlots.length === 0) return skip(ctx, c, 'slots boş');
  const { slots, unknownDays, unknownHours } = expandSlots(rawSlots, ctx);
  if (slots.length === 0) {
    return skip(
      ctx,
      c,
      `Geçerli slot bulunamadı (bilinmeyen gün: ${unknownDays.join(',')}; saat: ${unknownHours.join(',')})`,
    );
  }
  return [{
    section: 'space',
    tag: 'ConstraintRoomNotAvailableTimes',
    body: {
      Weight_Percentage: c.weight,
      Room: room,
      Number_of_Not_Available_Times: slots.length,
      Not_Available_Time: slots,
      ...commonTail(c),
    },
  }];
}

function subjectPreferredRoom(c: Constraint, ctx: BuilderContext): HandlerResult {
  const subj = getStr(c.params, 'subject');
  if (!subj) return skip(ctx, c, 'subject alanı boş');
  if (!ctx.subjectByName.has(subj)) return skip(ctx, c, `Bilinmeyen ders: "${subj}"`);
  const room = getStr(c.params, 'room');
  if (!room) return skip(ctx, c, 'room alanı boş');
  if (!ctx.roomByName.has(room)) return skip(ctx, c, `Bilinmeyen derslik: "${room}"`);
  return [{
    section: 'space',
    tag: 'ConstraintSubjectPreferredRoom',
    body: {
      Weight_Percentage: c.weight,
      Subject: subj,
      Room: room,
      ...commonTail(c),
    },
  }];
}

function teacherHomeRoom(c: Constraint, ctx: BuilderContext): HandlerResult {
  const name = getStr(c.params, 'teacher');
  if (!name) return skip(ctx, c, 'teacher alanı boş');
  if (!ctx.teacherByName.has(name)) return skip(ctx, c, `Bilinmeyen öğretmen: "${name}"`);
  const room = getStr(c.params, 'room');
  if (!room) return skip(ctx, c, 'room alanı boş');
  if (!ctx.roomByName.has(room)) return skip(ctx, c, `Bilinmeyen derslik: "${room}"`);
  return [{
    section: 'space',
    tag: 'ConstraintTeacherHomeRoom',
    body: {
      Weight_Percentage: c.weight,
      Teacher: name,
      Room: room,
      ...commonTail(c),
    },
  }];
}

function classHomeRoom(c: Constraint, ctx: BuilderContext): HandlerResult {
  const cls = getStr(c.params, 'class');
  if (!cls) return skip(ctx, c, 'class alanı boş');
  if (!ctx.classByName.has(cls)) return skip(ctx, c, `Bilinmeyen sınıf: "${cls}"`);
  const room = getStr(c.params, 'room');
  if (!room) return skip(ctx, c, 'room alanı boş');
  if (!ctx.roomByName.has(room)) return skip(ctx, c, `Bilinmeyen derslik: "${room}"`);
  return [{
    section: 'space',
    tag: 'ConstraintStudentsSetHomeRoom',
    body: {
      Weight_Percentage: c.weight,
      Students: cls,
      Room: room,
      ...commonTail(c),
    },
  }];
}


function teacherMinHoursDaily(c: Constraint, ctx: BuilderContext): HandlerResult {
  const name = getStr(c.params, 'teacher');
  if (!name) return skip(ctx, c, 'teacher alanı boş');
  if (!ctx.teacherByName.has(name)) return skip(ctx, c, `Bilinmeyen öğretmen: "${name}"`);
  const min = getNum(c.params, 'minHours');
  if (min === null) return skip(ctx, c, 'minHours eksik');
  // FET, "boş günlere izinli" min-günlük-saat kısıtında değerin >=2 olmasını ŞART koşar; <2 ise
  // fet-cl "data is wrong" deyip TÜM üretimi abort eder (e2e ile doğrulandı). min<2 zaten önemsiz
  // (çalışılan günde >=1 saat daima sağlanır) → üretimi kilitleyen XML yerine temiz atla.
  if (Math.floor(min) < 2) {
    return skip(ctx, c, `FET min-günlük-saat kısıtı için >=2 ister (verilen=${Math.floor(min)}); 1 zaten daima sağlandığından atlandı`);
  }
  return [{
    section: 'time',
    tag: 'ConstraintTeacherMinHoursDaily',
    body: {
      Weight_Percentage: c.weight,
      Teacher_Name: name,
      Minimum_Hours_Daily: Math.floor(min),
      Allow_Empty_Days: true,
      ...commonTail(c),
    },
  }];
}

function teacherNotAvailableInterval(c: Constraint, ctx: BuilderContext): HandlerResult {
  const name = getStr(c.params, 'teacher');
  if (!name) return skip(ctx, c, 'teacher alanı boş');
  if (!ctx.teacherByName.has(name)) return skip(ctx, c, `Bilinmeyen öğretmen: "${name}"`);
  const day = getStr(c.params, 'day');
  const start = getNum(c.params, 'startHour');
  const end = getNum(c.params, 'endHour');
  if (!day || start === null || end === null) return skip(ctx, c, 'day/startHour/endHour eksik');
  if (!ctx.dayByName.has(day)) return skip(ctx, c, `Bilinmeyen gün: "${day}"`);
  const slots: FetSlot[] = [];
  for (let h = Math.floor(start); h <= Math.floor(end); h++) {
    const hourObj = ctx.hourByOrder.get(h);
    if (hourObj) slots.push({ Day: day, Hour: hourObj.name });
  }
  if (slots.length === 0) return skip(ctx, c, 'Geçerli saat aralığı yok');
  return [{
    section: 'time',
    tag: 'ConstraintTeacherNotAvailableTimes',
    body: {
      Weight_Percentage: c.weight,
      Teacher: name,
      Number_of_Not_Available_Times: slots.length,
      Not_Available_Time: slots,
      ...commonTail(c),
    },
  }];
}

function teacherMinDaysPerWeek(c: Constraint, ctx: BuilderContext): HandlerResult {
  const name = getStr(c.params, 'teacher');
  if (!name) return skip(ctx, c, 'teacher alanı boş');
  if (!ctx.teacherByName.has(name)) return skip(ctx, c, `Bilinmeyen öğretmen: "${name}"`);
  const min = getNum(c.params, 'minDays');
  if (min === null) return skip(ctx, c, 'minDays eksik');
  return [{
    section: 'time',
    tag: 'ConstraintTeacherMinDaysPerWeek',
    body: {
      Weight_Percentage: c.weight,
      Teacher_Name: name,
      Minimum_Days_Per_Week: Math.floor(min),
      ...commonTail(c),
    },
  }];
}

function teacherMaxHoursContinuously(c: Constraint, ctx: BuilderContext): HandlerResult {
  const name = getStr(c.params, 'teacher');
  if (!name) return skip(ctx, c, 'teacher alanı boş');
  if (!ctx.teacherByName.has(name)) return skip(ctx, c, `Bilinmeyen öğretmen: "${name}"`);
  const max = getNum(c.params, 'maxHours');
  if (max === null) return skip(ctx, c, 'maxHours eksik');
  return [{
    section: 'time',
    tag: 'ConstraintTeacherMaxHoursContinuously',
    body: {
      Weight_Percentage: c.weight,
      Teacher_Name: name,
      Maximum_Hours_Continuously: Math.floor(max),
      ...commonTail(c),
    },
  }];
}

function teacherMaxBuildingChangesPerDay(c: Constraint, ctx: BuilderContext): HandlerResult {
  const name = getStr(c.params, 'teacher');
  if (!name) return skip(ctx, c, 'teacher alanı boş');
  if (!ctx.teacherByName.has(name)) return skip(ctx, c, `Bilinmeyen öğretmen: "${name}"`);
  const max = getNum(c.params, 'maxChanges');
  if (max === null) return skip(ctx, c, 'maxChanges eksik');
  return [{
    section: 'space',
    tag: 'ConstraintTeacherMaxBuildingChangesPerDay',
    body: {
      Weight_Percentage: c.weight,
      Teacher: name,
      Max_Building_Changes_Per_Day: Math.floor(max),
      ...commonTail(c),
    },
  }];
}

function teacherMaxBuildingChangesPerWeek(c: Constraint, ctx: BuilderContext): HandlerResult {
  const name = getStr(c.params, 'teacher');
  if (!name) return skip(ctx, c, 'teacher alanı boş');
  if (!ctx.teacherByName.has(name)) return skip(ctx, c, `Bilinmeyen öğretmen: "${name}"`);
  const max = getNum(c.params, 'maxChanges');
  if (max === null) return skip(ctx, c, 'maxChanges eksik');
  return [{
    section: 'space',
    tag: 'ConstraintTeacherMaxBuildingChangesPerWeek',
    body: {
      Weight_Percentage: c.weight,
      Teacher: name,
      Max_Building_Changes_Per_Week: Math.floor(max),
      ...commonTail(c),
    },
  }];
}

function teacherMinGapsBetweenBuildingChanges(c: Constraint, ctx: BuilderContext): HandlerResult {
  const name = getStr(c.params, 'teacher');
  if (!name) return skip(ctx, c, 'teacher alanı boş');
  if (!ctx.teacherByName.has(name)) return skip(ctx, c, `Bilinmeyen öğretmen: "${name}"`);
  const min = getNum(c.params, 'minGaps');
  if (min === null) return skip(ctx, c, 'minGaps eksik');
  return [{
    section: 'space',
    tag: 'ConstraintTeacherMinGapsBetweenBuildingChanges',
    body: {
      Weight_Percentage: c.weight,
      Teacher: name,
      Min_Gaps_Between_Building_Changes: Math.floor(min),
      ...commonTail(c),
    },
  }];
}

function teacherNotFirstHour(c: Constraint, ctx: BuilderContext): HandlerResult {
  const name = getStr(c.params, 'teacher');
  if (!name) return skip(ctx, c, 'teacher alanı boş');
  if (!ctx.teacherByName.has(name)) return skip(ctx, c, `Bilinmeyen öğretmen: "${name}"`);
  const firstHour = ctx.hourByOrder.get(1);
  if (!firstHour) return skip(ctx, c, 'İlk ders saati tanımsız');
  const slots: FetSlot[] = ctx.days.map((d) => ({ Day: d.name, Hour: firstHour.name }));
  return [{
    section: 'time',
    tag: 'ConstraintTeacherNotAvailableTimes',
    body: {
      Weight_Percentage: c.weight,
      Teacher: name,
      Number_of_Not_Available_Times: slots.length,
      Not_Available_Time: slots,
      ...commonTail(c),
    },
  }];
}

function teacherNotLastHour(c: Constraint, ctx: BuilderContext): HandlerResult {
  const name = getStr(c.params, 'teacher');
  if (!name) return skip(ctx, c, 'teacher alanı boş');
  if (!ctx.teacherByName.has(name)) return skip(ctx, c, `Bilinmeyen öğretmen: "${name}"`);
  const lastHour = ctx.hours[ctx.hours.length - 1];
  if (!lastHour) return skip(ctx, c, 'Son ders saati tanımsız');
  const slots: FetSlot[] = ctx.days.map((d) => ({ Day: d.name, Hour: lastHour.name }));
  return [{
    section: 'time',
    tag: 'ConstraintTeacherNotAvailableTimes',
    body: {
      Weight_Percentage: c.weight,
      Teacher: name,
      Number_of_Not_Available_Times: slots.length,
      Not_Available_Time: slots,
      ...commonTail(c),
    },
  }];
}

function teacherMinRestBetweenDays(c: Constraint, ctx: BuilderContext): HandlerResult {
  const name = getStr(c.params, 'teacher');
  if (!name) return skip(ctx, c, 'teacher alanı boş');
  if (!ctx.teacherByName.has(name)) return skip(ctx, c, `Bilinmeyen öğretmen: "${name}"`);
  const minRest = getNum(c.params, 'minRestHours');
  if (minRest === null) return skip(ctx, c, 'minRestHours eksik');
  const totalHours = ctx.hours.length;
  const k = Math.min(Math.floor(minRest), totalHours);
  if (k <= 0) return skip(ctx, c, 'minRestHours geçersiz');
  const eveningBlock = Math.ceil(k / 2);
  const morningBlock = Math.floor(k / 2);
  const days = ctx.days;
  const seen = new Set<string>();
  const slots: FetSlot[] = [];
  const push = (dayName: string, hourName: string): void => {
    const key = `${dayName}|${hourName}`;
    if (seen.has(key)) return;
    seen.add(key);
    slots.push({ Day: dayName, Hour: hourName });
  };
  for (let di = 0; di < days.length; di++) {
    const d = days[di]!;
    if (di < days.length - 1) {
      for (let i = 0; i < eveningBlock; i++) {
        const hourObj = ctx.hours[totalHours - 1 - i];
        if (hourObj) push(d.name, hourObj.name);
      }
    }
    if (di > 0) {
      for (let i = 0; i < morningBlock; i++) {
        const hourObj = ctx.hours[i];
        if (hourObj) push(d.name, hourObj.name);
      }
    }
  }
  if (slots.length === 0) return skip(ctx, c, 'Geçerli slot yok');
  return [{
    section: 'time',
    tag: 'ConstraintTeacherNotAvailableTimes',
    body: {
      Weight_Percentage: c.weight,
      Teacher: name,
      Number_of_Not_Available_Times: slots.length,
      Not_Available_Time: slots,
      ...commonTail(c),
    },
  }];
}


function classMaxHoursDaily(c: Constraint, ctx: BuilderContext): HandlerResult {
  const cls = getStr(c.params, 'class');
  if (!cls) return skip(ctx, c, 'class alanı boş');
  if (!ctx.classByName.has(cls)) return skip(ctx, c, `Bilinmeyen sınıf: "${cls}"`);
  const max = getNum(c.params, 'maxHours');
  if (max === null) return skip(ctx, c, 'maxHours eksik');
  return [{
    section: 'time',
    tag: 'ConstraintStudentsSetMaxHoursDaily',
    body: {
      Weight_Percentage: c.weight,
      Students: cls,
      Maximum_Hours_Daily: Math.floor(max),
      ...commonTail(c),
    },
  }];
}

function classMinHoursDaily(c: Constraint, ctx: BuilderContext): HandlerResult {
  const cls = getStr(c.params, 'class');
  if (!cls) return skip(ctx, c, 'class alanı boş');
  if (!ctx.classByName.has(cls)) return skip(ctx, c, `Bilinmeyen sınıf: "${cls}"`);
  const min = getNum(c.params, 'minHours');
  if (min === null) return skip(ctx, c, 'minHours eksik');
  // Bkz. teacherMinHoursDaily: FET <2 değerde "data is wrong" deyip tüm üretimi abort eder; min<2
  // önemsiz olduğundan (çalışılan günde >=1 daima sağlanır) üretimi kilitlemek yerine temiz atla.
  if (Math.floor(min) < 2) {
    return skip(ctx, c, `FET min-günlük-saat kısıtı için >=2 ister (verilen=${Math.floor(min)}); 1 zaten daima sağlandığından atlandı`);
  }
  return [{
    section: 'time',
    tag: 'ConstraintStudentsSetMinHoursDaily',
    body: {
      Weight_Percentage: c.weight,
      Students: cls,
      Minimum_Hours_Daily: Math.floor(min),
      Allow_Empty_Days: true,
      ...commonTail(c),
    },
  }];
}

function classMaxGapsPerDay(c: Constraint, ctx: BuilderContext): HandlerResult {
  const cls = getStr(c.params, 'class');
  if (!cls) return skip(ctx, c, 'class alanı boş');
  if (!ctx.classByName.has(cls)) return skip(ctx, c, `Bilinmeyen sınıf: "${cls}"`);
  const max = getNum(c.params, 'maxGaps');
  if (max === null) return skip(ctx, c, 'maxGaps eksik');
  return [{
    section: 'time',
    tag: 'ConstraintStudentsSetMaxGapsPerDay',
    body: {
      Weight_Percentage: c.weight,
      Max_Gaps: Math.floor(max),
      Students: cls,
      ...commonTail(c),
    },
  }];
}

function classEarlyMaxBeginnings(c: Constraint, ctx: BuilderContext): HandlerResult {
  const cls = getStr(c.params, 'class');
  if (!cls) return skip(ctx, c, 'class alanı boş');
  if (!ctx.classByName.has(cls)) return skip(ctx, c, `Bilinmeyen sınıf: "${cls}"`);
  const max = getNum(c.params, 'maxBeginnings');
  if (max === null) return skip(ctx, c, 'maxBeginnings eksik');
  return [{
    section: 'time',
    tag: 'ConstraintStudentsSetEarlyMaxBeginningsAtSecondHour',
    body: {
      Weight_Percentage: c.weight,
      Max_Beginnings_At_Second_Hour: Math.floor(max),
      Students: cls,
      ...commonTail(c),
    },
  }];
}

function classMaxBuildingChangesPerDay(c: Constraint, ctx: BuilderContext): HandlerResult {
  const cls = getStr(c.params, 'class');
  if (!cls) return skip(ctx, c, 'class alanı boş');
  if (!ctx.classByName.has(cls)) return skip(ctx, c, `Bilinmeyen sınıf: "${cls}"`);
  const max = getNum(c.params, 'maxChanges');
  if (max === null) return skip(ctx, c, 'maxChanges eksik');
  return [{
    section: 'space',
    tag: 'ConstraintStudentsSetMaxBuildingChangesPerDay',
    body: {
      Weight_Percentage: c.weight,
      Students: cls,
      Max_Building_Changes_Per_Day: Math.floor(max),
      ...commonTail(c),
    },
  }];
}

function classMinGapsBetweenBuildingChanges(c: Constraint, ctx: BuilderContext): HandlerResult {
  const cls = getStr(c.params, 'class');
  if (!cls) return skip(ctx, c, 'class alanı boş');
  if (!ctx.classByName.has(cls)) return skip(ctx, c, `Bilinmeyen sınıf: "${cls}"`);
  const min = getNum(c.params, 'minGaps');
  if (min === null) return skip(ctx, c, 'minGaps eksik');
  return [{
    section: 'space',
    tag: 'ConstraintStudentsSetMinGapsBetweenBuildingChanges',
    body: {
      Weight_Percentage: c.weight,
      Students: cls,
      Min_Gaps_Between_Building_Changes: Math.floor(min),
      ...commonTail(c),
    },
  }];
}

function classNotFirstHour(c: Constraint, ctx: BuilderContext): HandlerResult {
  const cls = getStr(c.params, 'class');
  if (!cls) return skip(ctx, c, 'class alanı boş');
  if (!ctx.classByName.has(cls)) return skip(ctx, c, `Bilinmeyen sınıf: "${cls}"`);
  const firstHour = ctx.hourByOrder.get(1);
  if (!firstHour) return skip(ctx, c, 'İlk ders saati tanımsız');
  const slots: FetSlot[] = ctx.days.map((d) => ({ Day: d.name, Hour: firstHour.name }));
  return [{
    section: 'time',
    tag: 'ConstraintStudentsSetNotAvailableTimes',
    body: {
      Weight_Percentage: c.weight,
      Students: cls,
      Number_of_Not_Available_Times: slots.length,
      Not_Available_Time: slots,
      ...commonTail(c),
    },
  }];
}

function classMaxHoursContinuously(c: Constraint, ctx: BuilderContext): HandlerResult {
  const cls = getStr(c.params, 'class');
  if (!cls) return skip(ctx, c, 'class alanı boş');
  if (!ctx.classByName.has(cls)) return skip(ctx, c, `Bilinmeyen sınıf: "${cls}"`);
  const max = getNum(c.params, 'maxHours');
  if (max === null) return skip(ctx, c, 'maxHours eksik');
  return [{
    section: 'time',
    tag: 'ConstraintStudentsSetMaxHoursContinuously',
    body: {
      Weight_Percentage: c.weight,
      Students: cls,
      Maximum_Hours_Continuously: Math.floor(max),
      ...commonTail(c),
    },
  }];
}


function activityFixedTime(c: Constraint, ctx: BuilderContext): HandlerResult {
  const aid = getNum(c.params, 'activityId');
  if (aid === null) return skip(ctx, c, 'activityId eksik');
  const day = getStr(c.params, 'day');
  const hour = getNum(c.params, 'hour');
  if (!day || hour === null) return skip(ctx, c, 'day veya hour eksik');
  if (!ctx.dayByName.has(day)) return skip(ctx, c, `Bilinmeyen gün: "${day}"`);
  const hourObj = ctx.hourByOrder.get(hour);
  if (!hourObj) return skip(ctx, c, `Bilinmeyen saat: ${hour}`);
  const pool = ctx.fetActivityIdsByActivity.get(aid) ?? [];
  if (pool.length === 0) return skip(ctx, c, `Aktivite bulunamadı: ${aid}`);
  const used = ctx.fixedTimeCursorByActivity.get(aid) ?? 0;
  if (used >= pool.length) {
    return skip(ctx, c, `Aktivitenin sabitlenebilecek tüm saatleri kullanıldı: ${aid}`);
  }
  const fetId = pool[used]!;
  ctx.fixedTimeCursorByActivity.set(aid, used + 1);
  return [{
    section: 'time' as const,
    tag: 'ConstraintActivityPreferredStartingTime',
    body: {
      Weight_Percentage: c.weight,
      Activity_Id: fetId,
      Preferred_Day: day,
      Preferred_Hour: hourObj.name,
      Permanently_Locked: true,
      ...commonTail(c),
    },
  }];
}

function activitiesSameStartingTime(c: Constraint, ctx: BuilderContext): HandlerResult {
  const rawIds = getArr(c.params, 'activityIds');
  const ids: number[] = [];
  for (const v of rawIds) {
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n)) {
      const expanded = ctx.fetActivityIdsByActivity.get(n) ?? [];
      ids.push(...expanded);
    }
  }
  if (ids.length < 2) return skip(ctx, c, 'En az 2 aktivite gerekli');
  return [{
    section: 'time',
    tag: 'ConstraintActivitiesSameStartingTime',
    body: {
      Weight_Percentage: c.weight,
      Number_of_Activities: ids.length,
      Activity_Id: ids,
      ...commonTail(c),
    },
  }];
}

function activitiesNotOverlapping(c: Constraint, ctx: BuilderContext): HandlerResult {
  const rawIds = getArr(c.params, 'activityIds');
  const ids: number[] = [];
  for (const v of rawIds) {
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n)) {
      const expanded = ctx.fetActivityIdsByActivity.get(n) ?? [];
      ids.push(...expanded);
    }
  }
  if (ids.length < 2) return skip(ctx, c, 'En az 2 aktivite gerekli');
  return [{
    section: 'time',
    tag: 'ConstraintActivitiesNotOverlapping',
    body: {
      Weight_Percentage: c.weight,
      Number_of_Activities: ids.length,
      Activity_Id: ids,
      ...commonTail(c),
    },
  }];
}

function activitiesSameStartingDay(c: Constraint, ctx: BuilderContext): HandlerResult {
  const rawIds = getArr(c.params, 'activityIds');
  const ids: number[] = [];
  for (const v of rawIds) {
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n)) {
      const expanded = ctx.fetActivityIdsByActivity.get(n) ?? [];
      ids.push(...expanded);
    }
  }
  if (ids.length < 2) return skip(ctx, c, 'En az 2 aktivite gerekli');
  return [{
    section: 'time',
    tag: 'ConstraintActivitiesSameStartingDay',
    body: {
      Weight_Percentage: c.weight,
      Number_of_Activities: ids.length,
      Activity_Id: ids,
      ...commonTail(c),
    },
  }];
}

function activityEndsStudentsDay(c: Constraint, ctx: BuilderContext): HandlerResult {
  const aid = getNum(c.params, 'activityId');
  if (aid === null) return skip(ctx, c, 'activityId eksik');
  const fetIds = ctx.fetActivityIdsByActivity.get(aid) ?? [];
  if (fetIds.length === 0) return skip(ctx, c, `Aktivite bulunamadı: ${aid}`);
  return fetIds.map((id) => ({
    section: 'time' as const,
    tag: 'ConstraintActivityEndsStudentsDay',
    body: {
      Weight_Percentage: c.weight,
      Activity_Id: id,
      ...commonTail(c),
    },
  }));
}

function subjectNotFirstHour(c: Constraint, ctx: BuilderContext): HandlerResult {
  const subj = getStr(c.params, 'subject');
  if (!subj) return skip(ctx, c, 'subject alanı boş');
  if (!ctx.subjectByName.has(subj)) return skip(ctx, c, `Bilinmeyen ders: "${subj}"`);
  const cls = getStr(c.params, 'class');
  if (cls && !ctx.classByName.has(cls)) return skip(ctx, c, `Bilinmeyen sınıf: "${cls}"`);
  const { fetIds } = activitiesForSubject(ctx, subj, cls);
  if (fetIds.length === 0) return skip(ctx, c, 'Eşleşen aktivite yok');

  const allowedSlots: FetSlot[] = [];
  for (const d of ctx.days) {
    for (const h of ctx.hours) {
      if (h.orderIndex === 0) continue;
      allowedSlots.push({ Day: d.name, Hour: h.name });
    }
  }
  const preferredAllowed = toPreferredSlots(allowedSlots);

  return fetIds.map((id) => ({
    section: 'time' as const,
    tag: 'ConstraintActivityPreferredTimeSlots',
    body: {
      Weight_Percentage: c.weight,
      Activity_Id: id,
      Number_of_Preferred_Time_Slots: preferredAllowed.length,
      Preferred_Time_Slot: preferredAllowed,
      ...commonTail(c),
    },
  }));
}

function minDaysBetweenActivitiesCustom(c: Constraint, ctx: BuilderContext): HandlerResult {
  const rawIds = getArr(c.params, 'activityIds');
  const ids: number[] = [];
  for (const v of rawIds) {
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n)) {
      const expanded = ctx.fetActivityIdsByActivity.get(n) ?? [];
      ids.push(...expanded);
    }
  }
  const minDays = getNum(c.params, 'minDays');
  if (minDays === null) return skip(ctx, c, 'minDays eksik');
  if (ids.length < 2) return skip(ctx, c, 'En az 2 aktivite gerekli');
  return [{
    section: 'time',
    tag: 'ConstraintMinDaysBetweenActivities',
    body: {
      Weight_Percentage: c.weight,
      Consecutive_If_Same_Day: true,
      Number_of_Activities: ids.length,
      Activity_Id: ids,
      MinDays: Math.floor(minDays),
      ...commonTail(c),
    },
  }];
}

function minGapsBetweenActivities(c: Constraint, ctx: BuilderContext): HandlerResult {
  const rawIds = getArr(c.params, 'activityIds');
  const ids: number[] = [];
  for (const v of rawIds) {
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n)) {
      const expanded = ctx.fetActivityIdsByActivity.get(n) ?? [];
      ids.push(...expanded);
    }
  }
  const min = getNum(c.params, 'minGaps');
  if (min === null) return skip(ctx, c, 'minGaps eksik');
  if (ids.length < 2) return skip(ctx, c, 'En az 2 aktivite gerekli');
  return [{
    section: 'time',
    tag: 'ConstraintMinGapsBetweenActivities',
    body: {
      Weight_Percentage: c.weight,
      Number_of_Activities: ids.length,
      Activity_Id: ids,
      MinGaps: Math.floor(min),
      ...commonTail(c),
    },
  }];
}

function twoActivitiesConsecutive(c: Constraint, ctx: BuilderContext): HandlerResult {
  const firstId = getNum(c.params, 'firstActivityId');
  const secondId = getNum(c.params, 'secondActivityId');
  if (firstId === null || secondId === null) {
    return skip(ctx, c, 'firstActivityId ve secondActivityId gerekli');
  }
  const firstFetIds = ctx.fetActivityIdsByActivity.get(firstId) ?? [];
  const secondFetIds = ctx.fetActivityIdsByActivity.get(secondId) ?? [];
  if (firstFetIds.length === 0 || secondFetIds.length === 0) {
    return skip(ctx, c, `Aktivite bulunamadı: ${firstId} veya ${secondId}`);
  }
  const out: ReturnType<typeof maxGapsBetweenActivities> = [];
  for (const f of firstFetIds) {
    for (const s of secondFetIds) {
      out.push({
        section: 'time',
        tag: 'ConstraintTwoActivitiesConsecutive',
        body: {
          Weight_Percentage: c.weight,
          First_Activity_Id: f,
          Second_Activity_Id: s,
          ...commonTail(c),
        },
      });
    }
  }
  return out;
}

function maxGapsBetweenActivities(c: Constraint, ctx: BuilderContext): HandlerResult {
  // ConstraintMaxGapsBetweenActivities FET'in VARSAYILAN modunda DESTEKLENMİYOR: fet-cl
  // "You have constraints which are incompatible with the current mode ... data is wrong - aborting"
  // deyip TÜM üretimi kilitliyor. İzole testte (auto-MinDaysBetween olmadan, yalnız 2 tekil
  // aktiviteyle) de doğrulandı → tipin kendisi mod-uyumsuz, veriyle ilgili değil. MinGaps sürümü
  // sorunsuz çalışır. Geçersiz/üretimi-kilitleyen XML üretmek yerine açık gerekçeyle temiz atla.
  const max = getNum(c.params, 'maxGaps');
  return skip(
    ctx,
    c,
    `FET bu kısıtı (aktiviteler-arası azami boşluk) varsayılan modda desteklemiyor, üretimi kilitliyor${max !== null ? ` (maxGaps=${Math.floor(max)})` : ''}`,
  );
}

function activityPreferredStartingTimes(c: Constraint, ctx: BuilderContext): HandlerResult {
  const aid = getNum(c.params, 'activityId');
  if (aid === null) return skip(ctx, c, 'activityId eksik');
  const fetIds = ctx.fetActivityIdsByActivity.get(aid) ?? [];
  if (fetIds.length === 0) return skip(ctx, c, `Aktivite bulunamadı: ${aid}`);
  const rawSlots = getArr(c.params, 'slots');
  if (rawSlots.length === 0) return skip(ctx, c, 'slots boş');
  const { slots } = expandSlots(rawSlots, ctx);
  if (slots.length === 0) return skip(ctx, c, 'Geçerli slot yok');
  return fetIds.map((id) => ({
    section: 'time' as const,
    tag: 'ConstraintActivityPreferredStartingTimes',
    body: {
      Weight_Percentage: c.weight,
      Activity_Id: id,
      Number_of_Preferred_Starting_Times: slots.length,
      Preferred_Starting_Time: slots.map((s) => ({
        Preferred_Starting_Day: s.Day,
        Preferred_Starting_Hour: s.Hour,
      })),
      ...commonTail(c),
    },
  }));
}


function subjectPreferredRooms(c: Constraint, ctx: BuilderContext): HandlerResult {
  const subj = getStr(c.params, 'subject');
  if (!subj) return skip(ctx, c, 'subject alanı boş');
  if (!ctx.subjectByName.has(subj)) return skip(ctx, c, `Bilinmeyen ders: "${subj}"`);
  const rooms = getArr(c.params, 'rooms')
    .filter((r): r is string => typeof r === 'string')
    .filter((r) => ctx.roomByName.has(r));
  if (rooms.length === 0) return skip(ctx, c, 'Geçerli derslik yok');
  return [{
    section: 'space',
    tag: 'ConstraintSubjectPreferredRooms',
    body: {
      Weight_Percentage: c.weight,
      Subject: subj,
      Number_of_Preferred_Rooms: rooms.length,
      Preferred_Room: rooms,
      ...commonTail(c),
    },
  }];
}

function teacherPreferredRoom(c: Constraint, ctx: BuilderContext): HandlerResult {
  const name = getStr(c.params, 'teacher');
  if (!name) return skip(ctx, c, 'teacher alanı boş');
  if (!ctx.teacherByName.has(name)) return skip(ctx, c, `Bilinmeyen öğretmen: "${name}"`);
  const room = getStr(c.params, 'room');
  if (!room) return skip(ctx, c, 'room alanı boş');
  if (!ctx.roomByName.has(room)) return skip(ctx, c, `Bilinmeyen derslik: "${room}"`);
  return [{
    section: 'space',
    tag: 'ConstraintTeacherHomeRoom',
    body: {
      Weight_Percentage: c.weight,
      Teacher: name,
      Room: room,
      ...commonTail(c),
    },
  }];
}

function teacherPreferredRooms(c: Constraint, ctx: BuilderContext): HandlerResult {
  const name = getStr(c.params, 'teacher');
  if (!name) return skip(ctx, c, 'teacher alanı boş');
  if (!ctx.teacherByName.has(name)) return skip(ctx, c, `Bilinmeyen öğretmen: "${name}"`);
  const rooms = getArr(c.params, 'rooms')
    .filter((r): r is string => typeof r === 'string')
    .filter((r) => ctx.roomByName.has(r));
  if (rooms.length === 0) return skip(ctx, c, 'Geçerli derslik yok');
  return [{
    section: 'space',
    tag: 'ConstraintTeacherHomeRooms',
    body: {
      Weight_Percentage: c.weight,
      Teacher: name,
      Number_of_Preferred_Rooms: rooms.length,
      Preferred_Room: rooms,
      ...commonTail(c),
    },
  }];
}

function activityPreferredRoom(c: Constraint, ctx: BuilderContext): HandlerResult {
  const aid = getNum(c.params, 'activityId');
  if (aid === null) return skip(ctx, c, 'activityId eksik');
  const fetIds = ctx.fetActivityIdsByActivity.get(aid) ?? [];
  if (fetIds.length === 0) return skip(ctx, c, `Aktivite bulunamadı: ${aid}`);
  const room = getStr(c.params, 'room');
  if (!room) return skip(ctx, c, 'room alanı boş');
  if (!ctx.roomByName.has(room)) return skip(ctx, c, `Bilinmeyen derslik: "${room}"`);
  return fetIds.map((id) => ({
    section: 'space' as const,
    tag: 'ConstraintActivityPreferredRoom',
    body: {
      Weight_Percentage: c.weight,
      Activity_Id: id,
      Room: room,
      Permanently_Locked: false,
      ...commonTail(c),
    },
  }));
}

function activityPreferredRooms(c: Constraint, ctx: BuilderContext): HandlerResult {
  const aid = getNum(c.params, 'activityId');
  if (aid === null) return skip(ctx, c, 'activityId eksik');
  const fetIds = ctx.fetActivityIdsByActivity.get(aid) ?? [];
  if (fetIds.length === 0) return skip(ctx, c, `Aktivite bulunamadı: ${aid}`);
  const rooms = getArr(c.params, 'rooms')
    .filter((r): r is string => typeof r === 'string')
    .filter((r) => ctx.roomByName.has(r));
  if (rooms.length === 0) return skip(ctx, c, 'Geçerli derslik yok');
  return fetIds.map((id) => ({
    section: 'space' as const,
    tag: 'ConstraintActivityPreferredRooms',
    body: {
      Weight_Percentage: c.weight,
      Activity_Id: id,
      Number_of_Preferred_Rooms: rooms.length,
      Preferred_Room: rooms,
      ...commonTail(c),
    },
  }));
}

function subjectActivityTagPreferredRoom(c: Constraint, ctx: BuilderContext): HandlerResult {
  const subj = getStr(c.params, 'subject');
  if (!subj) return skip(ctx, c, 'subject alanı boş');
  if (!ctx.subjectByName.has(subj)) return skip(ctx, c, `Bilinmeyen ders: "${subj}"`);
  const tag = getStr(c.params, 'activityTag');
  if (!tag) return skip(ctx, c, 'activityTag alanı boş');
  const room = getStr(c.params, 'room');
  if (!room) return skip(ctx, c, 'room alanı boş');
  if (!ctx.roomByName.has(room)) return skip(ctx, c, `Bilinmeyen derslik: "${room}"`);
  return [{
    section: 'space',
    tag: 'ConstraintSubjectActivityTagPreferredRoom',
    body: {
      Weight_Percentage: c.weight,
      Subject: subj,
      Activity_Tag: tag,
      Room: room,
      ...commonTail(c),
    },
  }];
}

function activitiesOccupyMaxDifferentRooms(c: Constraint, ctx: BuilderContext): HandlerResult {
  const rawIds = getArr(c.params, 'activityIds');
  const ids: number[] = [];
  for (const v of rawIds) {
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n)) {
      const expanded = ctx.fetActivityIdsByActivity.get(n) ?? [];
      ids.push(...expanded);
    }
  }
  const max = getNum(c.params, 'maxDifferentRooms');
  if (max === null) return skip(ctx, c, 'maxDifferentRooms eksik');
  if (ids.length < 2) return skip(ctx, c, 'En az 2 aktivite gerekli');
  return [{
    section: 'space',
    tag: 'ConstraintActivitiesOccupyMaxDifferentRooms',
    body: {
      Weight_Percentage: c.weight,
      Number_of_Activities: ids.length,
      Activity_Id: ids,
      Max_Number_of_Different_Rooms: Math.floor(max),
      ...commonTail(c),
    },
  }];
}

function studentsSetHomeRooms(c: Constraint, ctx: BuilderContext): HandlerResult {
  const cls = getStr(c.params, 'class');
  if (!cls) return skip(ctx, c, 'class alanı boş');
  if (!ctx.classByName.has(cls)) return skip(ctx, c, `Bilinmeyen sınıf: "${cls}"`);
  const rooms = getArr(c.params, 'rooms')
    .filter((r): r is string => typeof r === 'string')
    .filter((r) => ctx.roomByName.has(r));
  if (rooms.length === 0) return skip(ctx, c, 'Geçerli derslik yok');
  return [{
    section: 'space',
    tag: 'ConstraintStudentsSetHomeRooms',
    body: {
      Weight_Percentage: c.weight,
      Students: cls,
      Number_of_Preferred_Rooms: rooms.length,
      Preferred_Room: rooms,
      ...commonTail(c),
    },
  }];
}


function breakTimes(c: Constraint, ctx: BuilderContext): HandlerResult {
  const rawSlots = getArr(c.params, 'slots');
  if (rawSlots.length === 0) return skip(ctx, c, 'slots boş');
  const { slots } = expandSlots(rawSlots, ctx);
  if (slots.length === 0) return skip(ctx, c, 'Geçerli slot yok');
  return [{
    section: 'time',
    tag: 'ConstraintBreakTimes',
    body: {
      Weight_Percentage: c.weight,
      Number_of_Break_Times: slots.length,
      Break_Time: slots,
      ...commonTail(c),
    },
  }];
}

function allTeachersMaxHoursDaily(c: Constraint, ctx: BuilderContext): HandlerResult {
  const max = getNum(c.params, 'maxHours');
  if (max === null) return skip(ctx, c, 'maxHours eksik');
  return [{
    section: 'time',
    tag: 'ConstraintTeachersMaxHoursDaily',
    body: {
      Weight_Percentage: c.weight,
      Maximum_Hours_Daily: Math.floor(max),
      ...commonTail(c),
    },
  }];
}

function allTeachersMaxDaysPerWeek(c: Constraint, ctx: BuilderContext): HandlerResult {
  const max = getNum(c.params, 'maxDays');
  if (max === null) return skip(ctx, c, 'maxDays eksik');
  return [{
    section: 'time',
    tag: 'ConstraintTeachersMaxDaysPerWeek',
    body: {
      Weight_Percentage: c.weight,
      Max_Days_Per_Week: Math.floor(max),
      ...commonTail(c),
    },
  }];
}

function studentsMaxGapsPerWeek(c: Constraint, ctx: BuilderContext): HandlerResult {
  const max = getNum(c.params, 'maxGaps');
  if (max === null) return skip(ctx, c, 'maxGaps eksik');
  return [{
    section: 'time',
    tag: 'ConstraintStudentsMaxGapsPerWeek',
    body: {
      Weight_Percentage: c.weight,
      Max_Gaps: Math.floor(max),
      ...commonTail(c),
    },
  }];
}

function studentsEarlyMaxBeginnings(c: Constraint, ctx: BuilderContext): HandlerResult {
  const max = getNum(c.params, 'maxBeginnings');
  if (max === null) return skip(ctx, c, 'maxBeginnings eksik');
  return [{
    section: 'time',
    tag: 'ConstraintStudentsEarlyMaxBeginningsAtSecondHour',
    body: {
      Weight_Percentage: c.weight,
      Max_Beginnings_At_Second_Hour: Math.floor(max),
      ...commonTail(c),
    },
  }];
}

function studentsMaxHoursDaily(c: Constraint, ctx: BuilderContext): HandlerResult {
  const max = getNum(c.params, 'maxHours');
  if (max === null) return skip(ctx, c, 'maxHours eksik');
  return [{
    section: 'time',
    tag: 'ConstraintStudentsMaxHoursDaily',
    body: {
      Weight_Percentage: c.weight,
      Maximum_Hours_Daily: Math.floor(max),
      ...commonTail(c),
    },
  }];
}

function maxTotalActivitiesFromSet(c: Constraint, ctx: BuilderContext): HandlerResult {
  const rawIds = getArr(c.params, 'activityIds');
  const ids: number[] = [];
  for (const v of rawIds) {
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n)) {
      const expanded = ctx.fetActivityIdsByActivity.get(n) ?? [];
      ids.push(...expanded);
    }
  }
  const max = getNum(c.params, 'maxHours');
  if (max === null) return skip(ctx, c, 'maxHours eksik');
  if (ids.length === 0) return skip(ctx, c, 'activityIds boş');
  // Aynı geçersiz tag sorunu (bkz. subjectMaxHoursDaily): FET aktivite-kümesi için günlük
  // azami saat kısıtını doğrudan desteklemiyor → geçersiz XML üretme, temiz atla.
  return skip(ctx, c, `FET aktivite-kümesi günlük azami saat kısıtını doğrudan desteklemiyor (maxHours=${Math.floor(max)})`);
}


type Handler = (c: Constraint, ctx: BuilderContext) => HandlerResult;

export const HANDLERS: Record<ConstraintType, Handler> = {
  TEACHER_NOT_AVAILABLE: teacherNotAvailable,
  TEACHER_MAX_DAYS_PER_WEEK: teacherMaxDaysPerWeek,
  TEACHER_MAX_HOURS_DAILY: teacherMaxHoursDaily,
  TEACHER_MAX_GAPS_PER_DAY: teacherMaxGapsPerDay,
  TEACHER_MAX_GAPS_PER_WEEK: teacherMaxGapsPerWeek,
  TEACHERS_MAX_GAPS_PER_WEEK: teachersMaxGapsPerWeek,
  CLASS_NOT_AVAILABLE: classNotAvailable,
  CLASS_MAX_GAPS_PER_WEEK: classMaxGapsPerWeek,
  SUBJECT_NOT_ON_DAY: subjectNotOnDay,
  SUBJECT_PREFERRED_HOURS: subjectPreferredHours,
  SUBJECT_LAST_HOUR_OF_DAY: subjectLastHourOfDay,
  SUBJECT_MAX_HOURS_DAILY: subjectMaxHoursDaily,
  SUBJECT_CONSECUTIVE_HOURS: subjectConsecutiveHours,
  ROOM_NOT_AVAILABLE: roomNotAvailable,
  SUBJECT_PREFERRED_ROOM: subjectPreferredRoom,
  TEACHER_HOME_ROOM: teacherHomeRoom,
  CLASS_HOME_ROOM: classHomeRoom,
  TEACHER_MIN_HOURS_DAILY: teacherMinHoursDaily,
  TEACHER_NOT_AVAILABLE_INTERVAL: teacherNotAvailableInterval,
  TEACHER_MIN_DAYS_PER_WEEK: teacherMinDaysPerWeek,
  TEACHER_MAX_HOURS_CONTINUOUSLY: teacherMaxHoursContinuously,
  TEACHER_MAX_BUILDING_CHANGES_PER_DAY: teacherMaxBuildingChangesPerDay,
  TEACHER_MAX_BUILDING_CHANGES_PER_WEEK: teacherMaxBuildingChangesPerWeek,
  TEACHER_MIN_GAPS_BETWEEN_BUILDING_CHANGES: teacherMinGapsBetweenBuildingChanges,
  TEACHER_NOT_FIRST_HOUR: teacherNotFirstHour,
  TEACHER_NOT_LAST_HOUR: teacherNotLastHour,
  TEACHER_MIN_REST_BETWEEN_DAYS: teacherMinRestBetweenDays,
  CLASS_MAX_HOURS_DAILY: classMaxHoursDaily,
  CLASS_MIN_HOURS_DAILY: classMinHoursDaily,
  CLASS_MAX_GAPS_PER_DAY: classMaxGapsPerDay,
  CLASS_EARLY_MAX_BEGINNINGS: classEarlyMaxBeginnings,
  CLASS_MAX_BUILDING_CHANGES_PER_DAY: classMaxBuildingChangesPerDay,
  CLASS_MIN_GAPS_BETWEEN_BUILDING_CHANGES: classMinGapsBetweenBuildingChanges,
  CLASS_NOT_FIRST_HOUR: classNotFirstHour,
  CLASS_MAX_HOURS_CONTINUOUSLY: classMaxHoursContinuously,
  ACTIVITY_FIXED_TIME: activityFixedTime,
  ACTIVITIES_SAME_STARTING_TIME: activitiesSameStartingTime,
  ACTIVITIES_NOT_OVERLAPPING: activitiesNotOverlapping,
  ACTIVITIES_SAME_STARTING_DAY: activitiesSameStartingDay,
  ACTIVITY_ENDS_STUDENTS_DAY: activityEndsStudentsDay,
  SUBJECT_NOT_FIRST_HOUR: subjectNotFirstHour,
  MIN_DAYS_BETWEEN_ACTIVITIES_CUSTOM: minDaysBetweenActivitiesCustom,
  MIN_GAPS_BETWEEN_ACTIVITIES: minGapsBetweenActivities,
  MAX_GAPS_BETWEEN_ACTIVITIES: maxGapsBetweenActivities,
  ACTIVITY_PREFERRED_STARTING_TIMES: activityPreferredStartingTimes,
  SUBJECT_PREFERRED_ROOMS: subjectPreferredRooms,
  TEACHER_PREFERRED_ROOM: teacherPreferredRoom,
  TEACHER_PREFERRED_ROOMS: teacherPreferredRooms,
  ACTIVITY_PREFERRED_ROOM: activityPreferredRoom,
  ACTIVITY_PREFERRED_ROOMS: activityPreferredRooms,
  SUBJECT_ACTIVITY_TAG_PREFERRED_ROOM: subjectActivityTagPreferredRoom,
  ACTIVITIES_OCCUPY_MAX_DIFFERENT_ROOMS: activitiesOccupyMaxDifferentRooms,
  STUDENTS_SET_HOME_ROOMS: studentsSetHomeRooms,
  BREAK_TIMES: breakTimes,
  ALL_TEACHERS_MAX_HOURS_DAILY: allTeachersMaxHoursDaily,
  ALL_TEACHERS_MAX_DAYS_PER_WEEK: allTeachersMaxDaysPerWeek,
  STUDENTS_MAX_GAPS_PER_WEEK: studentsMaxGapsPerWeek,
  STUDENTS_EARLY_MAX_BEGINNINGS: studentsEarlyMaxBeginnings,
  STUDENTS_MAX_HOURS_DAILY: studentsMaxHoursDaily,
  MAX_TOTAL_ACTIVITIES_FROM_SET: maxTotalActivitiesFromSet,
  TWO_ACTIVITIES_CONSECUTIVE: twoActivitiesConsecutive,
};

export function dispatchConstraint(
  c: Constraint,
  ctx: BuilderContext,
): HandlerResult {
  const handler = HANDLERS[c.type];
  if (!handler) {
    ctx.skipped.push({
      constraintId: c.id,
      type: c.type,
      reason: `Bilinmeyen constraint tipi: ${c.type}`,
    });
    return null;
  }
  if (!c.active) {
    return null;
  }
  return handler(c, ctx);
}

export type { SkippedConstraint };
