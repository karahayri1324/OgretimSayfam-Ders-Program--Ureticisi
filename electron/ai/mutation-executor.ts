import { teachersRepo } from '../db/repositories/teachers.js';
import { subjectsRepo } from '../db/repositories/subjects.js';
import { classesRepo } from '../db/repositories/classes.js';
import { classYearsRepo } from '../db/repositories/class_years.js';
import { roomsRepo } from '../db/repositories/rooms.js';
import { activitiesRepo } from '../db/repositories/activities.js';
import { daysRepo } from '../db/repositories/days.js';
import { hoursRepo } from '../db/repositories/hours.js';
import { dayHoursRepo } from '../db/repositories/day_hours.js';
import { constraintsRepo } from '../db/repositories/constraints.js';
import { settingsRepo, WRITABLE_SETTING_KEYS } from '../db/repositories/settings.js';
import { timetablesRepo } from '../db/repositories/timetables.js';
import { getDb } from '../db/connection.js';
import type { ConstraintType, TimetableSlot } from '../../src/lib/types.js';
import { ConstraintTypeEnum } from './schema.js';
import { log } from '../utils/logger.js';
import type {
  DataMutationAction,
  DataMutationApplyResult,
  DataMutationOp,
} from '../../src/lib/types.js';


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

function findByName<T extends { id: number; name: string }>(
  needle: string,
  list: T[],
): T | null {
  const target = deburr(needle.trim());
  if (!target) return null;
  for (const item of list) if (deburr(item.name) === target) return item;
  for (const item of list) if (deburr(item.name).includes(target)) return item;
  for (const item of list) if (target.includes(deburr(item.name))) return item;
  const parts = target.split(/\s+/).filter((p) => p.length >= 3);
  for (const item of list) {
    const lowName = deburr(item.name);
    for (const p of parts) {
      const re = new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (re.test(lowName)) return item;
    }
  }
  return null;
}

function requireString(params: Record<string, unknown>, key: string): string {
  const v = params[key];
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`'${key}' parametresi gerekli (string).`);
  }
  return v.trim();
}

// Ham AI gün adını ('pazartesi','Carsamba','CUMA') KANONIK days tablosu adına ('Pazartesi')
// çevirir. FET handler'ları (xml-builder dayByName) günü TAM eşler; ham string FET-build'de
// sessizce unknownDays'e düşüp kısıtı KAYBEDİYORDU (#12). Bulunamazsa null.
function canonicalDayName(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const days = daysRepo.list();
  const exact = days.find((d) => d.name === raw.trim());
  if (exact) return exact.name;
  const fuzzy = days.find((d) => deburr(d.name) === deburr(raw));
  return fuzzy ? fuzzy.name : null;
}

// Bir entity ad alanını ('teacher'/'class'/'subject'/'room') KANONIK DB adına çözer ve var
// olduğunu DOĞRULAR. FET, kısıt referanslarını ada-göre tam eşler; ayrıca constraint-mapper.ts
// referans-doğrulama katmanı ölü kod olduğundan add_constraint hayalet entity'leri sessizce
// DB'ye yazıp AI'a gerçek kısıt gibi sunuyordu (FET'te skip → AI/DB ↔ FET kalıcı sapma, #9).
function resolveEntityField(
  p: Record<string, unknown>,
  key: string,
  list: { id: number; name: string }[],
  label: string,
): void {
  const v = p[key];
  if (typeof v !== 'string' || !v.trim()) return;
  const hit = findByName(v, list);
  if (!hit) throw new Error(`${label} bulunamadı: '${v}'`);
  p[key] = hit.name;
}

// add_constraint/add_activity_constraint param'larını DB'ye yazmadan ÖNCE normalleştir:
// gün adlarını kanonikleştir, entity referanslarını doğrula+kanonikleştir. Böylece kısıt ya
// gerçekten uygulanır ya da net hatayla reddedilir — sessiz kayıp olmaz.
function normalizeConstraintParams(raw: Record<string, unknown>): Record<string, unknown> {
  const p: Record<string, unknown> = { ...raw };

  if ('day' in p && typeof p.day === 'string') {
    const c = canonicalDayName(p.day);
    if (!c) throw new Error(`Gün bulunamadı: '${String(p.day)}'`);
    p.day = c;
  }
  if (Array.isArray(p.days)) {
    p.days = p.days.map((d) => {
      const c = canonicalDayName(d);
      if (!c) throw new Error(`Gün bulunamadı: '${String(d)}'`);
      return c;
    });
  }
  if (Array.isArray(p.slots)) {
    p.slots = p.slots.map((s) => {
      if (s && typeof s === 'object' && 'day' in (s as Record<string, unknown>)) {
        const so = s as Record<string, unknown>;
        const c = canonicalDayName(so.day);
        if (!c) throw new Error(`Gün bulunamadı: '${String(so.day)}'`);
        return { ...so, day: c };
      }
      return s;
    });
  }

  resolveEntityField(p, 'teacher', teachersRepo.list(), 'Öğretmen');
  resolveEntityField(p, 'class', classesRepo.list(), 'Sınıf');
  resolveEntityField(p, 'subject', subjectsRepo.list(), 'Branş');
  resolveEntityField(p, 'room', roomsRepo.list(), 'Derslik');
  if (Array.isArray(p.rooms)) {
    const rooms = roomsRepo.list();
    p.rooms = p.rooms.map((r) => {
      if (typeof r !== 'string' || !r.trim()) return r;
      const hit = findByName(r, rooms);
      if (!hit) throw new Error(`Derslik bulunamadı: '${r}'`);
      return hit.name;
    });
  }

  return p;
}

function requireConstraintType(params: Record<string, unknown>): ConstraintType {
  const type = requireString(params, 'type');
  const parsed = ConstraintTypeEnum.safeParse(type);
  if (!parsed.success) {
    throw new Error(`Geçersiz kısıtlama tipi: '${type}'`);
  }
  return parsed.data as ConstraintType;
}

function optString(params: Record<string, unknown>, key: string): string | undefined {
  const v = params[key];
  if (typeof v !== 'string' || !v.trim()) return undefined;
  return v.trim();
}

// Fine-tuned model bool'u string ('false'/'true'/'0'/'1') olarak üretebilir; params z.record(
// z.any()) olduğundan zorlanmaz. JS'te Boolean('false')===true, Boolean('0')===true → 'pasifleştir'
// isteği kısıtı AKTİF bırakırdı (#13). Yaygın string/sayı temsillerini doğru çöz.
function coerceBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['true', '1', 'yes', 'evet', 'aktif', 'on'].includes(s)) return true;
    if (['false', '0', 'no', 'hayir', 'hayır', 'pasif', 'off'].includes(s)) return false;
  }
  return fallback;
}

