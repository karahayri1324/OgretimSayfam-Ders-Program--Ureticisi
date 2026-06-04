
import type {
  Activity,
  ClassRoom,
  ClassYear,
  Constraint,
  Day,
  DayHour,
  Hour,
  Room,
  Subject,
  Teacher,
  TimetableSlot,
} from '../../src/lib/types.js';

export type SchoolBundle = {
  institutionName: string;
  days: Day[];
  hours: Hour[];
  dayHours?: DayHour[];
  subjects: Subject[];
  teachers: Teacher[];
  classes: ClassRoom[];
  years: ClassYear[];
  rooms: Room[];
  activities: Activity[];
  constraints: Constraint[];
};

export type FetRunOptions = {
  timeLimit?: number;
  signal?: AbortSignal;
  onProgress?: (event: FetProgressEvent) => void;
  language?: string;
};

export type FetProgressEvent =
  | { kind: 'start'; message: string }
  | { kind: 'log'; line: string }
  | { kind: 'progress'; value: number; message?: string }
  | { kind: 'done'; message: string }
  | { kind: 'error'; message: string };

export type FetResultOk = {
  ok: true;
  outputDir: string;
  timetable: TimetableSlot[];
  durationMs: number;
};

export type FetResultErr = {
  ok: false;
  errorCode:
    | 'NO_SOLUTION'
    | 'PARTIAL'
    | 'BINARY_NOT_FOUND'
    | 'TIMEOUT'
    | 'CANCELLED'
    | 'XML_ERROR'
    | 'PARSE_ERROR'
    | 'UNKNOWN';
  message: string;
  outputDir?: string;
  rawError?: string;
  durationMs: number;
};

export type FetResult = FetResultOk | FetResultErr;

export type BuilderContext = {
  days: Day[];
  hours: Hour[];
  dayByName: Map<string, Day>;
  hourByOrder: Map<number, Hour>;
  effectiveHoursPerDay: Map<number, number>;
  teachers: Teacher[];
  teacherByName: Map<string, Teacher>;
  classes: ClassRoom[];
  classByName: Map<string, ClassRoom>;
  subjects: Subject[];
  subjectByName: Map<string, Subject>;
  rooms: Room[];
  roomByName: Map<string, Room>;
  activities: Activity[];
  activityGroupIdById: Map<number, number>;
  activityGroupBySubjectClass: Map<string, number>;
  fetActivityIdsByActivity: Map<number, number[]>;
  durationByFetId: Map<number, number>;
  studentsNameByActivity: Map<number, string>;
  skipped: SkippedConstraint[];
};

export type SkippedConstraint = {
  constraintId: number;
  type: string;
  reason: string;
};
