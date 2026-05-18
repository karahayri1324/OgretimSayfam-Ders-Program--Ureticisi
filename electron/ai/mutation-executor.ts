import { teachersRepo } from '../db/repositories/teachers.js';
import { subjectsRepo } from '../db/repositories/subjects.js';
import { classesRepo } from '../db/repositories/classes.js';
import { classYearsRepo } from '../db/repositories/class_years.js';
import { roomsRepo } from '../db/repositories/rooms.js';
import { activitiesRepo } from '../db/repositories/activities.js';
import { daysRepo } from '../db/repositories/days.js';
import { hoursRepo } from '../db/repositories/hours.js';
import { constraintsRepo } from '../db/repositories/constraints.js';
import { settingsRepo } from '../db/repositories/settings.js';
import { timetablesRepo } from '../db/repositories/timetables.js';
import type { ConstraintType, TimetableSlot } from '../../src/lib/types.js';
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

function optString(params: Record<string, unknown>, key: string): string | undefined {
  const v = params[key];
  if (typeof v !== 'string' || !v.trim()) return undefined;
  return v.trim();
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
    teachersRepo.update(teacher.id, patch);
    return `'${teacher.name}' öğretmeni güncellendi.`;
  },

  delete_teacher(params) {
    const name = requireString(params, 'name');
    const teacher = findByName(name, teachersRepo.list());
    if (!teacher) throw new Error(`Öğretmen bulunamadı: '${name}'`);
    teachersRepo.delete(teacher.id);
    return `'${teacher.name}' öğretmeni silindi.`;
  },

  add_subject(params) {
    const name = requireString(params, 'name');
    const existing = findByName(name, subjectsRepo.list());
    if (existing) {
      return `Branş zaten var: ${existing.name} (id=${existing.id}). Atlandı.`;
    }
    const id = subjectsRepo.create({
      name,
      shortCode: optString(params, 'shortCode') ?? null,
      color: optString(params, 'color') ?? null,
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
    if (color !== undefined) patch['color'] = color;
    const notes = optString(params, 'notes');
    if (notes !== undefined) patch['notes'] = notes;
    subjectsRepo.update(subject.id, patch);
    return `'${subject.name}' branşı güncellendi.`;
  },

  delete_subject(params) {
    const name = requireString(params, 'name');
    const subject = findByName(name, subjectsRepo.list());
    if (!subject) throw new Error(`Branş bulunamadı: '${name}'`);
    subjectsRepo.delete(subject.id);
    return `'${subject.name}' branşı silindi.`;
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
    const id = classesRepo.create({ name, yearId, studentCount });
    return `'${name}' sınıfı eklendi (id=${id})${yearName ? `, kademe: ${yearName}.` : '.'}`;
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
    classesRepo.update(klass.id, patch);
    return `'${klass.name}' sınıfı güncellendi.`;
  },

  delete_class(params) {
    const name = requireString(params, 'name');
    const klass = findByName(name, classesRepo.list());
    if (!klass) throw new Error(`Sınıf bulunamadı: '${name}'`);
    classesRepo.delete(klass.id);
    return `'${klass.name}' sınıfı silindi.`;
  },

  add_class_year(params) {
    const name = requireString(params, 'name');
    const existing = findByName(name, classYearsRepo.list());
    if (existing) return `Kademe zaten var: ${existing.name}. Atlandı.`;
    const orderIndex = optInt(params, 'orderIndex') ?? classYearsRepo.list().length;
    const id = classYearsRepo.create(name, orderIndex);
    return `'${name}' kademesi eklendi (id=${id}).`;
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
    roomsRepo.update(room.id, patch);
    return `'${room.name}' dersliği güncellendi.`;
  },

  delete_room(params) {
    const name = requireString(params, 'name');
    const room = findByName(name, roomsRepo.list());
    if (!room) throw new Error(`Derslik bulunamadı: '${name}'`);
    roomsRepo.delete(room.id);
    return `'${room.name}' dersliği silindi.`;
  },

  add_activity(params) {
    const className = requireString(params, 'class');
    const subjectName = requireString(params, 'subject');
    const teacherName = optString(params, 'teacher');
    const weeklyHours = optInt(params, 'weeklyHours') ?? 1;
    const blockDuration = optInt(params, 'blockDuration') ?? 1;
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
    const id = activitiesRepo.upsert({
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
    const existing = all.find(
      (a) => a.classId === klass.id && a.subjectId === subject.id,
    );
    if (!existing) {
      throw new Error(`${className} × ${subjectName} aktivitesi bulunamadı.`);
    }
    const weeklyHours = optInt(params, 'weeklyHours') ?? existing.weeklyHours;
    const blockDuration = optInt(params, 'blockDuration') ?? existing.blockDuration;
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
    const existing = all.find(
      (a) => a.classId === klass.id && a.subjectId === subject.id,
    );
    if (!existing) {
      throw new Error(`${className} × ${subjectName} aktivitesi bulunamadı.`);
    }
    activitiesRepo.delete(existing.id);
    return `${className} × '${subjectName}' aktivitesi silindi.`;
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

  add_hour(params) {
    const name = requireString(params, 'name');
    const startTime = optString(params, 'startTime') ?? null;
    const endTime = optString(params, 'endTime') ?? null;
    const current = hoursRepo.list();
    if (current.some((h) => deburr(h.name) === deburr(name))) {
      return `Ders saati zaten var: ${name}. Atlandı.`;
    }
    hoursRepo.replaceAll([
      ...current.map((h) => ({
        name: h.name,
        startTime: h.startTime,
        endTime: h.endTime,
      })),
      { name, startTime, endTime },
    ]);
    return `'${name}' ders saati eklendi.`;
  },

  delete_hour(params) {
    const name = requireString(params, 'name');
    const current = hoursRepo.list();
    const next = current.filter((h) => deburr(h.name) !== deburr(name));
    if (next.length === current.length) {
      throw new Error(`Ders saati bulunamadı: '${name}'`);
    }
    hoursRepo.replaceAll(
      next.map((h) => ({
        name: h.name,
        startTime: h.startTime,
        endTime: h.endTime,
      })),
    );
    return `'${name}' ders saati kaldırıldı.`;
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
    const active = Boolean(params.active);
    const list = constraintsRepo.list();
    const c = list.find((x) => x.id === id);
    if (!c) throw new Error(`Kısıtlama bulunamadı (id=${id}).`);
    constraintsRepo.toggle(id, active);
    return `Kısıtlama #${id} ${active ? 'aktif' : 'pasif'} hale getirildi.`;
  },

  add_constraint(params) {
    const type = requireString(params, 'type') as ConstraintType;
    const weight = Number(params.weight ?? 100);
    if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
      throw new Error('weight 0-100 arası olmalı.');
    }
    const constraintParams =
      typeof params.params === 'object' && params.params !== null
        ? (params.params as Record<string, unknown>)
        : {};
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
    const type = requireString(params, 'type') as ConstraintType;
    const filter =
      typeof params.filter === 'object' && params.filter !== null
        ? (params.filter as Record<string, unknown>)
        : {};
    const weight = Number(params.weight ?? 100);
    if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
      throw new Error('weight 0-100 arası olmalı.');
    }
    const innerParams =
      typeof params.params === 'object' && params.params !== null
        ? (params.params as Record<string, unknown>)
        : {};

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
      teacherId = ensureTeacher(teacherName);
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
    const act = matches[0]!;

    const existing = constraintsRepo.list().find(
      (c) =>
        c.type === 'ACTIVITY_FIXED_TIME' &&
        (c.params as { activityId?: number }).activityId === act.id &&
        (c.params as { day?: string }).day === day &&
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
      params: { activityId: act.id, day, hour },
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
        s.hourIndex === hour,
    );
    if (!slot) {
      throw new Error(
        `${className} ${day} ${hour}. ders'te programda boşluk var (kilitlenecek aktivite yok).`,
      );
    }

    const existing = constraintsRepo.list().find(
      (c) =>
        c.type === 'ACTIVITY_FIXED_TIME' &&
        (c.params as { activityId?: number }).activityId === slot.activityId &&
        (c.params as { day?: string }).day === day &&
        (c.params as { hour?: number }).hour === hour,
    );
    if (existing) {
      return `Zaten kilitli: ${className} ${day} ${hour}. ders → ${slot.subjectName}.`;
    }

    constraintsRepo.add({
      type: 'ACTIVITY_FIXED_TIME',
      weight: 100,
      active: true,
      params: { activityId: slot.activityId, day, hour },
      source: 'ai',
      notes: `Slot kilidi (mevcut): ${className} ${day} ${hour}. → ${slot.subjectName}`,
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
      if (
        cp.activityId !== undefined &&
        targetActivityIds.has(cp.activityId) &&
        cp.day === day &&
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
        const fromName = optString(params, 'fromTeacher');
        if (fromName) {
          const ft = findByName(fromName, teachersRepo.list());
          act = ft ? matches.find((m) => m.teacherId === ft.id) : matches[0];
        } else {
          act = matches[0];
        }
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
        s.hourIndex === hour1,
    );
    const slotB = latest.slots.find(
      (s: TimetableSlot) =>
        s.classId === klass2.id &&
        s.dayIndex === dayObj2.orderIndex &&
        s.hourIndex === hour2,
    );
    if (!slotA || !slotB) {
      throw new Error(
        "Slot'lardan biri programda yok (ya boşluk var ya da gün/saat dışı).",
      );
    }

    for (const c of constraintsRepo.list()) {
      if (c.type !== 'ACTIVITY_FIXED_TIME') continue;
      const aid = (c.params as { activityId?: number }).activityId;
      if (aid === slotA.activityId || aid === slotB.activityId) {
        constraintsRepo.delete(c.id);
      }
    }

    constraintsRepo.add({
      type: 'ACTIVITY_FIXED_TIME',
      weight: 100,
      active: true,
      params: { activityId: slotA.activityId, day: day2, hour: hour2 },
      source: 'ai',
      notes: `Swap: ${class1} ${day1}/${hour1} ↔ ${class2} ${day2}/${hour2}`,
    });
    constraintsRepo.add({
      type: 'ACTIVITY_FIXED_TIME',
      weight: 100,
      active: true,
      params: { activityId: slotB.activityId, day: day1, hour: hour1 },
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
};

function nameMatches(name: string, target: string): boolean {
  const a = deburr(name.trim());
  const b = deburr(target.trim());
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  return false;
}

export function applyMutations(actions: DataMutationAction[]): DataMutationApplyResult {
  const result: DataMutationApplyResult = {
    applied: 0,
    errors: [],
    results: [],
  };
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
  return result;
}

export { handlers as MUTATION_HANDLERS };
