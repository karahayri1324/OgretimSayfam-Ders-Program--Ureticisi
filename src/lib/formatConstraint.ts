import type { Constraint, ConstraintType } from './types';

const dayLabels: Record<string, string> = {
  mon: 'Pazartesi',
  tue: 'Salı',
  wed: 'Çarşamba',
  thu: 'Perşembe',
  fri: 'Cuma',
  sat: 'Cumartesi',
  sun: 'Pazar',
};

function dayLabel(id: unknown): string {
  if (typeof id === 'string') return dayLabels[id] ?? id;
  return String(id ?? '');
}

function asList(v: unknown): unknown[] {
  return Array.isArray(v) ? v : v == null ? [] : [v];
}

function fmtSlots(slots: unknown): string {
  const arr = asList(slots);
  if (arr.length === 0) return 'belirtilmemiş saatler';
  return arr
    .map((s) => {
      if (!s || typeof s !== 'object') return String(s);
      const o = s as { day?: unknown; hour?: unknown };
      const d = o.day != null ? dayLabel(o.day) : '';
      const h = o.hour != null ? `${o.hour}. ders` : '';
      return [d, h].filter(Boolean).join(' ');
    })
    .join(', ');
}

const labelMap: Record<ConstraintType, string> = {
  TEACHER_NOT_AVAILABLE: 'Öğretmen müsait değil',
  TEACHER_MAX_DAYS_PER_WEEK: 'Öğretmenin haftalık maksimum gün sayısı',
  TEACHER_MAX_HOURS_DAILY: 'Öğretmenin günlük maksimum ders saati',
  TEACHER_MAX_GAPS_PER_DAY: 'Öğretmenin günlük maksimum boşluk',
  TEACHER_MAX_GAPS_PER_WEEK: 'Öğretmenin haftalık maksimum boşluk',
  TEACHERS_MAX_GAPS_PER_WEEK: 'Tüm öğretmenler için haftalık maksimum boşluk',
  CLASS_NOT_AVAILABLE: 'Sınıf müsait değil',
  CLASS_MAX_GAPS_PER_WEEK: 'Sınıfın haftalık maksimum boşluk',
  SUBJECT_NOT_ON_DAY: 'Branş belirli günde olmasın',
  SUBJECT_PREFERRED_HOURS: 'Branşın tercih edilen saatleri',
  SUBJECT_LAST_HOUR_OF_DAY: 'Branş günün son dersinde olsun',
  SUBJECT_MAX_HOURS_DAILY: 'Branşın günlük maksimum ders saati',
  SUBJECT_CONSECUTIVE_HOURS: 'Branş ardışık saatlerde olsun',
  ROOM_NOT_AVAILABLE: 'Derslik müsait değil',
  SUBJECT_PREFERRED_ROOM: 'Branşın tercih edilen dersliği',
  TEACHER_HOME_ROOM: 'Öğretmenin ana dersliği',
  CLASS_HOME_ROOM: 'Sınıfın ana dersliği',
  TEACHER_MIN_HOURS_DAILY: 'Öğretmenin günlük minimum ders saati',
  TEACHER_NOT_AVAILABLE_INTERVAL: 'Öğretmenin müsait olmadığı zaman aralığı',
  TEACHER_MIN_DAYS_PER_WEEK: 'Öğretmenin haftalık minimum gün sayısı',
  TEACHER_MAX_HOURS_CONTINUOUSLY: 'Öğretmenin aralıksız maksimum ders saati',
  TEACHER_MAX_BUILDING_CHANGES_PER_DAY: 'Öğretmenin günlük maksimum bina değişikliği',
  TEACHER_MAX_BUILDING_CHANGES_PER_WEEK: 'Öğretmenin haftalık maksimum bina değişikliği',
  TEACHER_MIN_GAPS_BETWEEN_BUILDING_CHANGES: 'Öğretmen bina değişikliği arası minimum boşluk',
  TEACHER_NOT_FIRST_HOUR: 'Öğretmen ilk saatte olmasın',
  TEACHER_NOT_LAST_HOUR: 'Öğretmen son saatte olmasın',
  TEACHER_MIN_REST_BETWEEN_DAYS: 'Öğretmen günler arası minimum dinlenme',
  CLASS_MAX_HOURS_DAILY: 'Sınıfın günlük maksimum ders saati',
  CLASS_MIN_HOURS_DAILY: 'Sınıfın günlük minimum ders saati',
  CLASS_MAX_GAPS_PER_DAY: 'Sınıfın günlük maksimum boşluk',
  CLASS_EARLY_MAX_BEGINNINGS: 'Sınıfın geç başlamasının azami sayısı',
  CLASS_MAX_BUILDING_CHANGES_PER_DAY: 'Sınıfın günlük maksimum bina değişikliği',
  CLASS_MIN_GAPS_BETWEEN_BUILDING_CHANGES: 'Sınıf bina değişikliği arası minimum boşluk',
  CLASS_NOT_FIRST_HOUR: 'Sınıf ilk saatte ders olmasın',
  CLASS_MAX_HOURS_CONTINUOUSLY: 'Sınıfın aralıksız maksimum ders saati',
  ACTIVITY_FIXED_TIME: 'Aktivite sabit zamanda',
  ACTIVITIES_SAME_STARTING_TIME: 'Aktiviteler aynı saatte başlasın',
  ACTIVITIES_NOT_OVERLAPPING: 'Aktiviteler çakışmasın',
  ACTIVITIES_SAME_STARTING_DAY: 'Aktiviteler aynı gün başlasın',
  ACTIVITY_ENDS_STUDENTS_DAY: 'Aktivite öğrenci gününün sonunda olsun',
  SUBJECT_NOT_FIRST_HOUR: 'Branş ilk saatte olmasın',
  MIN_DAYS_BETWEEN_ACTIVITIES_CUSTOM: 'Aktiviteler arası minimum gün (özel)',
  MIN_GAPS_BETWEEN_ACTIVITIES: 'Aktiviteler arası minimum boşluk',
  MAX_GAPS_BETWEEN_ACTIVITIES: 'Aktiviteler arası maksimum boşluk',
  ACTIVITY_PREFERRED_STARTING_TIMES: 'Aktivitenin tercih edilen başlangıç saatleri',
  SUBJECT_PREFERRED_ROOMS: 'Branşın tercih edilen derslikleri',
  TEACHER_PREFERRED_ROOM: 'Öğretmenin tercih edilen dersliği',
  TEACHER_PREFERRED_ROOMS: 'Öğretmenin tercih edilen derslikleri',
  ACTIVITY_PREFERRED_ROOM: 'Aktivitenin tercih edilen dersliği',
  ACTIVITY_PREFERRED_ROOMS: 'Aktivitenin tercih edilen derslikleri',
  SUBJECT_ACTIVITY_TAG_PREFERRED_ROOM: 'Branş + etiket tercih edilen derslik',
  ACTIVITIES_OCCUPY_MAX_DIFFERENT_ROOMS: 'Aktiviteler maksimum farklı derslik kullansın',
  STUDENTS_SET_HOME_ROOMS: 'Sınıfın ana derslikleri (çoklu)',
  BREAK_TIMES: 'Teneffüs / mola saatleri',
  ALL_TEACHERS_MAX_HOURS_DAILY: 'Tüm öğretmenler günlük maksimum ders saati',
  ALL_TEACHERS_MAX_DAYS_PER_WEEK: 'Tüm öğretmenler haftalık maksimum gün sayısı',
  STUDENTS_MAX_GAPS_PER_WEEK: 'Tüm sınıflar haftalık maksimum boşluk',
  STUDENTS_EARLY_MAX_BEGINNINGS: 'Tüm sınıflar geç başlama azami sayısı',
  STUDENTS_MAX_HOURS_DAILY: 'Tüm sınıflar günlük maksimum ders saati',
  MAX_TOTAL_ACTIVITIES_FROM_SET: 'Aktivite grubunun toplam maksimum saati',
};

