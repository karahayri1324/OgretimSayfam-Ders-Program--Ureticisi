import type { getDb } from './connection.js';

type DB = ReturnType<typeof getDb>;

// Bir entity silinmeden ÖNCE, cascade ile gidecek aktivitelerin üyesi olduğu split-grupları
// topla; silme SONRASI cleanupOrphanGroups ile 1 üyeli kalan grupları normale düşür.
// Aksi halde yetim grup FET XML'inde var olmayan _gN öğrenci-kümesine atıf üretir ve
// fet-cl dosyayı reddeder (üretim, split manuel temizlenene kadar kalıcı çöker).

export function splitGroupIdsForClass(
  db: DB,
  schoolId: number,
  classId: number,
): number[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT split_group_id AS g FROM activities
       WHERE school_id = ? AND class_id = ? AND split_group_id IS NOT NULL`,
    )
    .all(schoolId, classId) as { g: number }[];
  return rows.map((r) => r.g);
}

export function splitGroupIdsForSubject(
  db: DB,
  schoolId: number,
  subjectId: number,
): number[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT split_group_id AS g FROM activities
       WHERE school_id = ? AND subject_id = ? AND split_group_id IS NOT NULL`,
    )
    .all(schoolId, subjectId) as { g: number }[];
  return rows.map((r) => r.g);
}

export function cleanupOrphanGroup(
  db: DB,
  schoolId: number,
  groupId: number,
): void {
  const cnt = (
    db
      .prepare(
        'SELECT COUNT(*) AS c FROM activities WHERE school_id = ? AND split_group_id = ?',
      )
      .get(schoolId, groupId) as { c: number }
  ).c;
  if (cnt < 2) {
    db.prepare(
      'UPDATE activities SET split_group_id = NULL WHERE school_id = ? AND split_group_id = ?',
    ).run(schoolId, groupId);
  }
}

export function cleanupOrphanGroups(
  db: DB,
  schoolId: number,
  groupIds: number[],
): void {
  for (const g of groupIds) cleanupOrphanGroup(db, schoolId, g);
}
