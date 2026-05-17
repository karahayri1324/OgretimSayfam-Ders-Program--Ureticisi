import { schoolsRepo } from './repositories/schools.js';
import { teachersRepo } from './repositories/teachers.js';
import { classesRepo } from './repositories/classes.js';
import { classYearsRepo } from './repositories/class_years.js';
import { roomsRepo } from './repositories/rooms.js';
import { subjectsRepo } from './repositories/subjects.js';
import { activitiesRepo } from './repositories/activities.js';
import { constraintsRepo } from './repositories/constraints.js';
import { daysRepo } from './repositories/days.js';
import { hoursRepo } from './repositories/hours.js';
import { dayHoursRepo } from './repositories/day_hours.js';

/**
 * SchoolBundle: aktif okulun tüm verilerini tek bir nesnede toplar.
 * FET xml-builder bunu girdi olarak alır; alan isimleri electron/fet/types.ts
 * içindeki SchoolBundle ile eşleşmek zorunda.
 */
export type SchoolBundle = {
  institutionName: string;
  days: ReturnType<typeof daysRepo.list>;
  hours: ReturnType<typeof hoursRepo.list>;
  dayHours: ReturnType<typeof dayHoursRepo.list>;
  subjects: ReturnType<typeof subjectsRepo.list>;
  teachers: ReturnType<typeof teachersRepo.list>;
  classes: ReturnType<typeof classesRepo.list>;
  years: ReturnType<typeof classYearsRepo.list>;
  rooms: ReturnType<typeof roomsRepo.list>;
  activities: ReturnType<typeof activitiesRepo.list>;
  constraints: ReturnType<typeof constraintsRepo.list>;
};

/**
 * Aktif okulun tüm verilerini tek bir nesnede toplar.
 * Sadece `active = 1` kısıtlamalar dahil edilir.
 */
export function gatherSchoolData(): SchoolBundle {
  const school = schoolsRepo.getActive();
  return {
    institutionName: school.name,
    days: daysRepo.list(),
    hours: hoursRepo.list(),
    dayHours: dayHoursRepo.list(),
    subjects: subjectsRepo.list(),
    teachers: teachersRepo.list(),
    classes: classesRepo.list(),
    years: classYearsRepo.list(),
    rooms: roomsRepo.list(),
    activities: activitiesRepo.list(),
    constraints: constraintsRepo.listActive(),
  };
}

export type AIContext = {
  teachers: string[];
  classes: string[];
  subjects: string[];
  rooms: string[];
  days: string[];
  hoursPerDay: number;
};

/**
 * AI agent için kompakt context — sadece isimler + sayılar.
 * Not: AI agent'in kendi context-builder'ı (electron/ai/context-builder.ts) bunun
 * yerini alır; bu fonksiyon yedek/test amaçlı duruyor.
 */
export function buildAIContext(): AIContext {
  return {
    teachers: teachersRepo.list().map((t) => t.name),
    classes: classesRepo.list().map((c) => c.name),
    subjects: subjectsRepo.list().map((s) => s.name),
    rooms: roomsRepo.list().map((r) => r.name),
    days: daysRepo.list().map((d) => d.name),
    hoursPerDay: hoursRepo.list().length,
  };
}