export function constraintTypeLabel(type: ConstraintType): string {
  return labelMap[type] ?? type;
}

export function formatConstraint(c: Constraint): string {
  const p = c.params ?? {};
  const get = (k: string) => (p as Record<string, unknown>)[k];

  switch (c.type) {
    case 'TEACHER_NOT_AVAILABLE': {
      const name = get('teacherName') ?? `#${get('teacherId') ?? '?'}`;
      return `${name} adlı öğretmen ${fmtSlots(get('slots'))} müsait değil.`;
    }
    case 'TEACHER_MAX_DAYS_PER_WEEK':
      return `${get('teacherName') ?? 'Öğretmen'} haftada en fazla ${get('maxDays') ?? '?'} gün ders versin.`;
    case 'TEACHER_MAX_HOURS_DAILY':
      return `${get('teacherName') ?? 'Öğretmen'} günde en fazla ${get('maxHours') ?? '?'} saat ders versin.`;
    case 'TEACHER_MAX_GAPS_PER_DAY':
      return `${get('teacherName') ?? 'Öğretmen'} günde en fazla ${get('maxGaps') ?? '?'} boş saate sahip olsun.`;
    case 'TEACHER_MAX_GAPS_PER_WEEK':
      return `${get('teacherName') ?? 'Öğretmen'} haftada en fazla ${get('maxGaps') ?? '?'} boş saate sahip olsun.`;
    case 'TEACHERS_MAX_GAPS_PER_WEEK':
      return `Tüm öğretmenler haftada en fazla ${get('maxGaps') ?? '?'} boş saate sahip olsun.`;
    case 'CLASS_NOT_AVAILABLE': {
      const name = get('className') ?? `Sınıf #${get('classId') ?? '?'}`;
      return `${name} sınıfı ${fmtSlots(get('slots'))} müsait değil.`;
    }
    case 'CLASS_MAX_GAPS_PER_WEEK':
      return `${get('className') ?? 'Sınıf'} haftada en fazla ${get('maxGaps') ?? '?'} boş saate sahip olsun.`;
    case 'SUBJECT_NOT_ON_DAY':
      return `${get('subjectName') ?? 'Branş'} ${dayLabel(get('day'))} günü işlenmesin.`;
    case 'SUBJECT_PREFERRED_HOURS':
      return `${get('subjectName') ?? 'Branş'} tercihen ${fmtSlots(get('slots'))} işlensin.`;
    case 'SUBJECT_LAST_HOUR_OF_DAY':
      return `${get('subjectName') ?? 'Branş'} günün son saatinde işlensin.`;
    case 'SUBJECT_MAX_HOURS_DAILY':
      return `${get('subjectName') ?? 'Branş'} günde en fazla ${get('maxHours') ?? '?'} saat işlensin.`;
    case 'SUBJECT_CONSECUTIVE_HOURS':
      return `${get('subjectName') ?? 'Branş'} ardışık saatlerde işlensin.`;
    case 'ROOM_NOT_AVAILABLE':
      return `${get('roomName') ?? 'Derslik'} ${fmtSlots(get('slots'))} müsait değil.`;
    case 'SUBJECT_PREFERRED_ROOM':
      return `${get('subjectName') ?? 'Branş'} dersleri ${get('roomName') ?? 'tercih edilen derslikte'} işlensin.`;
    case 'TEACHER_HOME_ROOM':
      return `${get('teacherName') ?? 'Öğretmen'} ana dersliği: ${get('roomName') ?? '?'}.`;
    case 'CLASS_HOME_ROOM':
      return `${get('className') ?? 'Sınıf'} ana dersliği: ${get('roomName') ?? '?'}.`;
    case 'TEACHER_MIN_HOURS_DAILY':
      return `${get('teacherName') ?? 'Öğretmen'} günde en az ${get('minHours') ?? '?'} saat ders versin.`;
    case 'TEACHER_NOT_AVAILABLE_INTERVAL':
      return `${get('teacherName') ?? 'Öğretmen'} ${dayLabel(get('day'))} günü ${get('startHour') ?? '?'}. ile ${get('endHour') ?? '?'}. saatler arası müsait değil.`;
    case 'TEACHER_MIN_DAYS_PER_WEEK':
      return `${get('teacherName') ?? 'Öğretmen'} haftada en az ${get('minDays') ?? '?'} gün okula gelsin.`;
    case 'TEACHER_MAX_HOURS_CONTINUOUSLY':
      return `${get('teacherName') ?? 'Öğretmen'} aralıksız en fazla ${get('maxHours') ?? '?'} saat ders versin.`;
    case 'TEACHER_MAX_BUILDING_CHANGES_PER_DAY':
      return `${get('teacherName') ?? 'Öğretmen'} günde en fazla ${get('maxChanges') ?? '?'} kez bina değiştirsin.`;
    case 'TEACHER_MAX_BUILDING_CHANGES_PER_WEEK':
      return `${get('teacherName') ?? 'Öğretmen'} haftada en fazla ${get('maxChanges') ?? '?'} kez bina değiştirsin.`;
    case 'TEACHER_MIN_GAPS_BETWEEN_BUILDING_CHANGES':
      return `${get('teacherName') ?? 'Öğretmen'} bina değişiklikleri arası en az ${get('minGaps') ?? '?'} boş ders olsun.`;
    case 'TEACHER_NOT_FIRST_HOUR':
      return `${get('teacherName') ?? 'Öğretmen'} günün ilk saatinde ders vermesin.`;
    case 'TEACHER_NOT_LAST_HOUR':
      return `${get('teacherName') ?? 'Öğretmen'} günün son saatinde ders vermesin.`;
    case 'TEACHER_MIN_REST_BETWEEN_DAYS':
      return `${get('teacherName') ?? 'Öğretmen'} günler arası en az ${get('minRestHours') ?? '?'} saat dinlensin.`;
    case 'CLASS_MAX_HOURS_DAILY':
      return `${get('className') ?? 'Sınıf'} günde en fazla ${get('maxHours') ?? '?'} ders alsın.`;
    case 'CLASS_MIN_HOURS_DAILY':
      return `${get('className') ?? 'Sınıf'} günde en az ${get('minHours') ?? '?'} ders alsın.`;
    case 'CLASS_MAX_GAPS_PER_DAY':
      return `${get('className') ?? 'Sınıf'} günde en fazla ${get('maxGaps') ?? '?'} boş saate sahip olsun.`;
    case 'CLASS_EARLY_MAX_BEGINNINGS':
      return `${get('className') ?? 'Sınıf'} haftada en fazla ${get('maxBeginnings') ?? '?'} kez 2. saatte başlasın.`;
    case 'CLASS_MAX_BUILDING_CHANGES_PER_DAY':
      return `${get('className') ?? 'Sınıf'} günde en fazla ${get('maxChanges') ?? '?'} kez bina değiştirsin.`;
    case 'CLASS_MIN_GAPS_BETWEEN_BUILDING_CHANGES':
      return `${get('className') ?? 'Sınıf'} bina değişiklikleri arası en az ${get('minGaps') ?? '?'} boş ders olsun.`;
    case 'CLASS_NOT_FIRST_HOUR':
      return `${get('className') ?? 'Sınıf'} ilk saatte ders almasın.`;
    case 'CLASS_MAX_HOURS_CONTINUOUSLY':
      return `${get('className') ?? 'Sınıf'} aralıksız en fazla ${get('maxHours') ?? '?'} saat ders alsın.`;
    case 'ACTIVITY_FIXED_TIME':
      return `Aktivite (#${get('activityId') ?? '?'}) ${dayLabel(get('day'))} ${get('hour') ?? '?'}. saatte sabitlensin.`;
    case 'ACTIVITIES_SAME_STARTING_TIME': {
      const ids = asList(get('activityIds'));
      return `${ids.length || '?'} aktivite aynı saatte başlasın.`;
    }
    case 'ACTIVITIES_NOT_OVERLAPPING': {
      const ids = asList(get('activityIds'));
      return `${ids.length || '?'} aktivite çakışmasın.`;
    }
    case 'ACTIVITIES_SAME_STARTING_DAY': {
      const ids = asList(get('activityIds'));
      return `${ids.length || '?'} aktivite aynı gün başlasın.`;
    }
    case 'ACTIVITY_ENDS_STUDENTS_DAY':
      return `Aktivite (#${get('activityId') ?? '?'}) öğrenci gününün sonunda olsun.`;
    case 'SUBJECT_NOT_FIRST_HOUR':
      return `${get('subjectName') ?? 'Branş'} dersi günün ilk saatinde işlenmesin.`;
    case 'MIN_DAYS_BETWEEN_ACTIVITIES_CUSTOM':
      return `Aktiviteler arasında en az ${get('minDays') ?? '?'} gün olsun.`;
    case 'MIN_GAPS_BETWEEN_ACTIVITIES':
      return `Aktiviteler arası en az ${get('minGaps') ?? '?'} boş ders olsun.`;
    case 'MAX_GAPS_BETWEEN_ACTIVITIES':
      return `Aktiviteler arası en fazla ${get('maxGaps') ?? '?'} boş ders olsun.`;
    case 'ACTIVITY_PREFERRED_STARTING_TIMES':
      return `Aktivite (#${get('activityId') ?? '?'}) tercihen ${fmtSlots(get('slots'))} başlasın.`;
    case 'SUBJECT_PREFERRED_ROOMS': {
      const rooms = asList(get('rooms'));
      return `${get('subjectName') ?? 'Branş'} dersleri tercihen şu dersliklerde: ${rooms.join(', ') || '?'}.`;
    }
    case 'TEACHER_PREFERRED_ROOM':
      return `${get('teacherName') ?? 'Öğretmen'} tercih edilen derslik: ${get('roomName') ?? '?'}.`;
    case 'TEACHER_PREFERRED_ROOMS': {
      const rooms = asList(get('rooms'));
      return `${get('teacherName') ?? 'Öğretmen'} tercih edilen derslikler: ${rooms.join(', ') || '?'}.`;
    }
    case 'ACTIVITY_PREFERRED_ROOM':
      return `Aktivite (#${get('activityId') ?? '?'}) tercih edilen derslik: ${get('roomName') ?? '?'}.`;
    case 'ACTIVITY_PREFERRED_ROOMS': {
      const rooms = asList(get('rooms'));
      return `Aktivite (#${get('activityId') ?? '?'}) tercih edilen derslikler: ${rooms.join(', ') || '?'}.`;
    }
    case 'SUBJECT_ACTIVITY_TAG_PREFERRED_ROOM':
      return `${get('subjectName') ?? 'Branş'} (${get('activityTag') ?? 'etiket'}) tercih edilen derslik: ${get('roomName') ?? '?'}.`;
    case 'ACTIVITIES_OCCUPY_MAX_DIFFERENT_ROOMS':
      return `Aktiviteler en fazla ${get('maxDifferentRooms') ?? '?'} farklı derslik kullansın.`;
    case 'STUDENTS_SET_HOME_ROOMS': {
      const rooms = asList(get('rooms'));
      return `${get('className') ?? 'Sınıf'} ana derslikleri: ${rooms.join(', ') || '?'}.`;
    }
    case 'BREAK_TIMES':
      return `Teneffüs/mola: ${fmtSlots(get('slots'))}.`;
    case 'ALL_TEACHERS_MAX_HOURS_DAILY':
      return `Tüm öğretmenler günde en fazla ${get('maxHours') ?? '?'} saat ders versin.`;
    case 'ALL_TEACHERS_MAX_DAYS_PER_WEEK':
      return `Tüm öğretmenler haftada en fazla ${get('maxDays') ?? '?'} gün okula gelsin.`;
    case 'STUDENTS_MAX_GAPS_PER_WEEK':
      return `Tüm sınıflar haftada en fazla ${get('maxGaps') ?? '?'} boş saate sahip olsun.`;
    case 'STUDENTS_EARLY_MAX_BEGINNINGS':
      return `Tüm sınıflar haftada en fazla ${get('maxBeginnings') ?? '?'} kez 2. saatte başlasın.`;
    case 'STUDENTS_MAX_HOURS_DAILY':
      return `Tüm sınıflar günde en fazla ${get('maxHours') ?? '?'} ders alsın.`;
    case 'MAX_TOTAL_ACTIVITIES_FROM_SET':
      return `Aktivite grubu toplamı günde en fazla ${get('maxHours') ?? '?'} saat olsun.`;
    default:
      return `${labelMap[c.type] ?? c.type}: ${JSON.stringify(p)}`;
  }
}