function optInt(params: Record<string, unknown>, key: string): number | undefined {
  const v = params[key];
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

const userHourToSlotIndex = (hour: number): number => hour - 1;

function ensureSubject(name: string): number {
  const existing = findByName(name, subjectsRepo.list());
  if (existing) return existing.id;
  return subjectsRepo.create({ name });
}

function ensureTeacher(name: string, weeklyTarget = 30): number {
  const existing = findByName(name, teachersRepo.list());
  if (existing) return existing.id;
  return teachersRepo.create({ name, weeklyTargetHours: weeklyTarget });
}

function ensureClass(name: string, yearName?: string | null): number {
  const existing = findByName(name, classesRepo.list());
  if (existing) return existing.id;
  let yearId: number | null = null;
  if (yearName) {
    const y = findByName(yearName, classYearsRepo.list());
    yearId = y ? y.id : classYearsRepo.create(yearName);
  }
  return classesRepo.create({ name, yearId });
}


function pruneConstraintsByName(field: 'teacher' | 'class' | 'subject' | 'room', name: string): number {
  const target = deburr(name);
  let removed = 0;
  for (const c of constraintsRepo.list()) {
    const p = c.params as Record<string, unknown>;
    let hit = typeof p[field] === 'string' && deburr(p[field] as string) === target;
    if (!hit && field === 'room' && Array.isArray(p['rooms'])) {
      hit = (p['rooms'] as unknown[]).some((r) => typeof r === 'string' && deburr(r) === target);
    }
    if (hit) {
      constraintsRepo.delete(c.id);
      removed++;
    }
  }
  return removed;
}

function pruneConstraintsByActivityIds(ids: number[]): number {
  if (ids.length === 0) return 0;
  const idset = new Set(ids);
  let removed = 0;
  for (const c of constraintsRepo.list()) {
    const p = c.params as Record<string, unknown>;
    const single = typeof p['activityId'] === 'number' && idset.has(p['activityId'] as number);
    const many =
      Array.isArray(p['activityIds']) &&
      (p['activityIds'] as unknown[]).some((x) => typeof x === 'number' && idset.has(x as number));
    const pair =
      (typeof p['firstActivityId'] === 'number' && idset.has(p['firstActivityId'] as number)) ||
      (typeof p['secondActivityId'] === 'number' && idset.has(p['secondActivityId'] as number));
    if (single || many || pair) {
      constraintsRepo.delete(c.id);
      removed++;
    }
  }
  return removed;
}

function activityIdsForClass(classId: number): number[] {
  return activitiesRepo.list().filter((a) => a.classId === classId).map((a) => a.id);
}

function activityIdsForSubject(subjectId: number): number[] {
  return activitiesRepo.list().filter((a) => a.subjectId === subjectId).map((a) => a.id);
}

function clearDayHourOverrides(): string {
  try {
    const had = dayHoursRepo.list().length > 0;
    if (had) {
      dayHoursRepo.clearAll();
      return ' (güne özel saat ayarları sıfırlandı)';
    }
  } catch {
  }
  return '';
}

function resolveHomeRoomId(params: Record<string, unknown>): number | null {
  const idVal = optInt(params, 'homeRoomId');
  if (idVal && idVal > 0) return idVal;
  const roomName = optString(params, 'homeRoom');
  if (!roomName) return null;
  const room = findByName(roomName, roomsRepo.list());
  if (!room) throw new Error(`Ana derslik bulunamadı: '${roomName}'`);
  return room.id;
}

type Handler = (params: Record<string, unknown>) => string;

const handlers: Record<DataMutationOp, Handler> = {
  add_teacher(params) {
    const name = requireString(params, 'name');
    const weeklyTargetHours = optInt(params, 'weeklyTargetHours') ?? 30;
    const notes = optString(params, 'notes') ?? null;
    const existing = findByName(name, teachersRepo.list());
    if (existing) {
      return `Öğretmen zaten var: ${existing.name} (id=${existing.id}). Atlandı.`;
    }
    const subjectNames = Array.isArray(params['subjects'])
      ? (params['subjects'] as unknown[]).filter((s): s is string => typeof s === 'string')
      : [];
    const subjectIds = subjectNames.map((s) => ensureSubject(s));
    const id = teachersRepo.create({ name, weeklyTargetHours, notes, subjectIds });
    return `'${name}' öğretmeni eklendi (id=${id})${subjectIds.length ? `, ${subjectIds.length} branş bağlandı.` : '.'}`;
  },

  update_teacher(params) {
    const name = requireString(params, 'name');
    const teacher = findByName(name, teachersRepo.list());
    if (!teacher) throw new Error(`Öğretmen bulunamadı: '${name}'`);
    const patch: Record<string, unknown> = {};
    if (params['newName']) patch['name'] = String(params['newName']);
    const wth = optInt(params, 'weeklyTargetHours');
    if (wth !== undefined) patch['weeklyTargetHours'] = wth;
    const notes = optString(params, 'notes');
    if (notes !== undefined) patch['notes'] = notes;
    if (Array.isArray(params['subjects'])) {
      const names = (params['subjects'] as unknown[]).filter(
        (s): s is string => typeof s === 'string' && s.trim().length > 0,
      );
      patch['subjectIds'] = names.map((s) => ensureSubject(s));
    }
    teachersRepo.update(teacher.id, patch);
    return `'${teacher.name}' öğretmeni güncellendi.`;
  },

  delete_teacher(params) {
    const name = requireString(params, 'name');
    const teacher = findByName(name, teachersRepo.list());
    if (!teacher) throw new Error(`Öğretmen bulunamadı: '${name}'`);
    teachersRepo.delete(teacher.id);
    const pruned = pruneConstraintsByName('teacher', teacher.name);
    const extra = pruned > 0 ? ` ${pruned} ilgili kısıtlama temizlendi.` : '';
    return `'${teacher.name}' öğretmeni silindi; dersleri öğretmensiz kaldı.${extra}`;
  },

  add_subject(params) {
    const name = requireString(params, 'name');
    const existing = findByName(name, subjectsRepo.list());
    if (existing) {
      return `Branş zaten var: ${existing.name} (id=${existing.id}). Atlandı.`;
    }
    const rawColor = optString(params, 'color');
    const color = rawColor && /^#[0-9a-fA-F]{3,8}$/.test(rawColor) ? rawColor : null;
    const id = subjectsRepo.create({
      name,
      shortCode: optString(params, 'shortCode') ?? null,
      color,
      notes: optString(params, 'notes') ?? null,
    });
    return `'${name}' branşı eklendi (id=${id}).`;
  },

  update_subject(params) {
    const name = requireString(params, 'name');
    const subject = findByName(name, subjectsRepo.list());
    if (!subject) throw new Error(`Branş bulunamadı: '${name}'`);
    const patch: Record<string, unknown> = {};
    if (params['newName']) patch['name'] = String(params['newName']);
    const sc = optString(params, 'shortCode');
    if (sc !== undefined) patch['shortCode'] = sc;
    const color = optString(params, 'color');
    if (color !== undefined) {
      // Geçersiz/zararlı renk string'i export'a enjekte edilmesin (E1) → yalnız hex kabul.
      patch['color'] = color && /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : null;
    }
    const notes = optString(params, 'notes');
    if (notes !== undefined) patch['notes'] = notes;
    subjectsRepo.update(subject.id, patch);
    return `'${subject.name}' branşı güncellendi.`;
  },

  delete_subject(params) {
    const name = requireString(params, 'name');
    const subject = findByName(name, subjectsRepo.list());
    if (!subject) throw new Error(`Branş bulunamadı: '${name}'`);
    const affectedActs = activityIdsForSubject(subject.id);
    subjectsRepo.delete(subject.id);
    const prunedName = pruneConstraintsByName('subject', subject.name);
    const prunedAct = pruneConstraintsByActivityIds(affectedActs);
    const total = prunedName + prunedAct;
    const extra = total > 0 ? ` ${total} ilgili kısıtlama temizlendi.` : '';
    return `'${subject.name}' branşı silindi.${extra}`;
  },

  add_class(params) {
    const name = requireString(params, 'name');
    const existing = findByName(name, classesRepo.list());
    if (existing) return `Sınıf zaten var: ${existing.name} (id=${existing.id}). Atlandı.`;
    const yearName = optString(params, 'year');
    let yearId: number | null = null;
    if (yearName) {
      const y = findByName(yearName, classYearsRepo.list());
      yearId = y ? y.id : classYearsRepo.create(yearName);
    }
    const studentCount = optInt(params, 'studentCount') ?? 0;
    const homeRoomId = resolveHomeRoomId(params);
    const id = classesRepo.create({ name, yearId, studentCount, homeRoomId });
    const roomPart = homeRoomId ? ', ana derslik atandı' : '';
    return `'${name}' sınıfı eklendi (id=${id})${yearName ? `, kademe: ${yearName}` : ''}${roomPart}.`;
  },

  update_class(params) {
    const name = requireString(params, 'name');
    const klass = findByName(name, classesRepo.list());
    if (!klass) throw new Error(`Sınıf bulunamadı: '${name}'`);
    const patch: Record<string, unknown> = {};
    if (params['newName']) patch['name'] = String(params['newName']);
    const sc = optInt(params, 'studentCount');
    if (sc !== undefined) patch['studentCount'] = sc;
    const yearName = optString(params, 'year');
    if (yearName !== undefined) {
      const y = findByName(yearName, classYearsRepo.list());
      patch['yearId'] = y ? y.id : classYearsRepo.create(yearName);
    }
    if ('homeRoom' in params || 'homeRoomId' in params) {
      patch['homeRoomId'] = resolveHomeRoomId(params);
    }
    classesRepo.update(klass.id, patch);
    return `'${klass.name}' sınıfı güncellendi.`;
  },

  delete_class(params) {
    const name = requireString(params, 'name');
    const klass = findByName(name, classesRepo.list());
    if (!klass) throw new Error(`Sınıf bulunamadı: '${name}'`);
    const affectedActs = activityIdsForClass(klass.id);
    classesRepo.delete(klass.id);
    const prunedName = pruneConstraintsByName('class', klass.name);
    const prunedAct = pruneConstraintsByActivityIds(affectedActs);
    const total = prunedName + prunedAct;
    const extra = total > 0 ? ` ${total} ilgili kısıtlama temizlendi.` : '';
    return `'${klass.name}' sınıfı silindi.${extra}`;
  },

  add_class_year(params) {
    const name = requireString(params, 'name');
    const existing = findByName(name, classYearsRepo.list());
    if (existing) return `Kademe zaten var: ${existing.name}. Atlandı.`;
    const orderIndex = optInt(params, 'orderIndex') ?? classYearsRepo.list().length;
    const id = classYearsRepo.create(name, orderIndex);
    return `'${name}' kademesi eklendi (id=${id}).`;
  },

  update_class_year(params) {
    const name = requireString(params, 'name');
    const year = findByName(name, classYearsRepo.list());
    if (!year) throw new Error(`Kademe bulunamadı: '${name}'`);
    const patch: { name?: string; orderIndex?: number } = {};
    if (params['newName']) patch.name = String(params['newName']).trim();
    const oi = optInt(params, 'orderIndex');
    if (oi !== undefined) patch.orderIndex = oi;
    if (patch.name === undefined && patch.orderIndex === undefined) {
      throw new Error("Güncellenecek alan yok ('newName' veya 'orderIndex' verin).");
    }
    classYearsRepo.update(year.id, patch);
    return `'${year.name}' kademesi güncellendi${patch.name ? ` → '${patch.name}'` : ''}.`;
  },

  delete_class_year(params) {
    const name = requireString(params, 'name');
    const year = findByName(name, classYearsRepo.list());
    if (!year) throw new Error(`Kademe bulunamadı: '${name}'`);
    classYearsRepo.delete(year.id);
    return `'${year.name}' kademesi silindi.`;
  },

  add_room(params) {
    const name = requireString(params, 'name');
    const existing = findByName(name, roomsRepo.list());
    if (existing) return `Derslik zaten var: ${existing.name} (id=${existing.id}). Atlandı.`;
    const capacity = optInt(params, 'capacity') ?? 30;
    const building = optString(params, 'building') ?? null;
    const notes = optString(params, 'notes') ?? null;
    const id = roomsRepo.create({ name, capacity, building, notes });
    return `'${name}' dersliği eklendi (id=${id}, kapasite=${capacity}).`;
  },

  update_room(params) {
    const name = requireString(params, 'name');
    const room = findByName(name, roomsRepo.list());
    if (!room) throw new Error(`Derslik bulunamadı: '${name}'`);
    const patch: Record<string, unknown> = {};
    if (params['newName']) patch['name'] = String(params['newName']);
    const cap = optInt(params, 'capacity');
    if (cap !== undefined) patch['capacity'] = cap;
    const building = optString(params, 'building');
    if (building !== undefined) patch['building'] = building;
    const notes = optString(params, 'notes');
    if (notes !== undefined) patch['notes'] = notes;
    roomsRepo.update(room.id, patch);
    return `'${room.name}' dersliği güncellendi.`;
  },

  delete_room(params) {
    const name = requireString(params, 'name');
    const room = findByName(name, roomsRepo.list());
    if (!room) throw new Error(`Derslik bulunamadı: '${name}'`);
    roomsRepo.delete(room.id);
    const pruned = pruneConstraintsByName('room', room.name);
    const extra = pruned > 0 ? ` ${pruned} ilgili kısıtlama temizlendi.` : '';
    return `'${room.name}' dersliği silindi.${extra}`;
  },

  add_activity(params) {
    const className = requireString(params, 'class');
    const subjectName = requireString(params, 'subject');
    const teacherName = optString(params, 'teacher');
    const weeklyHours = optInt(params, 'weeklyHours') ?? 1;
    const blockDuration = optInt(params, 'blockDuration') ?? 1;
    if (weeklyHours < 1) throw new Error(`Haftalık ders saati en az 1 olmalı (verilen: ${weeklyHours}).`);
    if (blockDuration < 1) throw new Error(`Blok süresi en az 1 olmalı (verilen: ${blockDuration}).`);
    const notes = optString(params, 'notes') ?? null;

    const classId = ensureClass(className, optString(params, 'year'));
    const subjectId = ensureSubject(subjectName);
    let teacherId: number | null = null;
    if (teacherName) {
      teacherId = ensureTeacher(teacherName);
      const t = teachersRepo.get(teacherId);
      if (t && !t.subjectIds.includes(subjectId)) {
        teachersRepo.update(teacherId, { subjectIds: [...t.subjectIds, subjectId] });
      }
    }
    let existingId: number | undefined;
    if (teacherId === null) {
      const dup = activitiesRepo
        .list()
        .find(
          (a) =>
            a.classId === classId &&
            a.subjectId === subjectId &&
            a.teacherId == null &&
            a.splitGroupId == null,
        );
      if (dup) existingId = dup.id;
    }
    const id = activitiesRepo.upsert({
      id: existingId,
      classId,
      subjectId,
      teacherId,
      weeklyHours,
      blockDuration,
      notes,
    });
    const teacherPart = teacherName ? ` (öğretmen: ${teacherName})` : '';
    return `${className} sınıfına '${subjectName}' ${weeklyHours} saat ders eklendi${teacherPart} (id=${id}).`;
  },

  update_activity(params) {
    const className = requireString(params, 'class');
    const subjectName = requireString(params, 'subject');
    const klass = findByName(className, classesRepo.list());
    if (!klass) throw new Error(`Sınıf bulunamadı: '${className}'`);
    const subject = findByName(subjectName, subjectsRepo.list());
    if (!subject) throw new Error(`Branş bulunamadı: '${subjectName}'`);

    const all = activitiesRepo.list();
    const matches = all.filter(
      (a) => a.classId === klass.id && a.subjectId === subject.id,
    );
    if (matches.length === 0) {
      throw new Error(`${className} × ${subjectName} aktivitesi bulunamadı.`);
    }
    let existing = matches[0]!;
    if (matches.length > 1) {
      const selName = optString(params, 'fromTeacher');
      if (selName) {
        const ft = findByName(selName, teachersRepo.list());
        const found = ft ? matches.find((m) => m.teacherId === ft.id) : undefined;
        if (!found) {
          throw new Error(
            `${className} × ${subjectName} için '${selName}' öğretmenli aktivite bulunamadı.`,
          );
        }
        existing = found;
      } else {
        const names = matches
          .map((m) => (m.teacherId ? teachersRepo.get(m.teacherId)?.name ?? '(boş)' : '(boş)'))
          .join(', ');
        throw new Error(
          `${className} × ${subjectName} için birden fazla aktivite var (öğretmenler: ${names}). ` +
            `Hangisini güncellemek istediğinizi 'fromTeacher' ile belirtin.`,
        );
      }
    }
    const weeklyHours = optInt(params, 'weeklyHours') ?? existing.weeklyHours;
    const blockDuration = optInt(params, 'blockDuration') ?? existing.blockDuration;
    if (weeklyHours < 1) throw new Error(`Haftalık ders saati en az 1 olmalı (verilen: ${weeklyHours}).`);
    if (blockDuration < 1) throw new Error(`Blok süresi en az 1 olmalı (verilen: ${blockDuration}).`);
    const teacherName = optString(params, 'teacher');
    let teacherId: number | null = existing.teacherId;
    if (teacherName !== undefined) {
      teacherId = teacherName ? ensureTeacher(teacherName) : null;
    }
    activitiesRepo.upsert({
      id: existing.id,
      classId: existing.classId,
      subjectId: existing.subjectId,
      teacherId,
      weeklyHours,
      blockDuration,
      notes: existing.notes,
    });
    return `${className} × '${subjectName}' aktivitesi güncellendi (${weeklyHours} saat).`;
  },

  delete_activity(params) {
    const className = requireString(params, 'class');
    const subjectName = requireString(params, 'subject');
    const klass = findByName(className, classesRepo.list());
    if (!klass) throw new Error(`Sınıf bulunamadı: '${className}'`);
    const subject = findByName(subjectName, subjectsRepo.list());
    if (!subject) throw new Error(`Branş bulunamadı: '${subjectName}'`);
    const all = activitiesRepo.list();
    const matches = all.filter(
      (a) => a.classId === klass.id && a.subjectId === subject.id,
    );
    if (matches.length === 0) {
      throw new Error(`${className} × ${subjectName} aktivitesi bulunamadı.`);
    }
    let existing = matches[0]!;
    if (matches.length > 1) {
      const selName = optString(params, 'teacher') ?? optString(params, 'fromTeacher');
      if (selName) {
        const ft = findByName(selName, teachersRepo.list());
        const found = ft ? matches.find((m) => m.teacherId === ft.id) : undefined;
        if (!found) {
          throw new Error(
            `${className} × ${subjectName} için '${selName}' öğretmenli aktivite bulunamadı.`,
          );
        }
        existing = found;
      } else {
        const names = matches
          .map((m) => (m.teacherId ? teachersRepo.get(m.teacherId)?.name ?? '(boş)' : '(boş)'))
          .join(', ');
        throw new Error(
          `${className} × ${subjectName} için birden fazla aktivite var (öğretmenler: ${names}). ` +
            `Hangisini silmek istediğinizi 'teacher' ile belirtin.`,
        );
      }
    }
    activitiesRepo.delete(existing.id);
    const pruned = pruneConstraintsByActivityIds([existing.id]);
    const extra = pruned > 0 ? ` ${pruned} ilgili kısıtlama temizlendi.` : '';
    return `${className} × '${subjectName}' aktivitesi silindi.${extra}`;
  },

  add_day(params) {
    const name = requireString(params, 'name');
    const current = daysRepo.list().map((d) => d.name);
    if (current.some((d) => deburr(d) === deburr(name))) {
      return `Gün zaten var: ${name}. Atlandı.`;
    }
    daysRepo.replaceAll([...current, name]);
    return `'${name}' günü programa eklendi.`;
  },

  delete_day(params) {
    const name = requireString(params, 'name');
    const current = daysRepo.list().map((d) => d.name);
    const next = current.filter((d) => deburr(d) !== deburr(name));
    if (next.length === current.length) {
      throw new Error(`Gün bulunamadı: '${name}'`);
    }
    daysRepo.replaceAll(next);
    return `'${name}' günü programdan kaldırıldı.`;
  },

  set_days(params) {
    const raw = params['days'];
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new Error("'days' en az 1 gün adı içeren bir dizi olmalı.");
    }
    const names: string[] = [];
    for (const d of raw) {
      if (typeof d !== 'string' || !d.trim()) {
        throw new Error('days içinde geçersiz değer var.');
      }
      const n = d.trim();
      if (!names.some((x) => deburr(x) === deburr(n))) names.push(n);
    }
    daysRepo.replaceAll(names);
    return `Haftalık günler ayarlandı (${names.length} gün): ${names.join(', ')}.`;
  },

  add_hour(params) {
    const current = hoursRepo.list();
    const name = optString(params, 'name') ?? `${current.length + 1}. Ders`;
    const startTime = optString(params, 'startTime') ?? null;
    const endTime = optString(params, 'endTime') ?? null;
    if (current.some((h) => deburr(h.name) === deburr(name))) {
      return `Ders saati zaten var: ${name}. Atlandı.`;
    }
    hoursRepo.replaceAll([
      ...current.map((h) => ({ name: h.name, startTime: h.startTime, endTime: h.endTime })),
      { name, startTime, endTime },
    ]);
    const cleared = clearDayHourOverrides();
    return `'${name}' ders saati eklendi.${cleared}`;
  },

  delete_hour(params) {
    const current = hoursRepo.list();
    const name = optString(params, 'name');
    let next: typeof current;
    let removedName: string;
    if (name) {
      next = current.filter((h) => deburr(h.name) !== deburr(name));
      if (next.length === current.length) {
        throw new Error(`Ders saati bulunamadı: '${name}'`);
      }
      removedName = name;
    } else {
      if (current.length === 0) throw new Error('Silinecek ders saati yok.');
      removedName = current[current.length - 1]!.name;
      next = current.slice(0, -1);
    }
    hoursRepo.replaceAll(
      next.map((h) => ({ name: h.name, startTime: h.startTime, endTime: h.endTime })),
    );
    const cleared = clearDayHourOverrides();
    return `'${removedName}' ders saati kaldırıldı.${cleared}`;
  },

  set_hour_times(params) {
    const raw = params['hours'];
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new Error("'hours' en az 1 ders saati içeren bir dizi olmalı.");
    }
    const entries: { name: string; startTime: string | null; endTime: string | null }[] = [];
    for (let i = 0; i < raw.length; i++) {
      const h = raw[i] as Record<string, unknown> | null;
      if (!h || typeof h !== 'object') throw new Error(`hours[${i}] obje değil.`);
      const name = optString(h, 'name') ?? `${i + 1}. Ders`;
      const startTime = optString(h, 'startTime') ?? null;
      const endTime = optString(h, 'endTime') ?? null;
      entries.push({ name, startTime, endTime });
    }
    hoursRepo.replaceAll(entries);
    const cleared = clearDayHourOverrides();
    return `${entries.length} ders saati güncellendi (isim/başlangıç/bitiş).${cleared}`;
  },

  clear_day_hours(params) {
    const dayName = requireString(params, 'day');
    const day = findByName(dayName, daysRepo.list());
    if (!day) throw new Error(`Gün bulunamadı: '${dayName}'`);
    const had = dayHoursRepo.listByDay(day.id).length > 0;
    if (!had) {
      return `'${day.name}' zaten genel ders saati planını kullanıyor. Atlandı.`;
    }
    dayHoursRepo.replaceForDay(day.id, []);
    return `'${day.name}' günü genel ders saati planına döndürüldü.`;
  },

  link_teacher_subject(params) {
    const teacherName = requireString(params, 'teacher');
    const subjectName = requireString(params, 'subject');
    const teacherId = ensureTeacher(teacherName);
    const subjectId = ensureSubject(subjectName);
    const t = teachersRepo.get(teacherId);
    if (!t) throw new Error(`Öğretmen bulunamadı: '${teacherName}'`);
    if (t.subjectIds.includes(subjectId)) {
      return `${teacherName} zaten '${subjectName}' branşına atanmış. Atlandı.`;
    }
    teachersRepo.update(teacherId, {
      subjectIds: [...t.subjectIds, subjectId],
    });
    return `${teacherName} öğretmenine '${subjectName}' yeterliliği eklendi.`;
  },

  unlink_teacher_subject(params) {
    const teacherName = requireString(params, 'teacher');
    const subjectName = requireString(params, 'subject');
    const teacher = findByName(teacherName, teachersRepo.list());
    if (!teacher) throw new Error(`Öğretmen bulunamadı: '${teacherName}'`);
    const subject = findByName(subjectName, subjectsRepo.list());
    if (!subject) throw new Error(`Branş bulunamadı: '${subjectName}'`);
    if (!teacher.subjectIds.includes(subject.id)) {
      return `${teacher.name} zaten '${subject.name}' branşına atanmamış. Atlandı.`;
    }
    teachersRepo.update(teacher.id, {
      subjectIds: teacher.subjectIds.filter((sid) => sid !== subject.id),
    });
    return `${teacher.name} → '${subject.name}' yeterliliği kaldırıldı.`;
  },

  set_constraint_weight(params) {
    const id = Number(params.constraintId ?? params.id);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('constraintId geçerli değil.');
    }
    const weight = Number(params.weight);
    if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
      throw new Error('weight 0-100 arası olmalı.');
    }
    const list = constraintsRepo.list();
    const c = list.find((x) => x.id === id);
    if (!c) throw new Error(`Kısıtlama bulunamadı (id=${id}).`);
    const oldW = c.weight;
    constraintsRepo.setWeight(id, weight);
    return `Kısıtlama #${id} ağırlığı ${oldW} → ${weight} yapıldı.`;
  },

  set_constraint_active(params) {
    const id = Number(params.constraintId ?? params.id);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('constraintId geçerli değil.');
    }
    const active = coerceBool(params.active, true);
    const list = constraintsRepo.list();
    const c = list.find((x) => x.id === id);
    if (!c) throw new Error(`Kısıtlama bulunamadı (id=${id}).`);
    constraintsRepo.toggle(id, active);
    return `Kısıtlama #${id} ${active ? 'aktif' : 'pasif'} hale getirildi.`;
  },

  add_constraint(params) {
    const type = requireConstraintType(params);
    const weight = Number(params.weight ?? 100);
    if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
      throw new Error('weight 0-100 arası olmalı.');
    }
    const rawParams =
      typeof params.params === 'object' && params.params !== null
        ? (params.params as Record<string, unknown>)
        : {};
    // Gün kanonikleştir + entity referanslarını doğrula (#9, #12) — yoksa kısıt sessizce
    // FET'te düşer ve AI/DB durumu gerçeklikle sapardı.
    const constraintParams = normalizeConstraintParams(rawParams);
    const notes = typeof params.notes === 'string' ? params.notes : null;
    const id = constraintsRepo.add({
      type,
      weight,
      active: true,
      params: constraintParams,
      source: 'ai',
      notes,
    });
    return `Kısıtlama eklendi (id=${id}, type=${type}, weight=${weight}).`;
  },

  delete_constraint(params) {
    const id = Number(params.constraintId ?? params.id);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('constraintId geçerli değil.');
    }
    const list = constraintsRepo.list();
    const c = list.find((x) => x.id === id);
    if (!c) throw new Error(`Kısıtlama bulunamadı (id=${id}).`);
    constraintsRepo.delete(id);
    return `Kısıtlama #${id} silindi.`;
  },

  add_activity_constraint(params) {
    const type = requireConstraintType(params);
    const filter =
      typeof params.filter === 'object' && params.filter !== null
        ? (params.filter as Record<string, unknown>)
        : {};
    const weight = Number(params.weight ?? 100);
    if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
      throw new Error('weight 0-100 arası olmalı.');
    }
    const rawInner =
      typeof params.params === 'object' && params.params !== null
        ? (params.params as Record<string, unknown>)
        : {};
    // innerParams da (slots[].day, day, room vb.) doğrulanmadan yazılıyordu (#9 kardeşi).
    const innerParams = normalizeConstraintParams(rawInner);

    const activities = activitiesRepo.list();
    const classes = classesRepo.list();
    const subjects = subjectsRepo.list();
    const teachers = teachersRepo.list();

    const targets = activities.filter((a) => {
      if (typeof filter.class === 'string' && filter.class.trim()) {
        const cls = classes.find((c) => c.id === a.classId);
        if (!cls || !nameMatches(cls.name, filter.class)) return false;
      }
      if (typeof filter.classYear === 'string' && filter.classYear.trim()) {
        const cls = classes.find((c) => c.id === a.classId);
        if (!cls) return false;
        const yearPrefix = String(filter.classYear).trim();
        if (!cls.name.startsWith(yearPrefix)) return false;
      }
      if (typeof filter.subject === 'string' && filter.subject.trim()) {
        const subj = subjects.find((s) => s.id === a.subjectId);
        if (!subj || !nameMatches(subj.name, filter.subject)) return false;
      }
      if (typeof filter.teacher === 'string' && filter.teacher.trim()) {
        if (a.teacherId == null) return false;
        const t = teachers.find((tt) => tt.id === a.teacherId);
        if (!t || !nameMatches(t.name, filter.teacher)) return false;
      }
      return true;
    });

    if (targets.length === 0) {
      throw new Error(
        `Filtreyle eşleşen aktivite bulunamadı: ${JSON.stringify(filter)}`,
      );
    }

    let added = 0;
    for (const act of targets) {
      const merged = { ...innerParams, activityId: act.id };
      constraintsRepo.add({
        type,
        weight,
        active: true,
        params: merged,
        source: 'ai',
        notes: `auto: ${type} (filter=${JSON.stringify(filter)})`,
      });
      added++;
    }
    return `${added} aktiviteye '${type}' kısıtlaması eklendi.`;
  },

  set_setting(params) {
    const key = requireString(params, 'key');
    if (!WRITABLE_SETTING_KEYS.has(key)) {
      throw new Error(`'${key}' bu yolla değiştirilemez.`);
    }
    const rawValue = params.value;
    if (rawValue === undefined || rawValue === null) {
      throw new Error("'value' boş olamaz.");
    }
    const value = String(rawValue);
    settingsRepo.set(key, value);
    return `Ayar '${key}' = '${value}' olarak kaydedildi.`;
  },


  add_split_activity(params) {
    const className = requireString(params, 'class');
    const weeklyHours = optInt(params, 'weeklyHours') ?? 1;
    const blockDuration = optInt(params, 'blockDuration') ?? 1;
    if (weeklyHours < 1) throw new Error(`Haftalık ders saati en az 1 olmalı (verilen: ${weeklyHours}).`);
    if (blockDuration < 1) throw new Error(`Blok süresi en az 1 olmalı (verilen: ${blockDuration}).`);
    const groupsRaw = params.groups;
    if (!Array.isArray(groupsRaw) || groupsRaw.length < 2) {
      throw new Error("'groups' en az 2 elemanlı dizi olmalı (split anlamlı olsun).");
    }

    const classId = ensureClass(className, optString(params, 'year'));
    const createdIds: number[] = [];
    const groupSummaries: string[] = [];

    for (let i = 0; i < groupsRaw.length; i++) {
      const g = groupsRaw[i] as Record<string, unknown> | null;
      if (!g || typeof g !== 'object') {
        throw new Error(`groups[${i}] obje değil.`);
      }
      const subjectName = requireString(g, 'subject');
      const teacherName = optString(g, 'teacher');
      const roomName = optString(g, 'room');

      const subjectId = ensureSubject(subjectName);
      let teacherId: number | null = null;
      if (teacherName) {
        teacherId = ensureTeacher(teacherName);
        const t = teachersRepo.get(teacherId);
        if (t && !t.subjectIds.includes(subjectId)) {
          teachersRepo.update(teacherId, {
            subjectIds: [...t.subjectIds, subjectId],
          });
        }
      }

      const actId = activitiesRepo.upsert({
        classId,
        subjectId,
        teacherId,
        weeklyHours,
        blockDuration,
        notes: `Split grubu — ${className} aynı saatte`,
      });
      createdIds.push(actId);

      if (roomName) {
        let room = findByName(roomName, roomsRepo.list());
        if (!room) {
          const newId = roomsRepo.create({ name: roomName });
          room = roomsRepo.list().find((r) => r.id === newId) ?? null;
        }
        if (room) {
          constraintsRepo.add({
            type: 'ACTIVITY_PREFERRED_ROOM',
            weight: 100,
            active: true,
            params: { activityId: actId, room: room.name },
            source: 'ai',
            notes: `Split grubu odası: ${className} × ${subjectName} → ${room.name}`,
          });
        }
      }

      const teacherPart = teacherName ? ` (${teacherName})` : '';
      const roomPart = roomName ? ` → ${roomName}` : '';
      groupSummaries.push(`${subjectName}${teacherPart}${roomPart}`);
    }

    // İki grup aynı (sınıf+ders+öğretmen) kombinasyonuna çözülürse upsert ON CONFLICT ile
    // tek satıra çöker, createdIds duplike id taşır → setSplitGroup 1-üyeli yetim grup kurar
    // (split anlamsız, FET'te bozuk _g öğrenci kümesi). Net hatayla reddet (#1).
    if (new Set(createdIds).size < 2) {
      throw new Error(
        `Split grupları aynı ders/öğretmen kombinasyonuna çözüldü; gruplar farklı branş ` +
          `veya farklı öğretmen olmalı (verilen gruplar tek aktiviteye denk geliyor).`,
      );
    }

    const groupId = activitiesRepo.setSplitGroup(createdIds);
    return (
      `${className} sınıfı ${groupsRaw.length} gruba bölündü ` +
      `(splitGroup #${groupId}, ${weeklyHours} saat): ${groupSummaries.join(' | ')}. ` +
      `Aynı saatte başlamaları FET tarafından zorlanacak.`
    );
  },

  set_timetable_slot(params) {
    const className = requireString(params, 'class');
    const subjectName = requireString(params, 'subject');
    const day = requireString(params, 'day');
    const hour = optInt(params, 'hour');
    if (hour == null || hour < 1) throw new Error("'hour' 1+ olmalı.");

    const klass = findByName(className, classesRepo.list());
    if (!klass) throw new Error(`Sınıf bulunamadı: '${className}'`);
    const subject = findByName(subjectName, subjectsRepo.list());
    if (!subject) throw new Error(`Branş bulunamadı: '${subjectName}'`);

    const teacherName = optString(params, 'teacher');
    let teacherId: number | null | undefined = undefined;
    if (teacherName) {
      // teacher burada mevcut aktiviteyi SEÇMEK için filtredir; ensureTeacher kullanmak
      // eşleşmeyen adda HAYALET öğretmen yaratıyordu (#4). Var olanı ara, yoksa net hata.
      const t = findByName(teacherName, teachersRepo.list());
      if (!t) throw new Error(`Öğretmen bulunamadı: '${teacherName}'`);
      teacherId = t.id;
    }
    const matches = activitiesRepo
      .list()
      .filter((a) => a.classId === klass.id && a.subjectId === subject.id)
      .filter((a) => (teacherId === undefined ? true : a.teacherId === teacherId));
    if (matches.length === 0) {
      throw new Error(
        `${className} × ${subjectName} aktivitesi bulunamadı. ` +
          `Önce add_activity ile ekleyin.`,
      );
    }
    if (matches.length > 1) {
      // Belirsizlikte sessizce matches[0]'ı kilitlemek YANLIŞ öğretmenin dersini sabitliyordu
      // (update_activity/delete_activity/substitute_teacher hepsi burada hata fırlatıyor;
      // set_timetable_slot tek istisnaydı). 'teacher' ile netleştirilsin.
      const names = matches
        .map((m) => (m.teacherId ? teachersRepo.get(m.teacherId)?.name ?? '?' : 'atanmamış'))
        .join(', ');
      throw new Error(
        `${className} × ${subjectName} için birden fazla aktivite var (öğretmenler: ${names}). ` +
          `Hangisini kilitleyeceğinizi 'teacher' ile belirtin.`,
      );
    }
    const act = matches[0]!;

    // FET ACTIVITY_FIXED_TIME handler'ı gün adını KANONIK days tablosu adıyla (tam) eşler;
    // ham AI/kullanıcı string'i ('pazartesi') saklanırsa kilit FET-build'de sessizce düşer.
    const dayObj =
      daysRepo.list().find((d) => d.name === day) ??
      daysRepo.list().find((d) => deburr(d.name) === deburr(day));
    if (!dayObj) throw new Error(`Gün bulunamadı: '${day}'`);
    const canonicalDay = dayObj.name;

    const existing = constraintsRepo.list().find(
      (c) =>
        c.type === 'ACTIVITY_FIXED_TIME' &&
        (c.params as { activityId?: number }).activityId === act.id &&
        (c.params as { day?: string }).day === canonicalDay &&
        (c.params as { hour?: number }).hour === hour,
    );
    if (existing) {
      return `Zaten kilitli: ${className} × ${subjectName} → ${day} ${hour}. ders.`;
    }

    for (const c of constraintsRepo.list()) {
      if (
        c.type === 'ACTIVITY_FIXED_TIME' &&
        (c.params as { activityId?: number }).activityId === act.id
      ) {
        constraintsRepo.delete(c.id);
      }
    }

    constraintsRepo.add({
      type: 'ACTIVITY_FIXED_TIME',
      weight: 100,
      active: true,
      params: { activityId: act.id, day: canonicalDay, hour },
      source: 'ai',
      notes: `Slot kilidi: ${className} × ${subjectName}`,
    });

    const roomName = optString(params, 'room');
    if (roomName) {
      const r = findByName(roomName, roomsRepo.list());
      if (r) {
        constraintsRepo.add({
          type: 'ACTIVITY_PREFERRED_ROOM',
          weight: 100,
          active: true,
          params: { activityId: act.id, room: r.name },
          source: 'ai',
          notes: `Slot oda: ${className} × ${subjectName} → ${r.name}`,
        });
      }
    }

    return (
      `${className} × ${subjectName} → ${day} ${hour}. ders'e kilitlendi. ` +
      `Programı tekrar üretince FET bu kuralı uygulayacak.`
    );
  },

  lock_timetable_slot(params) {
    const className = requireString(params, 'class');
    const day = requireString(params, 'day');
    const hour = optInt(params, 'hour');
    if (hour == null || hour < 1) throw new Error("'hour' 1+ olmalı.");

    const klass = findByName(className, classesRepo.list());
    if (!klass) throw new Error(`Sınıf bulunamadı: '${className}'`);

    const latest = timetablesRepo.latest();
    if (!latest) {
      throw new Error(
        'Henüz üretilmiş bir program yok. Önce "Programı Üret" deyin, sonra kilitleyin.',
      );
    }

    const days = daysRepo.list();
    const dayObj =
      days.find((d) => d.name === day) ??
      days.find((d) => deburr(d.name) === deburr(day));
    if (!dayObj) throw new Error(`Gün bulunamadı: '${day}'`);

    const slot = latest.slots.find(
      (s: TimetableSlot) =>
        s.classId === klass.id &&
        s.dayIndex === dayObj.orderIndex &&
        s.hourIndex === userHourToSlotIndex(hour),
    );
    if (!slot) {
      throw new Error(
        `${className} ${day} ${hour}. ders'te programda boşluk var (kilitlenecek aktivite yok).`,
      );
    }

    const dbActivityId = slot.sourceActivityId ?? slot.activityId;

    const existing = constraintsRepo.list().find(
      (c) =>
        c.type === 'ACTIVITY_FIXED_TIME' &&
        (c.params as { activityId?: number }).activityId === dbActivityId &&
        (c.params as { day?: string }).day === dayObj.name &&
        (c.params as { hour?: number }).hour === hour,
    );
    if (existing) {
      return `Zaten kilitli: ${className} ${day} ${hour}. ders → ${slot.subjectName}.`;
    }

    constraintsRepo.add({
      type: 'ACTIVITY_FIXED_TIME',
      weight: 100,
      active: true,
      params: { activityId: dbActivityId, day: dayObj.name, hour },
      source: 'ai',
      notes: `Slot kilidi (mevcut): ${className} ${dayObj.name} ${hour}. → ${slot.subjectName}`,
    });
    return (
      `${className} ${day} ${hour}. ders (${slot.subjectName}) kilitlendi — ` +
      `yeniden üretildiğinde bu slot değişmeyecek.`
    );
  },

  unlock_timetable_slot(params) {
    const day = requireString(params, 'day');
    const hour = optInt(params, 'hour');
    if (hour == null || hour < 1) throw new Error("'hour' 1+ olmalı.");

    // Kilitler KANONIK days adıyla saklanır (set/lock/swap hepsi dayObj.name yazar). Ham
    // 'pazartesi'/'PAZARTESİ' ile gelen unlock'ta cp.day === day strict eşleşmesi tutmaz →
    // kilit kalkmadığı halde "zaten serbest" denirdi (FET slotu yine sabitlerdi). Kanonikleştir.
    const days = daysRepo.list();
    const dayObj =
      days.find((d) => d.name === day) ??
      days.find((d) => deburr(d.name) === deburr(day));
    if (!dayObj) throw new Error(`Gün bulunamadı: '${day}'`);
    const canonicalDay = dayObj.name;

    let targetActivityIds: Set<number>;
    if (params.activityId !== undefined) {
      const aid = Number(params.activityId);
      if (!Number.isFinite(aid)) throw new Error("'activityId' geçerli değil.");
      targetActivityIds = new Set([aid]);
    } else {
      const className = requireString(params, 'class');
      const klass = findByName(className, classesRepo.list());
      if (!klass) throw new Error(`Sınıf bulunamadı: '${className}'`);
      targetActivityIds = new Set(
        activitiesRepo.list().filter((a) => a.classId === klass.id).map((a) => a.id),
      );
    }

    let removed = 0;
    for (const c of constraintsRepo.list()) {
      if (c.type !== 'ACTIVITY_FIXED_TIME') continue;
      const cp = c.params as { activityId?: number; day?: string; hour?: number };
      const dayMatches =
        cp.day === canonicalDay ||
        (cp.day != null && deburr(cp.day) === deburr(canonicalDay));
      if (
        cp.activityId !== undefined &&
        targetActivityIds.has(cp.activityId) &&
        dayMatches &&
        cp.hour === hour
      ) {
        constraintsRepo.delete(c.id);
        removed++;
      }
    }
    if (removed === 0) {
      return `${day} ${hour}. ders için kilit bulunamadı (zaten serbest).`;
    }
    return `${removed} slot kilidi kaldırıldı (${day} ${hour}. ders).`;
  },


  substitute_teacher(params) {
    const newTeacherName = requireString(params, 'newTeacher');
    const newTeacherId = ensureTeacher(newTeacherName);

    let act: ReturnType<typeof activitiesRepo.list>[number] | undefined;
    if (params.activityId !== undefined) {
      const aid = Number(params.activityId);
      act = activitiesRepo.list().find((a) => a.id === aid);
      if (!act) throw new Error(`Aktivite bulunamadı (id=${aid}).`);
    } else {
      const className = requireString(params, 'class');
      const subjectName = requireString(params, 'subject');
      const klass = findByName(className, classesRepo.list());
      if (!klass) throw new Error(`Sınıf bulunamadı: '${className}'`);
      const subject = findByName(subjectName, subjectsRepo.list());
      if (!subject) throw new Error(`Branş bulunamadı: '${subjectName}'`);

      const matches = activitiesRepo
        .list()
        .filter((a) => a.classId === klass.id && a.subjectId === subject.id);
      if (matches.length === 0) {
        throw new Error(
          `${className} × ${subjectName} aktivitesi bulunamadı.`,
        );
      }
      if (matches.length > 1) {
        // Belirsizlikte sessizce matches[0]'ı seçmek YANLIŞ öğretmenin dersini değiştiriyordu (#3).
        // fromTeacher yoksa veya çözülemiyorsa net hata ver (update_activity ile aynı desen).
        const fromName = optString(params, 'fromTeacher');
        if (!fromName) {
          const names = matches
            .map((m) => (m.teacherId ? teachersRepo.get(m.teacherId)?.name ?? '?' : 'atanmamış'))
            .join(', ');
          throw new Error(
            `${className} × ${subjectName} için birden fazla aktivite var (öğretmenler: ${names}). ` +
              `Hangisini değiştireceğinizi 'fromTeacher' ile belirtin.`,
          );
        }
        const ft = findByName(fromName, teachersRepo.list());
        const found = ft ? matches.find((m) => m.teacherId === ft.id) : undefined;
        if (!found) {
          throw new Error(
            `'${fromName}' adlı öğretmen ${className} × ${subjectName} aktivitesinde bulunamadı.`,
          );
        }
        act = found;
      } else {
        act = matches[0];
      }
    }
    if (!act) throw new Error('Aktivite eşleşmedi.');

    const t = teachersRepo.get(newTeacherId);
    if (t && !t.subjectIds.includes(act.subjectId)) {
      teachersRepo.update(newTeacherId, {
        subjectIds: [...t.subjectIds, act.subjectId],
      });
    }

    const oldTeacher = act.teacherId
      ? teachersRepo.get(act.teacherId)
      : null;
    activitiesRepo.upsert({
      id: act.id,
      classId: act.classId,
      subjectId: act.subjectId,
      teacherId: newTeacherId,
      weeklyHours: act.weeklyHours,
      blockDuration: act.blockDuration,
      notes: act.notes,
    });
    const subj = subjectsRepo.list().find((s) => s.id === act.subjectId);
    const klass = classesRepo.list().find((c) => c.id === act.classId);
    return (
      `${klass?.name ?? '?'} × ${subj?.name ?? '?'} aktivitesinin öğretmeni ` +
      `${oldTeacher?.name ?? '(boş)'} → ${newTeacherName} olarak değiştirildi.`
    );
  },

  merge_activities(params) {
    const classesRaw = params.classes;
    if (!Array.isArray(classesRaw) || classesRaw.length < 2) {
      throw new Error("'classes' en az 2 sınıf adı içermeli.");
    }
    const subjectName = requireString(params, 'subject');
    const teacherName = optString(params, 'teacher');
    const roomName = optString(params, 'room');
    const weeklyHours = optInt(params, 'weeklyHours') ?? 1;
    const blockDuration = optInt(params, 'blockDuration') ?? 1;

    const subjectId = ensureSubject(subjectName);
    let teacherId: number | null = null;
    if (teacherName) {
      teacherId = ensureTeacher(teacherName);
      const t = teachersRepo.get(teacherId);
      if (t && !t.subjectIds.includes(subjectId)) {
        teachersRepo.update(teacherId, {
          subjectIds: [...t.subjectIds, subjectId],
        });
      }
    }

    const createdIds: number[] = [];
    const classNames: string[] = [];
    for (const raw of classesRaw) {
      if (typeof raw !== 'string' || !raw.trim()) {
        throw new Error('classes içinde geçersiz değer.');
      }
      const classId = ensureClass(raw.trim());
      classNames.push(raw.trim());
      const actId = activitiesRepo.upsert({
        classId,
        subjectId,
        teacherId,
        weeklyHours,
        blockDuration,
        notes: `Birleşik aktivite: ${classesRaw.join(' + ')} → ${subjectName}`,
      });
      createdIds.push(actId);

      if (roomName) {
        const r = findByName(roomName, roomsRepo.list());
        if (r) {
          constraintsRepo.add({
            type: 'ACTIVITY_PREFERRED_ROOM',
            weight: 100,
            active: true,
            params: { activityId: actId, room: r.name },
            source: 'ai',
            notes: `Birleşik aktivite odası: ${r.name}`,
          });
        }
      }
    }

    // Birden çok sınıf adı aynı sınıfa fuzzy-eşleşirse (örn. '9A' ve '9-A') aynı (sınıf+ders+
    // öğretmen) upsert'e çöküp createdIds duplike olur → birleşik grup eksik üyeli kalır (#14).
    if (new Set(createdIds).size < 2) {
      throw new Error(
        `Verilen sınıflar tek sınıfa çözüldü; birleştirme için en az 2 FARKLI sınıf gerekli ` +
          `(adların birbirine karışmadığından emin olun).`,
      );
    }

    const groupId = activitiesRepo.setSplitGroup(createdIds);
    const teacherPart = teacherName ? ` (öğretmen: ${teacherName})` : '';
    const roomPart = roomName ? `, oda: ${roomName}` : '';
    return (
      `${classNames.join(' + ')} sınıfları '${subjectName}' dersini ` +
      `aynı saatte birlikte alacak${teacherPart}${roomPart} ` +
      `(splitGroup #${groupId}, ${weeklyHours} saat).`
    );
  },


  export_timetable(params) {
    const format = requireString(params, 'format').toLowerCase();
    if (!['pdf', 'excel', 'html', 'xlsx'].includes(format)) {
      throw new Error("'format' 'pdf', 'excel', 'html' veya 'xlsx' olmalı.");
    }
    const className = optString(params, 'class');
    if (className) {
      const klass = findByName(className, classesRepo.list());
      if (!klass) throw new Error(`Sınıf bulunamadı: '${className}'`);
    }
    const scope = className ? `${className} sınıfı için` : 'tüm sınıflar için';
    return `${format.toUpperCase()} export hazırlanıyor (${scope}).`;
  },


  swap_timetable_slots(params) {
    const s1 = params.slot1 as Record<string, unknown> | undefined;
    const s2 = params.slot2 as Record<string, unknown> | undefined;
    if (!s1 || !s2 || typeof s1 !== 'object' || typeof s2 !== 'object') {
      throw new Error("'slot1' ve 'slot2' obje olmalı.");
    }
    const class1 = requireString(s1, 'class');
    const day1 = requireString(s1, 'day');
    const hour1 = optInt(s1, 'hour');
    const class2 = requireString(s2, 'class');
    const day2 = requireString(s2, 'day');
    const hour2 = optInt(s2, 'hour');
    if (hour1 == null || hour2 == null) {
      throw new Error("'hour' 1+ olmalı (her slot için).");
    }

    const latest = timetablesRepo.latest();
    if (!latest) {
      throw new Error(
        'Henüz üretilmiş bir program yok. Önce "Programı Üret" deyin, sonra swap yapın.',
      );
    }
    const klass1 = findByName(class1, classesRepo.list());
    const klass2 = findByName(class2, classesRepo.list());
    if (!klass1) throw new Error(`Sınıf bulunamadı: '${class1}'`);
    if (!klass2) throw new Error(`Sınıf bulunamadı: '${class2}'`);

    const days = daysRepo.list();
    const dayObj1 =
      days.find((d) => d.name === day1) ??
      days.find((d) => deburr(d.name) === deburr(day1));
    const dayObj2 =
      days.find((d) => d.name === day2) ??
      days.find((d) => deburr(d.name) === deburr(day2));
    if (!dayObj1) throw new Error(`Gün bulunamadı: '${day1}'`);
    if (!dayObj2) throw new Error(`Gün bulunamadı: '${day2}'`);

    const slotA = latest.slots.find(
      (s: TimetableSlot) =>
        s.classId === klass1.id &&
        s.dayIndex === dayObj1.orderIndex &&
        s.hourIndex === userHourToSlotIndex(hour1),
    );
    const slotB = latest.slots.find(
      (s: TimetableSlot) =>
        s.classId === klass2.id &&
        s.dayIndex === dayObj2.orderIndex &&
        s.hourIndex === userHourToSlotIndex(hour2),
    );
    if (!slotA || !slotB) {
      throw new Error(
        "Slot'lardan biri programda yok (ya boşluk var ya da gün/saat dışı).",
      );
    }

    const dbActivityA = slotA.sourceActivityId ?? slotA.activityId;
    const dbActivityB = slotB.sourceActivityId ?? slotB.activityId;

    // İki slot AYNI DB aktivitesine aitse (çok-saatli blok ya da aynı split üyesinin iki saati),
    // aynı activityId için iki çelişkili ACTIVITY_FIXED_TIME üretilir; FET fixedTimeCursor'u
    // alt-id↔hedef eşleşmesini GARANTİ ETMEZ → blok bozulur/yarım uygulanır (#3). Bu durumda
    // saat-bazlı swap ACTIVITY_FIXED_TIME ile ifade edilemez; net hatayla reddet.
    if (dbActivityA === dbActivityB) {
      throw new Error(
        `Bu iki slot aynı dersin (${slotA.subjectName}) parçası — aynı aktivitenin iki saatini ` +
          `bu şekilde yer değiştiremezsiniz. Farklı dersler/sınıflar arasında swap yapın.`,
      );
    }

    for (const c of constraintsRepo.list()) {
      if (c.type !== 'ACTIVITY_FIXED_TIME') continue;
      const aid = (c.params as { activityId?: number }).activityId;
      if (aid === dbActivityA || aid === dbActivityB) {
        constraintsRepo.delete(c.id);
      }
    }

    constraintsRepo.add({
      type: 'ACTIVITY_FIXED_TIME',
      weight: 100,
      active: true,
      params: { activityId: dbActivityA, day: dayObj2.name, hour: hour2 },
      source: 'ai',
      notes: `Swap: ${class1} ${day1}/${hour1} ↔ ${class2} ${day2}/${hour2}`,
    });
    constraintsRepo.add({
      type: 'ACTIVITY_FIXED_TIME',
      weight: 100,
      active: true,
      params: { activityId: dbActivityB, day: dayObj1.name, hour: hour1 },
      source: 'ai',
      notes: `Swap: ${class2} ${day2}/${hour2} ↔ ${class1} ${day1}/${hour1}`,
    });

    return (
      `Slot'lar yer değiştirildi: ` +
      `${class1} ${day1}/${hour1} (${slotA.subjectName}) ↔ ` +
      `${class2} ${day2}/${hour2} (${slotB.subjectName}). ` +
      `Programı yeniden üretince FET bu kuralları uygulayacak.`
    );
  },

  pair_subjects_consecutive(params) {
    const className = requireString(params, 'class');
    const subject1 = requireString(params, 'subject1');
    const subject2 = requireString(params, 'subject2');

    const klass = findByName(className, classesRepo.list());
    if (!klass) throw new Error(`Sınıf bulunamadı: '${className}'`);
    const subj1 = findByName(subject1, subjectsRepo.list());
    const subj2 = findByName(subject2, subjectsRepo.list());
    if (!subj1) throw new Error(`Branş bulunamadı: '${subject1}'`);
    if (!subj2) throw new Error(`Branş bulunamadı: '${subject2}'`);

    const allActs = activitiesRepo.list();
    const act1 = allActs.find(
      (a) => a.classId === klass.id && a.subjectId === subj1.id,
    );
    const act2 = allActs.find(
      (a) => a.classId === klass.id && a.subjectId === subj2.id,
    );
    if (!act1) {
      throw new Error(
        `${className} × ${subject1} aktivitesi bulunamadı. Önce add_activity ile ekleyin.`,
      );
    }
    if (!act2) {
      throw new Error(
        `${className} × ${subject2} aktivitesi bulunamadı. Önce add_activity ile ekleyin.`,
      );
    }

    const existing = constraintsRepo.list().find(
      (c) =>
        c.type === 'TWO_ACTIVITIES_CONSECUTIVE' &&
        (c.params as { firstActivityId?: number }).firstActivityId === act1.id &&
        (c.params as { secondActivityId?: number }).secondActivityId === act2.id,
    );
    if (existing) {
      return `Zaten ardışık: ${subject1} → ${subject2} (${className}).`;
    }

    const weight = Math.max(0, Math.min(100, optInt(params, 'weight') ?? 100));
    constraintsRepo.add({
      type: 'TWO_ACTIVITIES_CONSECUTIVE',
      weight,
      active: true,
      params: {
        firstActivityId: act1.id,
        secondActivityId: act2.id,
      },
      source: 'ai',
      notes: `Peş peşe: ${className} → ${subject1} hemen ardından ${subject2}`,
    });
    return (
      `${className} için '${subject1}' hemen ardından '${subject2}' olarak ` +
      `ardışıklık kuralı eklendi (weight=${weight}).`
    );
  },

  navigate_to(params) {
    const raw = requireString(params, 'page').toLowerCase();
    const page = raw.startsWith('/') ? raw.slice(1) : raw;
    const valid = [
      'welcome', 'subjects', 'classes', 'rooms', 'teachers', 'activities',
      'schedule', 'constraints', 'generate', 'timetable', 'advanced', 'settings',
    ];
    if (!valid.includes(page)) {
      throw new Error(
        `Geçersiz sayfa: '${page}'. Geçerli: ${valid.join(', ')}`,
      );
    }
    return `/${page} sayfasına yönlendiriliyor.`;
  },

  clear_split(params) {
    const className = requireString(params, 'class');
    const klass = findByName(className, classesRepo.list());
    if (!klass) throw new Error(`Sınıf bulunamadı: '${className}'`);
    const split = activitiesRepo
      .list()
      .filter((a) => a.classId === klass.id && a.splitGroupId != null);
    if (split.length === 0) {
      return `${klass.name} sınıfında bölünmüş/grup aktivite yok. Atlandı.`;
    }
    for (const a of split) activitiesRepo.clearSplitGroup(a.id);
    return `${klass.name} sınıfının bölünmüş grubu çözüldü (${split.length} aktivite normale döndü).`;
  },

  cancel_generation() {
    return 'Program üretimi iptal ediliyor.';
  },
};

