import { z } from 'zod';
import { WRITABLE_SETTING_KEYS } from '../db/repositories/settings.js';
import { MAX_WEEKLY_HOURS, MAX_BLOCK_DURATION } from '../../src/lib/limits.js';

const nullableString = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v));

const intId = z.number().int().positive();

export const TeacherInputSchema = z.object({
  name: z.string().trim().min(1, 'Öğretmen adı boş olamaz'),
  weeklyTargetHours: z.number().int().min(0).max(60).default(0),
  notes: nullableString,
  subjectIds: z.array(intId).optional(),
});
export const TeacherPatchSchema = TeacherInputSchema.partial();

export const SubjectInputSchema = z.object({
  name: z.string().trim().min(1, 'Ders adı boş olamaz'),
  shortCode: nullableString,
  color: nullableString,
  notes: nullableString,
});
export const SubjectPatchSchema = SubjectInputSchema.partial();

export const RoomInputSchema = z.object({
  name: z.string().trim().min(1, 'Derslik adı boş olamaz'),
  capacity: z.number().int().min(0).max(1000).default(30),
  building: nullableString,
  notes: nullableString,
});
export const RoomPatchSchema = RoomInputSchema.partial();

export const ClassInputSchema = z.object({
  yearId: z.union([intId, z.null()]).optional(),
  name: z.string().trim().min(1, 'Sınıf adı boş olamaz'),
  studentCount: z.number().int().min(0).max(100).default(0),
  homeRoomId: z.union([intId, z.null()]).optional(),
});
export const ClassPatchSchema = ClassInputSchema.partial();

export const ActivityInputSchema = z.object({
  id: intId.optional(),
  classId: intId,
  subjectId: intId,
  teacherId: z.union([intId, z.null()]).optional(),
  weeklyHours: z.number().int().min(1).max(MAX_WEEKLY_HOURS),
  blockDuration: z.number().int().min(1).max(MAX_BLOCK_DURATION).default(1),
  notes: nullableString,
});

export const ConstraintTypeEnum = z.enum([
  'TEACHER_NOT_AVAILABLE',
  'TEACHER_MAX_DAYS_PER_WEEK',
  'TEACHER_MAX_HOURS_DAILY',
  'TEACHER_MAX_GAPS_PER_DAY',
  'TEACHER_MAX_GAPS_PER_WEEK',
  'TEACHERS_MAX_GAPS_PER_WEEK',
  'CLASS_NOT_AVAILABLE',
  'CLASS_MAX_GAPS_PER_WEEK',
  'SUBJECT_NOT_ON_DAY',
  'SUBJECT_PREFERRED_HOURS',
  'SUBJECT_LAST_HOUR_OF_DAY',
  'SUBJECT_MAX_HOURS_DAILY',
  'SUBJECT_CONSECUTIVE_HOURS',
  'ROOM_NOT_AVAILABLE',
  'SUBJECT_PREFERRED_ROOM',
  'TEACHER_HOME_ROOM',
  'CLASS_HOME_ROOM',
  'TEACHER_MIN_HOURS_DAILY',
  'TEACHER_NOT_AVAILABLE_INTERVAL',
  'TEACHER_MIN_DAYS_PER_WEEK',
  'TEACHER_MAX_HOURS_CONTINUOUSLY',
  'TEACHER_MAX_BUILDING_CHANGES_PER_DAY',
  'TEACHER_MAX_BUILDING_CHANGES_PER_WEEK',
  'TEACHER_MIN_GAPS_BETWEEN_BUILDING_CHANGES',
  'TEACHER_NOT_FIRST_HOUR',
  'TEACHER_NOT_LAST_HOUR',
  'TEACHER_MIN_REST_BETWEEN_DAYS',
  'CLASS_MAX_HOURS_DAILY',
  'CLASS_MIN_HOURS_DAILY',
  'CLASS_MAX_GAPS_PER_DAY',
  'CLASS_EARLY_MAX_BEGINNINGS',
  'CLASS_MAX_BUILDING_CHANGES_PER_DAY',
  'CLASS_MIN_GAPS_BETWEEN_BUILDING_CHANGES',
  'CLASS_NOT_FIRST_HOUR',
  'CLASS_MAX_HOURS_CONTINUOUSLY',
  'ACTIVITY_FIXED_TIME',
  'ACTIVITIES_SAME_STARTING_TIME',
  'ACTIVITIES_NOT_OVERLAPPING',
  'ACTIVITIES_SAME_STARTING_DAY',
  'ACTIVITY_ENDS_STUDENTS_DAY',
  'SUBJECT_NOT_FIRST_HOUR',
  'MIN_DAYS_BETWEEN_ACTIVITIES_CUSTOM',
  'MIN_GAPS_BETWEEN_ACTIVITIES',
  'MAX_GAPS_BETWEEN_ACTIVITIES',
  'ACTIVITY_PREFERRED_STARTING_TIMES',
  'SUBJECT_PREFERRED_ROOMS',
  'TEACHER_PREFERRED_ROOM',
  'TEACHER_PREFERRED_ROOMS',
  'ACTIVITY_PREFERRED_ROOM',
  'ACTIVITY_PREFERRED_ROOMS',
  'SUBJECT_ACTIVITY_TAG_PREFERRED_ROOM',
  'ACTIVITIES_OCCUPY_MAX_DIFFERENT_ROOMS',
  'STUDENTS_SET_HOME_ROOMS',
  'BREAK_TIMES',
  'ALL_TEACHERS_MAX_HOURS_DAILY',
  'ALL_TEACHERS_MAX_DAYS_PER_WEEK',
  'STUDENTS_MAX_GAPS_PER_WEEK',
  'STUDENTS_EARLY_MAX_BEGINNINGS',
  'STUDENTS_MAX_HOURS_DAILY',
  'MAX_TOTAL_ACTIVITIES_FROM_SET',
  'TWO_ACTIVITIES_CONSECUTIVE',
]);

