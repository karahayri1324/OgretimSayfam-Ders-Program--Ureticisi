import type { Api } from '../../electron/preload';

declare global {
  interface Window {
    api: Api;
  }
}

export type Ok<T> = { ok: true; data: T };
export type Err = {
  ok: false;
  error: { code: string; message: string; details?: unknown };
};
export type Result<T> = Ok<T> | Err;

export type Teacher = {
  id: number;
  name: string;
  weeklyTargetHours: number;
  notes: string | null;
  subjectIds: number[];
};

export type TeacherInput = {
  name: string;
  weeklyTargetHours: number;
  notes?: string | null;
  subjectIds?: number[];
};

export type Subject = {
  id: number;
  name: string;
  shortCode: string | null;
  color: string | null;
  notes: string | null;
};

export type SubjectInput = {
  name: string;
  shortCode?: string | null;
  color?: string | null;
  notes?: string | null;
};

export type ClassYear = { id: number; name: string; orderIndex: number };

export type ClassRoom = {
  id: number;
  yearId: number | null;
  name: string;
  studentCount: number;
  homeRoomId: number | null;
};

export type ClassInput = {
  yearId?: number | null;
  name: string;
  studentCount?: number;
  homeRoomId?: number | null;
};

export type Room = {
  id: number;
  name: string;
  capacity: number;
  building: string | null;
  notes: string | null;
};

export type RoomInput = {
  name: string;
  capacity?: number;
  building?: string | null;
  notes?: string | null;
};

export type Activity = {
  id: number;
  classId: number;
  subjectId: number;
  teacherId: number | null;
  weeklyHours: number;
  blockDuration: number;
  notes: string | null;
  splitGroupId: number | null;
};

export type ActivityInput = {
  classId: number;
  subjectId: number;
  teacherId?: number | null;
  weeklyHours: number;
  blockDuration?: number;
  notes?: string | null;
};

export type Day = { id: number; name: string; orderIndex: number };
export type Hour = {
  id: number;
  name: string;
  orderIndex: number;
  startTime: string | null;
  endTime: string | null;
};

export type DayHour = {
  id: number;
  dayId: number;
  orderIndex: number;
  name: string | null;
  startTime: string | null;
  endTime: string | null;
};

export type DayHourInput = {
  orderIndex: number;
  name?: string | null;
  startTime?: string | null;
  endTime?: string | null;
};

export type ConstraintType =
  | 'TEACHER_NOT_AVAILABLE'
  | 'TEACHER_MAX_DAYS_PER_WEEK'
  | 'TEACHER_MAX_HOURS_DAILY'
  | 'TEACHER_MAX_GAPS_PER_DAY'
  | 'TEACHER_MAX_GAPS_PER_WEEK'
  | 'TEACHERS_MAX_GAPS_PER_WEEK'
  | 'CLASS_NOT_AVAILABLE'
  | 'CLASS_MAX_GAPS_PER_WEEK'
  | 'SUBJECT_NOT_ON_DAY'
  | 'SUBJECT_PREFERRED_HOURS'
  | 'SUBJECT_LAST_HOUR_OF_DAY'
  | 'SUBJECT_MAX_HOURS_DAILY'
  | 'SUBJECT_CONSECUTIVE_HOURS'
  | 'ROOM_NOT_AVAILABLE'
  | 'SUBJECT_PREFERRED_ROOM'
  | 'TEACHER_HOME_ROOM'
  | 'CLASS_HOME_ROOM'
  | 'TEACHER_MIN_HOURS_DAILY'
  | 'TEACHER_NOT_AVAILABLE_INTERVAL'
  | 'TEACHER_MIN_DAYS_PER_WEEK'
  | 'TEACHER_MAX_HOURS_CONTINUOUSLY'
  | 'TEACHER_MAX_BUILDING_CHANGES_PER_DAY'
  | 'TEACHER_MAX_BUILDING_CHANGES_PER_WEEK'
  | 'TEACHER_MIN_GAPS_BETWEEN_BUILDING_CHANGES'
  | 'TEACHER_NOT_FIRST_HOUR'
  | 'TEACHER_NOT_LAST_HOUR'
  | 'TEACHER_MIN_REST_BETWEEN_DAYS'
  | 'CLASS_MAX_HOURS_DAILY'
  | 'CLASS_MIN_HOURS_DAILY'
  | 'CLASS_MAX_GAPS_PER_DAY'
  | 'CLASS_EARLY_MAX_BEGINNINGS'
  | 'CLASS_MAX_BUILDING_CHANGES_PER_DAY'
  | 'CLASS_MIN_GAPS_BETWEEN_BUILDING_CHANGES'
  | 'CLASS_NOT_FIRST_HOUR'
  | 'CLASS_MAX_HOURS_CONTINUOUSLY'
  | 'ACTIVITY_FIXED_TIME'
  | 'ACTIVITIES_SAME_STARTING_TIME'
  | 'ACTIVITIES_NOT_OVERLAPPING'
  | 'ACTIVITIES_SAME_STARTING_DAY'
  | 'ACTIVITY_ENDS_STUDENTS_DAY'
  | 'SUBJECT_NOT_FIRST_HOUR'
  | 'MIN_DAYS_BETWEEN_ACTIVITIES_CUSTOM'
  | 'MIN_GAPS_BETWEEN_ACTIVITIES'
  | 'MAX_GAPS_BETWEEN_ACTIVITIES'
  | 'ACTIVITY_PREFERRED_STARTING_TIMES'
  | 'SUBJECT_PREFERRED_ROOMS'
  | 'TEACHER_PREFERRED_ROOM'
  | 'TEACHER_PREFERRED_ROOMS'
  | 'ACTIVITY_PREFERRED_ROOM'
  | 'ACTIVITY_PREFERRED_ROOMS'
  | 'SUBJECT_ACTIVITY_TAG_PREFERRED_ROOM'
  | 'ACTIVITIES_OCCUPY_MAX_DIFFERENT_ROOMS'
  | 'STUDENTS_SET_HOME_ROOMS'
  | 'BREAK_TIMES'
  | 'ALL_TEACHERS_MAX_HOURS_DAILY'
  | 'ALL_TEACHERS_MAX_DAYS_PER_WEEK'
  | 'STUDENTS_MAX_GAPS_PER_WEEK'
  | 'STUDENTS_EARLY_MAX_BEGINNINGS'
  | 'STUDENTS_MAX_HOURS_DAILY'
  | 'MAX_TOTAL_ACTIVITIES_FROM_SET'
  | 'TWO_ACTIVITIES_CONSECUTIVE';

