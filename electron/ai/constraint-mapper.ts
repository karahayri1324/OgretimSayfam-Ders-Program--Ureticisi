import type {
  AIConstraint,
  ConstraintInput,
  ConstraintType,
  Teacher,
  Subject,
  ClassRoom,
  Room,
} from '../../src/lib/types.js';

/**
 * AppContext — buildAIContext'in döndürdüğü string listesinden farklı;
 * bu burada id'leriyle birlikte DB tarafından sağlanır. Mapper bunu kullanarak
 * AI'nın verdiği "isim" referanslarını "DB'de gerçekten var mı?" diye sağlar.
 */
export type AppContext = {
  teachers: Pick<Teacher, 'id' | 'name'>[];
  classes: Pick<ClassRoom, 'id' | 'name'>[];
  subjects: Pick<Subject, 'id' | 'name'>[];
  rooms: Pick<Room, 'id' | 'name'>[];
};

export type SkippedConstraint = {
  reason: string;
  original: AIConstraint;
};

export type MapResult = {
  valid: ConstraintInput[];
  skipped: SkippedConstraint[];
};

/** Case-insensitive isim eşitliği. */
function nameExists(name: string, list: { name: string }[]): boolean {
  const target = name.trim().toLocaleLowerCase('tr');
  return list.some((x) => x.name.trim().toLocaleLowerCase('tr') === target);
}

/** params içindeki string referansların DB'de gerçekten var olduğunu doğrular. */
function validateRefs(
  type: ConstraintType,
  params: Record<string, unknown>,
  ctx: AppContext,
): string | null {
  const teacher = params['teacher'];
  if (typeof teacher === 'string' && !nameExists(teacher, ctx.teachers)) {
    return `Öğretmen bulunamadı: '${teacher}'`;
  }
  const klass = params['class'];
  if (typeof klass === 'string' && !nameExists(klass, ctx.classes)) {
    return `Sınıf bulunamadı: '${klass}'`;
  }
  const subject = params['subject'];
  if (typeof subject === 'string' && !nameExists(subject, ctx.subjects)) {
    return `Ders bulunamadı: '${subject}'`;
  }
  const room = params['room'];
  if (typeof room === 'string' && !nameExists(room, ctx.rooms)) {
    return `Derslik bulunamadı: '${room}'`;
  }

  // Bazı tipler için zorunlu referans yokluğu da skip nedeni
  switch (type) {
    case 'TEACHER_NOT_AVAILABLE':
    case 'TEACHER_MAX_DAYS_PER_WEEK':
    case 'TEACHER_MAX_HOURS_DAILY':
    case 'TEACHER_MAX_GAPS_PER_DAY':
    case 'TEACHER_MAX_GAPS_PER_WEEK':
    case 'TEACHER_HOME_ROOM':
      if (typeof teacher !== 'string' || teacher.length === 0) {
        return 'Öğretmen referansı eksik';
      }
      break;
    case 'CLASS_NOT_AVAILABLE':
    case 'CLASS_MAX_GAPS_PER_WEEK':
    case 'CLASS_HOME_ROOM':
      if (typeof klass !== 'string' || klass.length === 0) {
        return 'Sınıf referansı eksik';
      }
      break;
    case 'SUBJECT_NOT_ON_DAY':
    case 'SUBJECT_PREFERRED_HOURS':
    case 'SUBJECT_LAST_HOUR_OF_DAY':
    case 'SUBJECT_MAX_HOURS_DAILY':
    case 'SUBJECT_CONSECUTIVE_HOURS':
    case 'SUBJECT_PREFERRED_ROOM':
      if (typeof subject !== 'string' || subject.length === 0) {
        return 'Ders referansı eksik';
      }
      break;
    case 'ROOM_NOT_AVAILABLE':
      if (typeof room !== 'string' || room.length === 0) {
        return 'Derslik referansı eksik';
      }
      break;
    case 'TEACHERS_MAX_GAPS_PER_WEEK':
      // referans gerektirmez
      break;
  }

  return null;
}

/**
 * AI tarafından üretilen constraint listesini DB'ye yazılabilir ConstraintInput'a çevirir.
 * Eksik/geçersiz referans varsa skipped'a atılır; UI bunu kullanıcıya gösterir.
 *
 * Not: Bu FET-aware değildir. FET'e gönderme aşaması ayrı bir mapper'da
 * (constraint-mapper'ın FET XML versiyonu) yapılacak.
 */
export function mapAIConstraintsToInternal(
  aiConstraints: AIConstraint[],
  ctx: AppContext,
): MapResult {
  const valid: ConstraintInput[] = [];
  const skipped: SkippedConstraint[] = [];

  for (const c of aiConstraints) {
    const reason = validateRefs(c.type, c.params, ctx);
    if (reason) {
      skipped.push({ reason, original: c });
      continue;
    }
    valid.push({
      type: c.type,
      weight: c.weight,
      active: c.active,
      params: c.params,
      source: 'ai',
    });
  }

  return { valid, skipped };
}
