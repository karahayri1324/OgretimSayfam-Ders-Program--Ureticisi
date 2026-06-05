import { teachersRepo } from '../db/repositories/teachers.js';
import { classesRepo } from '../db/repositories/classes.js';
import { subjectsRepo } from '../db/repositories/subjects.js';
import { activitiesRepo } from '../db/repositories/activities.js';
import { constraintsRepo } from '../db/repositories/constraints.js';
import { daysRepo } from '../db/repositories/days.js';
import { hoursRepo } from '../db/repositories/hours.js';
import { dayHoursRepo } from '../db/repositories/day_hours.js';
import { timetablesRepo } from '../db/repositories/timetables.js';
import { roomsRepo } from '../db/repositories/rooms.js';
import type { Day, TimetableSlot } from '../../src/lib/types.js';

/** Günlük efektif ders saati = max(global, her-gün override uzunluğu) — FET'in slot kurduğu
 *  maxHours ile (xml-builder.ts) ve AI context'iyle (context-builder.ts #10) AYNI. Yalnız
 *  global hours.length kullanmak, day_hours override'lı günlerde AI'a yanlış slot sayısı
 *  raporlayıp gerçek boş slot'ları/sabitleme aralığını kaçırtıyordu (critic kardeş risk). */
function effectiveHoursPerDay(): number {
  const global = hoursRepo.list().length;
  const byDay = new Map<number, number>();
  let maxDay = 0;
  for (const r of dayHoursRepo.list()) {
    const c = (byDay.get(r.dayId) ?? 0) + 1;
    byDay.set(r.dayId, c);
    if (c > maxDay) maxDay = c;
  }
  return Math.max(global, maxDay);
}

/** Bir günün GERÇEK ders saati sayısı: day_hours override'ı varsa o günün override sayısı,
 *  yoksa global hours.length. xml-builder'ın per-gün efektif saatiyle (ve bloke ettiği trailing
 *  saatlerle) AYNI. effectiveHoursPerDay() (=max) tüm günlere tek değer uyguladığından kısa
 *  günlerde FET'in bloke ettiği saatleri 'boş/uygun' gösteriyordu — slot/boşluk/grid hesapları
 *  bunun yerine per-gün sayıyı kullanmalı. */
function perDayHourCounts(): { global: number; byDay: Map<number, number> } {
  const global = hoursRepo.list().length;
  const byDay = new Map<number, number>();
  for (const r of dayHoursRepo.list()) byDay.set(r.dayId, (byDay.get(r.dayId) ?? 0) + 1);
  return { global, byDay };
}
function hoursForDay(dayId: number, pd: { global: number; byDay: Map<number, number> }): number {
  return pd.byDay.get(dayId) ?? pd.global;
}


export type ToolArgs = Record<string, unknown>;
export type ToolResult = { result: unknown } | { error: string };


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

  for (const item of list) {
    if (deburr(item.name) === target) return item;
  }
  for (const item of list) {
    if (deburr(item.name).includes(target)) return item;
  }
  for (const item of list) {
    if (target.includes(deburr(item.name))) return item;
  }
  const parts = target.split(/\s+/).filter((p) => p.length >= 3);
  for (const item of list) {
    const lowName = deburr(item.name);
    for (const p of parts) {
      if (new RegExp(`\\b${escapeRegex(p)}\\b`).test(lowName)) return item;
    }
  }
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findDayByName(name: string, days: Day[]): Day | null {
  const target = deburr(name.trim());
  if (!target) return null;
  for (const d of days) if (deburr(d.name) === target) return d;
  for (const d of days) if (deburr(d.name).startsWith(target)) return d;
  for (const d of days) if (deburr(d.name).includes(target)) return d;
  for (const d of days) if (target.startsWith(deburr(d.name))) return d;
  return null;
}

function findAllByName<T extends { id: number; name: string }>(
  needle: string,
  list: T[],
  limit = 10,
): T[] {
  const target = deburr(needle.trim());
  if (!target) return [];
  const hits: T[] = [];
  for (const item of list) {
    if (deburr(item.name).includes(target)) {
      hits.push(item);
      if (hits.length >= limit) break;
    }
  }
  return hits;
}