export type Slot = { day: string | null; hour: number | null };

export type Constraint = {
  id: number;
  type: ConstraintType;
  weight: number;
  active: boolean;
  params: Record<string, unknown>;
  source: 'ai' | 'manual';
  aiMessageId: number | null;
  createdAt: string;
  notes: string | null;
};

export type ConstraintInput = {
  type: ConstraintType;
  weight: number;
  active?: boolean;
  params: Record<string, unknown>;
  source: 'ai' | 'manual';
  aiMessageId?: number | null;
  notes?: string | null;
};

export type AIMessage = {
  id: number;
  role: 'user' | 'assistant' | 'system';
  text: string;
  parentId: number | null;
  createdAt: string;
};

export type AIConstraint = {
  type: ConstraintType;
  weight: number;
  active: boolean;
  params: Record<string, unknown>;
};

export type AIConstraintResponse = {
  kind?: 'constraint';
  constraints: AIConstraint[];
  confidence: number;
  explanation: string;
  warnings: string[];
  unresolved: string[];
};

export type AIQueryResponse = {
  kind: 'query';
  answer: string;
  data?: unknown[];
  confidence?: number;
  explanation?: string;
};

export type AIToolCallResponse = {
  kind: 'tool_call';
  tool: string;
  args: Record<string, unknown>;
  reasoning?: string;
};

export type AIScheduleUpdateResponse = {
  kind: 'schedule_update';
  action: string;
  params: Record<string, unknown>;
  explanation: string;
  confidence?: number;
};

export type AIRunSolverResponse = {
  kind: 'run_solver';
  timeLimitSec?: number;
  explanation: string;
  confidence?: number;
};

export type DataMutationOp =
  | 'add_teacher'
  | 'update_teacher'
  | 'delete_teacher'
  | 'add_subject'
  | 'update_subject'
  | 'delete_subject'
  | 'add_class'
  | 'update_class'
  | 'delete_class'
  | 'add_class_year'
  | 'delete_class_year'
  | 'add_room'
  | 'update_room'
  | 'delete_room'
  | 'add_activity'
  | 'update_activity'
  | 'delete_activity'
  | 'add_day'
  | 'delete_day'
  | 'add_hour'
  | 'delete_hour'
  | 'link_teacher_subject'
  | 'unlink_teacher_subject'
  | 'set_constraint_weight'
  | 'set_constraint_active'
  | 'add_constraint'
  | 'delete_constraint'
  | 'add_activity_constraint'
  | 'set_setting'
  | 'add_split_activity'
  | 'set_timetable_slot'
  | 'lock_timetable_slot'
  | 'unlock_timetable_slot'
  | 'substitute_teacher'
  | 'merge_activities'
  | 'export_timetable'
  | 'swap_timetable_slots'
  | 'pair_subjects_consecutive'
  | 'navigate_to';

export type DataMutationAction = {
  op: DataMutationOp;
  params: Record<string, unknown>;
  description: string;
};

export type AIDataMutationResponse = {
  kind: 'data_mutation';
  actions: DataMutationAction[];
  explanation: string;
  requiresConfirmation: true;
  confidence?: number;
};

export type DataMutationApplyResult = {
  applied: number;
  errors: Array<{ index: number; op: DataMutationOp; message: string }>;
  results: Array<{ index: number; op: DataMutationOp; ok: boolean; message?: string }>;
  /** true ise: en az bir action başarısız olduğu için TÜM işlemler geri alındı (atomik). */
  rolledBack?: boolean;
};

export type AIResponse =
  | AIConstraintResponse
  | AIQueryResponse
  | AIToolCallResponse
  | AIScheduleUpdateResponse
  | AIDataMutationResponse
  | AIRunSolverResponse;

export type TimetableSlot = {
  activityId: number;
  dayIndex: number;
  hourIndex: number;
  classId: number | null;
  className: string;
  teacherId: number | null;
  teacherName: string;
  subjectId: number | null;
  subjectName: string;
  roomId: number | null;
  roomName: string | null;
};

export type TimetableResult = {
  id: number;
  generatedAt: string;
  status: 'success' | 'partial' | 'failed';
  durationMs: number;
  slots: TimetableSlot[];
  conflicts: string[];
};

export type GenerateProgress =
  | { kind: 'progress'; value: number; message?: string }
  | { kind: 'log'; line: string }
  | { kind: 'done'; result: TimetableResult }
  | { kind: 'error'; message: string };
