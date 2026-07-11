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

// NOT: Buradaki eski buildAIContext (bayat hoursPerDay=global saat sayısı; CONSTRAINTS alanı
// yok) KALDIRILDI. Kanonik ve tek kullanılan sürüm electron/ai/context-builder.ts'te
// (day_hours farkında, CONSTRAINTS dahil, INFERENCE_CONTRACT ile uyumlu). İki paralel
// tanımdan biri yanlışlıkla import edilirse model OOD context alırdı — o yüzden tek bıraktık.