function nameMatches(name: string, target: string): boolean {
  const a = deburr(name.trim());
  const b = deburr(target.trim());
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  return false;
}

class MutationRollback extends Error {}

export function applyMutations(actions: DataMutationAction[]): DataMutationApplyResult {
  const result: DataMutationApplyResult = {
    applied: 0,
    errors: [],
    results: [],
  };

  const runAll = getDb().transaction(() => {
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i]!;
      const handler = handlers[action.op];
      if (!handler) {
        const msg = `Bilinmeyen operasyon: '${action.op}'`;
        result.errors.push({ index: i, op: action.op, message: msg });
        result.results.push({ index: i, op: action.op, ok: false, message: msg });
        continue;
      }
      try {
        const msg = handler(action.params);
        result.applied++;
        result.results.push({ index: i, op: action.op, ok: true, message: msg });
        log.info('AI mutation uygulandı', { op: action.op, msg });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result.errors.push({ index: i, op: action.op, message: msg });
        result.results.push({ index: i, op: action.op, ok: false, message: msg });
        log.warn('AI mutation hatası', { op: action.op, error: msg });
      }
    }
    if (result.errors.length > 0) {
      throw new MutationRollback();
    }
  });

  try {
    runAll();
  } catch (e) {
    if (e instanceof MutationRollback) {
      result.applied = 0;
      result.rolledBack = true;
      for (const r of result.results) {
        if (r.ok) {
          r.message = r.message ? `${r.message} (geri alındı)` : '(geri alındı)';
        }
      }
      log.warn('AI mutations geri alındı (atomik rollback)', {
        errorCount: result.errors.length,
      });
    } else {
      throw e;
    }
  }

  return result;
}

export { handlers as MUTATION_HANDLERS };
