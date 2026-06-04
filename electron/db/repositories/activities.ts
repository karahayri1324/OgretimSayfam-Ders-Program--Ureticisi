import { getDb } from '../connection.js';
import { schoolsRepo } from './schools.js';
import type { Activity, ActivityInput } from '../../../src/lib/types.js';

type ActivityRow = {
  id: number;
  class_id: number;
  subject_id: number;
  teacher_id: number | null;
  weekly_hours: number;
  block_duration: number;
  notes: string | null;
  split_group_id: number | null;
};

function rowToActivity(r: ActivityRow): Activity {
  return {
    id: r.id,
    classId: r.class_id,
    subjectId: r.subject_id,
    teacherId: r.teacher_id,
    weeklyHours: r.weekly_hours,
    blockDuration: r.block_duration,
    notes: r.notes,
    splitGroupId: r.split_group_id,
  };
}

const SELECT_COLS =
  'id, class_id, subject_id, teacher_id, weekly_hours, block_duration, notes, split_group_id';

export const activitiesRepo = {
  list(): Activity[] {
    const rows = getDb()
      .prepare(
        `SELECT ${SELECT_COLS}
         FROM activities WHERE school_id = ?
         ORDER BY id ASC`,
      )
      .all(schoolsRepo.getActiveId()) as ActivityRow[];
    return rows.map(rowToActivity);
  },

  get(id: number): Activity | null {
    const row = getDb()
      .prepare(
        `SELECT ${SELECT_COLS}
         FROM activities WHERE id = ? AND school_id = ?`,
      )
      .get(id, schoolsRepo.getActiveId()) as ActivityRow | undefined;
    return row ? rowToActivity(row) : null;
  },

  upsert(input: ActivityInput & { id?: number }): number {
    const db = getDb();
    const schoolId = schoolsRepo.getActiveId();

    if (input.id !== undefined && input.id !== null) {
      // Hedef (sınıf+ders+öğretmen) dörtlüsü BAŞKA bir satırda zaten varsa, düz UPDATE
      // UNIQUE kısıtını çökertir (cryptic SQLITE_CONSTRAINT + tüm batch rollback). Önce
      // kontrol edip anlaşılır bir hata ver (örn. öğretmen birleştirme/ikame çakışması).
      const clash = db
        .prepare(
          `SELECT id FROM activities
           WHERE school_id = ? AND class_id = ? AND subject_id = ?
             AND teacher_id IS ? AND id != ?`,
        )
        .get(
          schoolId,
          input.classId,
          input.subjectId,
          input.teacherId ?? null,
          input.id,
        ) as { id: number } | undefined;
      if (clash) {
        throw new Error(
          'Bu sınıf + ders + öğretmen kombinasyonu zaten başka bir aktivitede mevcut; ' +
            'aynı dersi aynı öğretmene ikinci kez atayamazsınız.',
        );
      }
      db.prepare(
        `UPDATE activities SET
           class_id = ?, subject_id = ?, teacher_id = ?,
           weekly_hours = ?, block_duration = ?, notes = ?
         WHERE id = ? AND school_id = ?`,
      ).run(
        input.classId,
        input.subjectId,
        input.teacherId ?? null,
        input.weeklyHours,
        input.blockDuration ?? 1,
        input.notes ?? null,
        input.id,
        schoolId,
      );
      return input.id;
    }

    const result = db
      .prepare(
        `INSERT INTO activities
           (school_id, class_id, subject_id, teacher_id, weekly_hours, block_duration, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(school_id, class_id, subject_id, teacher_id)
         DO UPDATE SET
           weekly_hours = excluded.weekly_hours,
           block_duration = excluded.block_duration,
           notes = excluded.notes`,
      )
      .run(
        schoolId,
        input.classId,
        input.subjectId,
        input.teacherId ?? null,
        input.weeklyHours,
        input.blockDuration ?? 1,
        input.notes ?? null,
      );

    // teacher_id NULL ise UNIQUE indeksinde NULL'lar ayrık sayıldığından ON CONFLICT
    // hiç tetiklenmez → her zaman taze INSERT → lastInsertRowid doğru.
    // teacher_id NON-NULL ise çakışmada DO UPDATE çalışabilir; SQLite DO UPDATE'te
    // last_insert_rowid()'i GÜNCELLEMEZ (önceki bir INSERT'in rowid'i kalır) → bu değere
    // güvenmek YANLIŞ/alakasız bir aktivite id'si döndürür. NON-NULL durumda kombinasyon
    // benzersiz olduğundan id'yi kanonik SELECT ile çöz.
    if ((input.teacherId ?? null) === null) {
      return Number(result.lastInsertRowid);
    }
    const existing = db
      .prepare(
        `SELECT id FROM activities
         WHERE school_id = ? AND class_id = ? AND subject_id = ? AND teacher_id = ?`,
      )
      .get(schoolId, input.classId, input.subjectId, input.teacherId) as
      | { id: number }
      | undefined;
    if (!existing) {
      throw new Error('Aktivite kaydedildikten sonra bulunamadı.');
    }
    return existing.id;
  },

  delete(id: number): void {
    const db = getDb();
    const schoolId = schoolsRepo.getActiveId();
    // Bare DELETE bir split-grubun 2 üyesinden birini silerse, kalan üye split_group_id'sini
    // korur (1 üyeli yetim grup) → FET XML'inde var olmayan _g1 öğrenci-kümesine atıf →
    // fet-cl dosyayı reddeder, üretim tamamen çöker. cleanupOrphanGroup ile grubu temizle.
    // Ayrıca repodaki tek scope'suz mutasyondu; school_id ile sınırla (çok-okul izolasyonu).
    const trx = db.transaction(() => {
      const prev = db
        .prepare('SELECT split_group_id FROM activities WHERE id = ? AND school_id = ?')
        .get(id, schoolId) as { split_group_id: number | null } | undefined;
      db.prepare('DELETE FROM activities WHERE id = ? AND school_id = ?').run(id, schoolId);
      if (prev?.split_group_id != null) cleanupOrphanGroup(db, schoolId, prev.split_group_id);
    });
    trx();
  },

  setSplitGroup(activityIds: number[]): number | null {
    const db = getDb();
    const schoolId = schoolsRepo.getActiveId();

    if (!Array.isArray(activityIds) || activityIds.length === 0) return null;

    const trx = db.transaction(() => {
      if (activityIds.length === 1) {
        const prev = db
          .prepare(
            'SELECT split_group_id FROM activities WHERE id = ? AND school_id = ?',
          )
          .get(activityIds[0], schoolId) as { split_group_id: number | null } | undefined;
        db.prepare(
          'UPDATE activities SET split_group_id = NULL WHERE id = ? AND school_id = ?',
        ).run(activityIds[0], schoolId);
        if (prev?.split_group_id != null) cleanupOrphanGroup(db, schoolId, prev.split_group_id);
        return null;
      }

      const prevGroups = db
        .prepare(
          `SELECT DISTINCT split_group_id FROM activities
           WHERE school_id = ? AND id IN (${activityIds.map(() => '?').join(',')})
             AND split_group_id IS NOT NULL`,
        )
        .all(schoolId, ...activityIds) as { split_group_id: number }[];

      const next =
        ((db
          .prepare(
            'SELECT COALESCE(MAX(split_group_id), 0) AS m FROM activities WHERE school_id = ?',
          )
          .get(schoolId) as { m: number }).m ?? 0) + 1;

      const upd = db.prepare(
        'UPDATE activities SET split_group_id = ? WHERE id = ? AND school_id = ?',
      );
      for (const id of activityIds) upd.run(next, id, schoolId);

      for (const g of prevGroups) {
        if (g.split_group_id === next) continue;
        cleanupOrphanGroup(db, schoolId, g.split_group_id);
      }
      return next;
    });

    return trx();
  },

  clearSplitGroup(activityId: number): void {
    const db = getDb();
    const schoolId = schoolsRepo.getActiveId();
    const trx = db.transaction(() => {
      const prev = db
        .prepare(
          'SELECT split_group_id FROM activities WHERE id = ? AND school_id = ?',
        )
        .get(activityId, schoolId) as { split_group_id: number | null } | undefined;
      db.prepare(
        'UPDATE activities SET split_group_id = NULL WHERE id = ? AND school_id = ?',
      ).run(activityId, schoolId);
      if (prev?.split_group_id != null) {
        cleanupOrphanGroup(db, schoolId, prev.split_group_id);
      }
    });
    trx();
  },
};

function cleanupOrphanGroup(
  db: ReturnType<typeof getDb>,
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
