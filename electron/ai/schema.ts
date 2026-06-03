import { z } from 'zod';
import type { AIResponse } from '../../src/lib/types.js';


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

export const SlotSchema = z.object({
  day: z.string().nullable(),
  hour: z.number().int().min(1).max(20).nullable(),
});

export const AIConstraintSchema = z.object({
  type: ConstraintTypeEnum,
  weight: z.number().int().min(0).max(100),
  active: z.boolean(),
  params: z.record(z.any()),
});

export const ConstraintResponseSchema = z.object({
  kind: z.literal('constraint').optional(),
  constraints: z.array(AIConstraintSchema),
  confidence: z.number().min(0).max(1),
  explanation: z.string(),
  warnings: z.array(z.string()).default([]),
  unresolved: z.array(z.string()).default([]),
});

export const QueryResponseSchema = z.object({
  kind: z.literal('query'),
  answer: z.string(),
  data: z.array(z.any()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  explanation: z.string().optional(),
});

export const ToolCallResponseSchema = z.object({
  kind: z.literal('tool_call'),
  tool: z.string().min(1),
  args: z.record(z.any()).default({}),
  reasoning: z.string().optional(),
});

export const ScheduleUpdateResponseSchema = z.object({
  kind: z.literal('schedule_update'),
  action: z.string().min(1),
  params: z.record(z.any()),
  explanation: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

export const RunSolverResponseSchema = z.object({
  kind: z.literal('run_solver'),
  timeLimitSec: z.number().int().min(10).max(3600).optional(),
  explanation: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

export const DataMutationOpEnum = z.enum([
  'add_teacher',
  'update_teacher',
  'delete_teacher',
  'add_subject',
  'update_subject',
  'delete_subject',
  'add_class',
  'update_class',
  'delete_class',
  'add_class_year',
  'delete_class_year',
  'add_room',
  'update_room',
  'delete_room',
  'add_activity',
  'update_activity',
  'delete_activity',
  'add_day',
  'delete_day',
  'add_hour',
  'delete_hour',
  'link_teacher_subject',
  'unlink_teacher_subject',
  'set_constraint_weight',
  'set_constraint_active',
  'add_constraint',
  'delete_constraint',
  'add_activity_constraint',
  'set_setting',
  'add_split_activity',
  'set_timetable_slot',
  'lock_timetable_slot',
  'unlock_timetable_slot',
  'substitute_teacher',
  'merge_activities',
  'export_timetable',
  'swap_timetable_slots',
  'pair_subjects_consecutive',
  'clear_split',
  'cancel_generation',
  'navigate_to',
]);

export const DataMutationActionSchema = z.object({
  op: DataMutationOpEnum,
  params: z.record(z.any()),
  description: z.string().min(1),
});

export const DataMutationResponseSchema = z.object({
  kind: z.literal('data_mutation'),
  actions: z.array(DataMutationActionSchema).min(1),
  explanation: z.string(),
  requiresConfirmation: z.literal(true),
  confidence: z.number().min(0).max(1).optional(),
});

export const AIResponseSchema = z.union([
  QueryResponseSchema,
  ToolCallResponseSchema,
  ScheduleUpdateResponseSchema,
  DataMutationResponseSchema,
  RunSolverResponseSchema,
  ConstraintResponseSchema,
]);

export type AIResponseInput = z.input<typeof AIResponseSchema>;
export type AIResponseParsed = z.output<typeof AIResponseSchema>;

export function validateAIResponse(raw: unknown): AIResponse {
  const kind =
    raw && typeof raw === 'object' && 'kind' in (raw as object)
      ? (raw as { kind?: unknown }).kind
      : undefined;

  if (kind === undefined || kind === 'constraint') {
    const result = ConstraintResponseSchema.safeParse(raw);
    if (!result.success) {
      throwIssues(result.error.issues);
    }
    return result.data as AIResponse;
  }

  const result = AIResponseSchema.safeParse(raw);
  if (!result.success) {
    throwIssues(result.error.issues);
  }
  return result.data as AIResponse;
}

function throwIssues(
  issues: readonly { path: (string | number)[]; message: string }[],
): never {
  const msg = issues
    .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
    .join('; ');
  throw new Error(`AI yanıtı şemaya uymuyor: ${msg}`);
}
