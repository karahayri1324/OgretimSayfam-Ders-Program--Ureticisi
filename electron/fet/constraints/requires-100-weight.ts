// FET, bu tag ailelerinde Weight_Percentage < 100 görürse ÜRETİMİN TAMAMINI abort eder
// ("Cannot optimize ... with weight percentage less than 100% ... Cannot precompute").
// Liste fet-cl 6.8.5 binary'sindeki abort mesajlarından çıkarıldı ve gerçek fet-cl ile
// ampirik doğrulandı (test/requires-100-weight-e2e.test.ts). Yazım anında 100'e clamp'lenir;
// aksi halde kullanıcının %95'e çektiği tek slider tüm üretimi sebepsiz çökertiyor.
// NOT: teacher/students max HOURS daily <100 yalnız uyarı üretir (abort etmez) — listede değil.
export const REQUIRES_100_WEIGHT_TAGS: ReadonlySet<string> = new Set([
  'ConstraintBreakTimes',
  'ConstraintTeacherNotAvailableTimes',
  'ConstraintStudentsSetNotAvailableTimes',
  'ConstraintTeacherMaxGapsPerDay',
  'ConstraintTeacherMaxGapsPerWeek',
  'ConstraintTeachersMaxGapsPerWeek',
  'ConstraintStudentsSetMaxGapsPerDay',
  'ConstraintStudentsSetMaxGapsPerWeek',
  'ConstraintStudentsMaxGapsPerWeek',
  'ConstraintStudentsSetEarlyMaxBeginningsAtSecondHour',
  'ConstraintStudentsEarlyMaxBeginningsAtSecondHour',
  'ConstraintTeacherMaxBuildingChangesPerDay',
  'ConstraintTeacherMaxBuildingChangesPerWeek',
  'ConstraintTeacherMinGapsBetweenBuildingChanges',
  'ConstraintStudentsSetMaxBuildingChangesPerDay',
  'ConstraintStudentsSetMinGapsBetweenBuildingChanges',
  'ConstraintActivityEndsStudentsDay',
  'ConstraintActivitiesOccupyMaxDifferentRooms',
]);

// dispatchConstraint çıktısındaki node'lara uygulanır; sentezlenen kısıtlar (örn.
// TEACHER_NOT_FIRST_HOUR → ConstraintTeacherNotAvailableTimes) tag üzerinden otomatik kapsanır.
export function clampRequired100Weight(node: {
  tag: string;
  body: Record<string, unknown>;
}): boolean {
  if (!REQUIRES_100_WEIGHT_TAGS.has(node.tag)) return false;
  const w = node.body['Weight_Percentage'];
  if (typeof w === 'number' && w < 100) {
    node.body['Weight_Percentage'] = 100;
    const prev = node.body['Comments'];
    const note = `Ağırlık ${w}→100 sabitlendi (FET bu kısıt tipini yalnız %100 ile çalıştırır)`;
    node.body['Comments'] =
      typeof prev === 'string' && prev.trim() !== '' ? `${prev} | ${note}` : note;
    return true;
  }
  return false;
}