function requireString(args: ToolArgs, key: string): string | null {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) return null;
  return v.trim();
}

const userHourToSlot = (hour: number): number => hour - 1;
const slotHourToUser = (hourIndex: number): number => hourIndex + 1;


type ActivityView = {
  class: string;
  subject: string;
  teacher: string | null;
  weeklyHours: number;
  blockDuration: number;
};

function buildActivityViews(): ActivityView[] {
  const activities = activitiesRepo.list();
  const teachers = new Map(teachersRepo.list().map((t) => [t.id, t.name]));
  const classes = new Map(classesRepo.list().map((c) => [c.id, c.name]));
  const subjects = new Map(subjectsRepo.list().map((s) => [s.id, s.name]));

  return activities.map((a) => ({
    class: classes.get(a.classId) ?? `Sınıf#${a.classId}`,
    subject: subjects.get(a.subjectId) ?? `Branş#${a.subjectId}`,
    teacher: a.teacherId !== null ? teachers.get(a.teacherId) ?? null : null,
    weeklyHours: a.weeklyHours,
    blockDuration: a.blockDuration,
  }));
}


export const tools = {
  getTeacherActivities(args: ToolArgs): ToolResult {
    const name = requireString(args, 'teacher');
    if (!name) return { error: "'teacher' parametresi gerekli." };

    const teacher = findByName(name, teachersRepo.list());
    if (!teacher) return { error: `Öğretmen bulunamadı: '${name}'` };

    const views = buildActivityViews().filter(
      (v) => v.teacher === teacher.name,
    );
    const totalHours = views.reduce((sum, v) => sum + v.weeklyHours, 0);

    return {
      result: {
        teacher: teacher.name,
        activities: views,
        totalHours,
        weeklyTargetHours: teacher.weeklyTargetHours,
      },
    };
  },

  getClassActivities(args: ToolArgs): ToolResult {
    const name = requireString(args, 'class');
    if (!name) return { error: "'class' parametresi gerekli." };

    const klass = findByName(name, classesRepo.list());
    if (!klass) return { error: `Sınıf bulunamadı: '${name}'` };

    const views = buildActivityViews().filter((v) => v.class === klass.name);
    const totalHours = views.reduce((sum, v) => sum + v.weeklyHours, 0);

    return {
      result: {
        class: klass.name,
        activities: views,
        totalHours,
      },
    };
  },

  getSubjectTeachers(args: ToolArgs): ToolResult {
    const name = requireString(args, 'subject');
    if (!name) return { error: "'subject' parametresi gerekli." };

    const subject = findByName(name, subjectsRepo.list());
    if (!subject) return { error: `Branş bulunamadı: '${name}'` };

    const teachers = teachersRepo.list();
    const fromTeacherSubjects = teachers
      .filter((t) => t.subjectIds.includes(subject.id))
      .map((t) => t.name);

    const fromActivities = Array.from(
      new Set(
        buildActivityViews()
          .filter((v) => v.subject === subject.name && v.teacher)
          .map((v) => v.teacher as string),
      ),
    );

    const all = Array.from(new Set([...fromTeacherSubjects, ...fromActivities]));

    return {
      result: {
        subject: subject.name,
        teachers: all,
        count: all.length,
      },
    };
  },

  getActivityDetails(args: ToolArgs): ToolResult {
    const className = requireString(args, 'class');
    const subjectName = requireString(args, 'subject');
    if (!className || !subjectName) {
      return { error: "'class' ve 'subject' parametreleri gerekli." };
    }

    const klass = findByName(className, classesRepo.list());
    const subject = findByName(subjectName, subjectsRepo.list());
    if (!klass) return { error: `Sınıf bulunamadı: '${className}'` };
    if (!subject) return { error: `Branş bulunamadı: '${subjectName}'` };

    const matches = buildActivityViews().filter(
      (v) => v.class === klass.name && v.subject === subject.name,
    );

    return {
      result: {
        class: klass.name,
        subject: subject.name,
        activities: matches,
        totalHours: matches.reduce((s, v) => s + v.weeklyHours, 0),
      },
    };
  },

  searchTeacher(args: ToolArgs): ToolResult {
    const q = requireString(args, 'query');
    if (!q) return { error: "'query' parametresi gerekli." };

    const all = teachersRepo.list();
    const matches = findAllByName(q, all);
    return {
      result: {
        query: q,
        matches: matches.map((t) => ({
          name: t.name,
          weeklyTargetHours: t.weeklyTargetHours,
        })),
        count: matches.length,
      },
    };
  },

  getTeachersBySubject(args: ToolArgs): ToolResult {
    const name = requireString(args, 'subject');
    if (!name) return { error: "'subject' parametresi gerekli." };

    const subject = findByName(name, subjectsRepo.list());
    if (!subject) return { error: `Branş bulunamadı: '${name}'` };

    const teachers = teachersRepo
      .list()
      .filter((t) => t.subjectIds.includes(subject.id))
      .map((t) => ({ name: t.name, weeklyTargetHours: t.weeklyTargetHours }));

    return {
      result: {
        subject: subject.name,
        teachers,
        count: teachers.length,
      },
    };
  },

  countConstraints(): ToolResult {
    const all = constraintsRepo.list();
    const byType: Record<string, number> = {};
    const bySource: Record<string, number> = { ai: 0, manual: 0 };
    let active = 0;
    for (const c of all) {
      byType[c.type] = (byType[c.type] ?? 0) + 1;
      bySource[c.source] = (bySource[c.source] ?? 0) + 1;
      if (c.active) active++;
    }
    return {
      result: {
        count: all.length,
        active,
        inactive: all.length - active,
        byType,
        bySource,
      },
    };
  },

  getScheduleSettings(): ToolResult {
    const days = daysRepo.list().map((d) => d.name);
    const hours = hoursRepo.list().map((h) => ({
      name: h.name,
      startTime: h.startTime,
      endTime: h.endTime,
    }));
    return {
      result: {
        daysCount: days.length,
        hoursPerDay: effectiveHoursPerDay(),
        days,
        hours,
      },
    };
  },

  listActiveConstraints(): ToolResult {
    const all = constraintsRepo.listActive();
    const summary = all.map((c) => ({
      id: c.id,
      type: c.type,
      weight: c.weight,
      source: c.source,
      params: c.params,
    }));
    return {
      result: {
        count: summary.length,
        constraints: summary,
      },
    };
  },

  validateSchedule(_args: ToolArgs): ToolResult {
    const teachers = teachersRepo.list();
    const classes = classesRepo.list();
    const activities = activitiesRepo.list();
    const days = daysRepo.list();
    const hoursPerDay = effectiveHoursPerDay() || 8;
    const slotsPerWeek = days.length * hoursPerDay;

    const issues: Array<{
      severity: 'error' | 'warn' | 'info';
      kind: string;
      message: string;
      target?: string;
    }> = [];

    if (teachers.length === 0) {
      issues.push({
        severity: 'error',
        kind: 'NO_TEACHERS',
        message: 'Hiç öğretmen tanımlı değil.',
      });
    }
    if (classes.length === 0) {
      issues.push({
        severity: 'error',
        kind: 'NO_CLASSES',
        message: 'Hiç sınıf tanımlı değil.',
      });
    }
    if (activities.length === 0) {
      issues.push({
        severity: 'error',
        kind: 'NO_ACTIVITIES',
        message: 'Hiç aktivite (ders dağılımı) tanımlı değil.',
      });
    }

    for (const c of classes) {
      const classActs = activities.filter((a) => a.classId === c.id);
      const total = classActs.reduce((s, a) => s + a.weeklyHours, 0);
      if (total > slotsPerWeek) {
        issues.push({
          severity: 'error',
          kind: 'CLASS_HOURS_EXCEED',
          message:
            `${c.name} sınıfında haftalık ${total} saatlik atama var ama ` +
            `gün × saat = ${slotsPerWeek}. Fazla ${total - slotsPerWeek} saat sığmaz.`,
          target: c.name,
        });
      } else if (total > slotsPerWeek * 0.95 && total <= slotsPerWeek) {
        issues.push({
          severity: 'warn',
          kind: 'CLASS_NEAR_LIMIT',
          message:
            `${c.name} sınıfı kapasitenin %${Math.round((total / slotsPerWeek) * 100)}'sini ` +
            `dolduruyor — FET'in maneuver alanı az, çözüm zor olabilir.`,
          target: c.name,
        });
      } else if (total === 0) {
        issues.push({
          severity: 'warn',
          kind: 'CLASS_EMPTY',
          message: `${c.name} sınıfında hiç ders atanmamış.`,
          target: c.name,
        });
      }
    }

    for (const t of teachers) {
      const teacherActs = activities.filter((a) => a.teacherId === t.id);
      const total = teacherActs.reduce((s, a) => s + a.weeklyHours, 0);
      if (total > t.weeklyTargetHours) {
        issues.push({
          severity: 'warn',
          kind: 'TEACHER_OVER_TARGET',
          message:
            `${t.name} öğretmenine ${total} saat atanmış ama hedefi ${t.weeklyTargetHours}. ` +
            `Fazla ${total - t.weeklyTargetHours} saat — overload.`,
          target: t.name,
        });
      }
    }

    for (const a of activities) {
      if (a.teacherId == null) {
        const klass = classes.find((c) => c.id === a.classId);
        const subject = subjectsRepo.list().find((s) => s.id === a.subjectId);
        issues.push({
          severity: 'warn',
          kind: 'ACTIVITY_NO_TEACHER',
          message:
            `${klass?.name ?? '?'} × ${subject?.name ?? '?'} aktivitesinde öğretmen atanmamış. ` +
            `FET random atayacak.`,
          target: `${klass?.name ?? '?'} × ${subject?.name ?? '?'}`,
        });
      }
    }

    const summary = {
      totalIssues: issues.length,
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warn').length,
      readyToGenerate: issues.filter((i) => i.severity === 'error').length === 0,
    };

    return { result: { ...summary, issues } };
  },

  getTimetableStats(args: ToolArgs): ToolResult {
    const latest = timetablesRepo.latest();
    if (!latest) {
      return {
        result: {
          generated: false,
          message: 'Henüz program üretilmedi.',
        },
      };
    }

    const className = requireString(args, 'class');
    let slots = latest.slots;
    let scope = 'tüm okul';
    if (className) {
      const klass = findByName(className, classesRepo.list());
      if (!klass) return { error: `Sınıf bulunamadı: '${className}'` };
      slots = slots.filter((s) => s.classId === klass.id);
      scope = klass.name;
    }

    const days = daysRepo.list();
    const pd = perDayHourCounts();

    const byDay = new Map<number, number>();
    for (const s of slots) {
      byDay.set(s.dayIndex, (byDay.get(s.dayIndex) ?? 0) + 1);
    }
    // Kapasiteyi per-gün topla; kısa günler (day_hours override) daha az slot içerir. Sabit
    // max saat kullanmak gaps'i şişiriyor ve emptiestDay'i yanıltıyordu.
    const dayStats = days.map((d) => {
      const capacity = hoursForDay(d.id, pd);
      const used = byDay.get(d.orderIndex) ?? 0;
      return { day: d.name, slots: used, capacity, fillRatio: capacity > 0 ? used / capacity : 0 };
    });
    const totalCapacity = dayStats.reduce((sum, s) => sum + s.capacity, 0);
    const busiest = [...dayStats].sort((a, b) => b.slots - a.slots)[0];
    // emptiest: mutlak slot yerine doluluk oranına göre (az saatli kısa gün 'en boş' sanılmasın).
    const emptiest = [...dayStats].sort((a, b) => a.fillRatio - b.fillRatio)[0];

    const expectedSlots = className
      ? totalCapacity
      : classesRepo.list().length * totalCapacity;
    const gaps = Math.max(0, expectedSlots - slots.length);

    const teacherLoad = new Map<string, number>();
    for (const s of slots) {
      if (!s.teacherName) continue;
      teacherLoad.set(s.teacherName, (teacherLoad.get(s.teacherName) ?? 0) + 1);
    }
    const topTeachers = [...teacherLoad.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, hours]) => ({ teacher: name, hours }));

    const roomUse = new Map<string, number>();
    for (const s of slots) {
      if (!s.roomName) continue;
      roomUse.set(s.roomName, (roomUse.get(s.roomName) ?? 0) + 1);
    }
    const topRooms = [...roomUse.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, hours]) => ({ room: name, hours }));

    return {
      result: {
        generated: true,
        generatedAt: latest.generatedAt,
        status: latest.status,
        scope,
        totalSlots: slots.length,
        expectedSlots,
        gaps,
        conflicts: latest.conflicts.length,
        durationMs: latest.durationMs,
        byDay: dayStats,
        busiestDay: busiest?.day ?? null,
        emptiestDay: emptiest?.day ?? null,
        topTeachers,
        topRooms,
      },
    };
  },


  getTimetableSlot(args: ToolArgs): ToolResult {
    const className = requireString(args, 'class');
    const dayName = requireString(args, 'day');
    if (!className || !dayName) return { error: "'class' ve 'day' gerekli." };
    const hourRaw = args.hour;
    const hour = typeof hourRaw === 'number' ? hourRaw : parseInt(String(hourRaw), 10);
    if (!Number.isFinite(hour) || hour < 1) return { error: "'hour' 1+ olmalı." };

    const latest = timetablesRepo.latest();
    if (!latest) {
      return { result: { generated: false, message: 'Henüz program üretilmedi.' } };
    }
    const klass = findByName(className, classesRepo.list());
    if (!klass) return { error: `Sınıf bulunamadı: '${className}'` };
    const day = findDayByName(dayName, daysRepo.list());
    if (!day) return { error: `Gün bulunamadı: '${dayName}'` };

    const slot = latest.slots.find(
      (s) =>
        s.classId === klass.id &&
        s.dayIndex === day.orderIndex &&
        s.hourIndex === userHourToSlot(hour),
    );
    if (!slot) {
      return {
        result: {
          generated: true,
          found: false,
          class: klass.name,
          day: day.name,
          hour,
          message: `${klass.name} ${day.name} ${hour}. ders'te boşluk var.`,
        },
      };
    }
    return {
      result: {
        generated: true,
        found: true,
        class: klass.name,
        day: day.name,
        hour,
        subject: slot.subjectName,
        teacher: slot.teacherName,
        room: slot.roomName,
        activityId: slot.sourceActivityId ?? slot.activityId,
      },
    };
  },

  getClassTimetable(args: ToolArgs): ToolResult {
    const className = requireString(args, 'class');
    if (!className) return { error: "'class' gerekli." };

    const latest = timetablesRepo.latest();
    if (!latest) {
      return { result: { generated: false, message: 'Henüz program üretilmedi.' } };
    }
    const klass = findByName(className, classesRepo.list());
    if (!klass) return { error: `Sınıf bulunamadı: '${className}'` };

    const days = daysRepo.list();
    const pd = perDayHourCounts();

    const grid: Array<Array<{ subject: string; teacher: string; room: string | null } | null>> = [];
    for (let d = 0; d < days.length; d++) {
      const row: typeof grid[number] = [];
      // Her günün satırı yalnız o günün gerçek saat sayısı kadar; kısa günlerde bloke saatler
      // için hayalet boş hücre üretme.
      const dayHours = hoursForDay(days[d]!.id, pd) || pd.global || 8;
      for (let h = 0; h < dayHours; h++) row.push(null);
      grid.push(row);
    }
    for (const s of latest.slots) {
      if (s.classId !== klass.id) continue;
      const dayIdx = days.findIndex((d) => d.orderIndex === s.dayIndex);
      if (dayIdx < 0) continue;
      const hourSlot = s.hourIndex;
      if (hourSlot < 0 || hourSlot >= grid[dayIdx]!.length) continue;
      grid[dayIdx]![hourSlot] = {
        subject: s.subjectName,
        teacher: s.teacherName,
        room: s.roomName,
      };
    }

    return {
      result: {
        generated: true,
        class: klass.name,
        days: days.map((d) => d.name),
        hoursPerDay: pd.global || 8,
        grid,
        totalSlots: latest.slots.filter((s) => s.classId === klass.id).length,
      },
    };
  },

  getTeacherTimetable(args: ToolArgs): ToolResult {
    const teacherName = requireString(args, 'teacher');
    if (!teacherName) return { error: "'teacher' gerekli." };

    const latest = timetablesRepo.latest();
    if (!latest) {
      return { result: { generated: false, message: 'Henüz program üretilmedi.' } };
    }
    const teacher = findByName(teacherName, teachersRepo.list());
    if (!teacher) return { error: `Öğretmen bulunamadı: '${teacherName}'` };

    const days = daysRepo.list();
    const mine = latest.slots.filter((s) => s.teacherId === teacher.id);
    const slots = mine
      .sort((a, b) => a.dayIndex - b.dayIndex || a.hourIndex - b.hourIndex)
      .map((s) => {
        const dayObj = days.find((d) => d.orderIndex === s.dayIndex);
        return {
          day: dayObj?.name ?? `gün${s.dayIndex}`,
          hour: slotHourToUser(s.hourIndex),
          class: s.className,
          subject: s.subjectName,
          room: s.roomName,
        };
      });

    let gaps = 0;
    const byDay = new Map<number, number[]>();
    for (const s of mine) {
      const arr = byDay.get(s.dayIndex) ?? [];
      arr.push(s.hourIndex);
      byDay.set(s.dayIndex, arr);
    }
    for (const hours of byDay.values()) {
      hours.sort((a, b) => a - b);
      if (hours.length < 2) continue;
      const min = hours[0]!;
      const max = hours[hours.length - 1]!;
      gaps += max - min + 1 - hours.length;
    }

    return {
      result: {
        generated: true,
        teacher: teacher.name,
        totalSlots: slots.length,
        gaps,
        slots,
      },
    };
  },

  getRoomTimetable(args: ToolArgs): ToolResult {
    const roomName = requireString(args, 'room');
    if (!roomName) return { error: "'room' gerekli." };

    const latest = timetablesRepo.latest();
    if (!latest) {
      return { result: { generated: false, message: 'Henüz program üretilmedi.' } };
    }
    const room = findByName(roomName, roomsRepo.list());
    if (!room) return { error: `Derslik bulunamadı: '${roomName}'` };

    const days = daysRepo.list();
    const slots = latest.slots
      .filter((s) => s.roomId === room.id)
      .sort((a, b) => a.dayIndex - b.dayIndex || a.hourIndex - b.hourIndex)
      .map((s) => {
        const dayObj = days.find((d) => d.orderIndex === s.dayIndex);
        return {
          day: dayObj?.name ?? `gün${s.dayIndex}`,
          hour: slotHourToUser(s.hourIndex),
          class: s.className,
          subject: s.subjectName,
          teacher: s.teacherName,
        };
      });
    return {
      result: {
        generated: true,
        room: room.name,
        totalSlots: slots.length,
        slots,
      },
    };
  },

  getDayTimetable(args: ToolArgs): ToolResult {
    const dayName = requireString(args, 'day');
    if (!dayName) return { error: "'day' gerekli." };
    const classFilter = requireString(args, 'class');

    const latest = timetablesRepo.latest();
    if (!latest) {
      return { result: { generated: false, message: 'Henüz program üretilmedi.' } };
    }
    const day = findDayByName(dayName, daysRepo.list());
    if (!day) return { error: `Gün bulunamadı: '${dayName}'` };

    let classId: number | null = null;
    if (classFilter) {
      const klass = findByName(classFilter, classesRepo.list());
      if (!klass) return { error: `Sınıf bulunamadı: '${classFilter}'` };
      classId = klass.id;
    }

    const slots = latest.slots
      .filter(
        (s) => s.dayIndex === day.orderIndex && (classId == null || s.classId === classId),
      )
      .sort((a, b) => a.hourIndex - b.hourIndex)
      .map((s) => ({
        hour: slotHourToUser(s.hourIndex),
        class: s.className,
        subject: s.subjectName,
        teacher: s.teacherName,
        room: s.roomName,
      }));

    return {
      result: {
        generated: true,
        day: day.name,
        ...(classFilter && { class: classFilter }),
        totalSlots: slots.length,
        slots,
      },
    };
  },

  whoIsTeaching(args: ToolArgs): ToolResult {
    const dayName = requireString(args, 'day');
    if (!dayName) return { error: "'day' gerekli." };
    const hourRaw = args.hour;
    const hour = typeof hourRaw === 'number' ? hourRaw : parseInt(String(hourRaw), 10);
    if (!Number.isFinite(hour) || hour < 1) return { error: "'hour' 1+ olmalı." };

    const latest = timetablesRepo.latest();
    if (!latest) {
      return { result: { generated: false, message: 'Henüz program üretilmedi.' } };
    }
    const day = findDayByName(dayName, daysRepo.list());
    if (!day) return { error: `Gün bulunamadı: '${dayName}'` };

    const assignments = latest.slots
      .filter((s) => s.dayIndex === day.orderIndex && s.hourIndex === userHourToSlot(hour))
      .map((s) => ({
        class: s.className,
        subject: s.subjectName,
        teacher: s.teacherName,
        room: s.roomName,
      }));

    return {
      result: {
        generated: true,
        day: day.name,
        hour,
        totalAssignments: assignments.length,
        assignments,
      },
    };
  },

  getFreeSlots(args: ToolArgs): ToolResult {
    const className = requireString(args, 'class');
    const teacherName = requireString(args, 'teacher');
    const roomName = requireString(args, 'room');
    if (!className && !teacherName && !roomName) {
      return { error: "'class', 'teacher' veya 'room'dan en az biri gerekli." };
    }

    const latest = timetablesRepo.latest();
    if (!latest) {
      return { result: { generated: false, message: 'Henüz program üretilmedi.' } };
    }
    const days = daysRepo.list();
    const pd = perDayHourCounts();

    let entity: string;
    let entityType: 'class' | 'teacher' | 'room';
    let occupiedKey: (s: TimetableSlot) => boolean;

    if (className) {
      const klass = findByName(className, classesRepo.list());
      if (!klass) return { error: `Sınıf bulunamadı: '${className}'` };
      entity = klass.name;
      entityType = 'class';
      occupiedKey = (s) => s.classId === klass.id;
    } else if (teacherName) {
      const teacher = findByName(teacherName, teachersRepo.list());
      if (!teacher) return { error: `Öğretmen bulunamadı: '${teacherName}'` };
      entity = teacher.name;
      entityType = 'teacher';
      occupiedKey = (s) => s.teacherId === teacher.id;
    } else {
      const room = findByName(roomName!, roomsRepo.list());
      if (!room) return { error: `Derslik bulunamadı: '${roomName}'` };
      entity = room.name;
      entityType = 'room';
      occupiedKey = (s) => s.roomId === room.id;
    }

    const occupied = new Set<string>();
    for (const s of latest.slots) {
      if (occupiedKey(s)) occupied.add(`${s.dayIndex}:${s.hourIndex}`);
    }

    const freeSlots: Array<{ day: string; hour: number }> = [];
    for (const d of days) {
      // Kısa günlerde FET bloke saatleri 'boş' gösterme: o günün gerçek saat sayısıyla sınırla.
      const dayHours = hoursForDay(d.id, pd) || pd.global || 8;
      for (let h = 0; h < dayHours; h++) {
        if (!occupied.has(`${d.orderIndex}:${h}`)) {
          freeSlots.push({ day: d.name, hour: slotHourToUser(h) });
        }
      }
    }

    return {
      result: {
        generated: true,
        entity,
        entityType,
        totalFree: freeSlots.length,
        freeSlots,
      },
    };
  },
} as const;

export type ToolName = keyof typeof tools;

export const KNOWN_TOOLS: readonly string[] = Object.keys(tools);

export function executeTool(name: string, args: ToolArgs = {}): ToolResult {
  if (!Object.prototype.hasOwnProperty.call(tools, name)) {
    return { error: `Bilinmeyen tool: '${name}'. Geçerli tool'lar: ${KNOWN_TOOLS.join(', ')}` };
  }
  const fn = (tools as Record<string, (a: ToolArgs) => ToolResult>)[name]!;
  try {
    return fn(args ?? {});
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: `Tool çalıştırılırken hata: ${msg}` };
  }
}
