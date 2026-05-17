import { getDb } from '../connection.js';

export type School = {
  id: number;
  name: string;
  createdAt: string;
  isActive: boolean;
};

type SchoolRow = {
  id: number;
  name: string;
  created_at: string;
  is_active: number;
};

function rowToSchool(r: SchoolRow): School {
  return {
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    isActive: r.is_active === 1,
  };
}

export const schoolsRepo = {
  list(): School[] {
    const rows = getDb()
      .prepare(
        'SELECT id, name, created_at, is_active FROM schools ORDER BY id ASC',
      )
      .all() as SchoolRow[];
    return rows.map(rowToSchool);
  },

  getActive(): School {
    const row = getDb()
      .prepare(
        `SELECT id, name, created_at, is_active
         FROM schools
         WHERE is_active = 1
         ORDER BY id ASC
         LIMIT 1`,
      )
      .get() as SchoolRow | undefined;
    if (!row) {
      throw new Error('Aktif okul bulunamadı. Veritabanı henüz seed edilmemiş olabilir.');
    }
    return rowToSchool(row);
  },

  /** Aktif okul id'sini döner. IPC handler'ları her yerden bunu çağırır. */
  getActiveId(): number {
    return this.getActive().id;
  },

  rename(id: number, name: string): void {
    getDb().prepare('UPDATE schools SET name = ? WHERE id = ?').run(name, id);
  },
};
