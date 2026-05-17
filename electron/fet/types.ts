/**
 * FET entegrasyon katmanı tipleri.
 *
 * SchoolBundle: gatherSchoolData() fonksiyonunun döndürdüğü, DB'den toplanmış
 * tüm verinin tek bir yerde birleşik hâli. xml-builder bunu girdi olarak alır.
 *
 * FetResult: runner.ts'in döndürdüğü sonuç (başarılı veya hatalı).
 */

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
  /**
   * Günlere özel saat override'ları. Boş veya bir gün için kayıt yoksa
   * o gün global `hours` listesini kullanır.
   * Kısa günler (örn. Cuma 7 ders, diğerleri 8): XML'de Hours_List en uzun
   * günün saatleri olarak yazılır; kısa günler için fazla saatler
   * tüm sınıf/öğretmen için "not available" olarak işaretlenir.
   */
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

/**
 * xml-builder'ın constraint handler'larına geçirilen bağlam.
 *
 * Day/Hour isimlerini index'e (1-indexed FET koordinatlarına) çevirebilmek,
 * Activity Group Id eşleştirmesi yapabilmek ve referansları validate edebilmek için kullanılır.
 */
export type BuilderContext = {
  days: Day[];                // orderIndex sırasında
  hours: Hour[];              // orderIndex sırasında — *efektif* (en uzun gün baz)
  dayByName: Map<string, Day>;
  hourByOrder: Map<number, Hour>;
  /** day.id → o günde gerçek dolu saat sayısı (per-day override veya global). */
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
  /** activityId → Activity_Group_Id (DB activity id'sini kullanıyoruz) */
  activityGroupIdById: Map<number, number>;
  /** {subjectId, classId} → activity grup id (SUBJECT_NOT_ON_DAY gibi sınırlar için) */
  activityGroupBySubjectClass: Map<string, number>;
  /** Expand edilmiş FET Activity Id listeleri (her DB activity için ayrı liste) */
  fetActivityIdsByActivity: Map<number, number[]>;
  /**
   * Bir aktivitenin FET'te <Students> alanında kullanacağı isim.
   * Split olmayan aktiviteler için Group adı (= class.name).
   * Split aktiviteler için sınıfa eklenen split-subgroup adı
   * (örn. "9A_g1"), böylece aynı saatte çakışmasınlar.
   */
  studentsNameByActivity: Map<number, string>;
  skipped: SkippedConstraint[];
};

export type SkippedConstraint = {
  constraintId: number;
  type: string;
  reason: string;
};