export const ConstraintInputSchema = z.object({
  type: ConstraintTypeEnum,
  weight: z.number().int().min(0).max(100),
  active: z.boolean().optional().default(true),
  params: z.record(z.unknown()).default({}),
  source: z.enum(['ai', 'manual']),
  aiMessageId: z.union([intId, z.null()]).optional(),
  notes: nullableString,
});

const DayEntrySchema = z.union([
  z.string().trim().min(1, 'Gün adı boş olamaz'),
  z
    .object({
      name: z.string().trim().min(1, 'Gün adı boş olamaz'),
      orderIndex: z.number().int().min(0).optional(),
    })
    .transform((v) => v.name),
]);
export const DaysSchema = z
  .array(DayEntrySchema)
  .min(1, 'En az bir gün gerekli');

export const HourEntrySchema = z.object({
  name: z.string().trim().min(1, 'Ders saati adı boş olamaz'),
  startTime: nullableString,
  endTime: nullableString,
});
export const HoursSchema = z
  .array(HourEntrySchema)
  .min(1, 'En az bir ders saati gerekli');

export const DayHourEntrySchema = z.object({
  orderIndex: z.number().int().min(0).max(40),
  name: nullableString,
  startTime: nullableString,
  endTime: nullableString,
});
export const SetDayHoursSchema = z.object({
  dayId: intId,
  entries: z.array(DayHourEntrySchema),
});

export const BulkAdjustBreaksSchema = z.object({
  deltaMinutes: z.number().int().min(-180).max(180),
  mode: z.enum(['start', 'end', 'break']).default('break'),
  dayIds: z.array(intId).optional(),
});

export const SetSplitSchema = z.object({
  activityIds: z.array(intId).min(1).max(8),
});

export const AIParseSchema = z.string().trim().min(1, 'Mesaj boş olamaz');

export const SettingsPatchSchema = z
  .record(
    z
      .union([z.string(), z.number(), z.boolean(), z.null()])
      .transform((v) => (v == null ? '' : String(v))),
  )
  .transform((obj) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (WRITABLE_SETTING_KEYS.has(k)) out[k] = v;
    }
    return out;
  });

export const GenerateRunOptsSchema = z
  .object({
    timeLimit: z.number().int().min(5).max(3600).optional(),
  })
  .optional();
