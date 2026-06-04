import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { app } from 'electron';
import { dbPath } from '../utils/paths.js';
import { log } from '../utils/logger.js';
import { runMigrations } from './schema.js';

function legacyDbCandidates(): string[] {
  const home = os.homedir();
  const candidates: string[] = [];
  candidates.push(
    path.join(home, '.config', 'ders-program-olusturucu', 'data.db'),
  );
  try {
    if (app?.getPath) {
      const ud = app.getPath('userData');
      candidates.push(path.join(ud, 'data.db'));
      candidates.push(path.join(path.dirname(ud), 'ders-program-olusturucu', 'data.db'));
    }
  } catch {
  }
  return candidates;
}

function migrateLegacyDbIfNeeded(newPath: string): void {
  try {
    if (fs.existsSync(newPath)) return;
    for (const old of legacyDbCandidates()) {
      if (!old || old === newPath) continue;
      if (!fs.existsSync(old)) continue;
      try {
        const stat = fs.statSync(old);
        if (!stat.isFile() || stat.size === 0) continue;
        log.info('Eski DB tespit edildi, yeni konuma kopyalanıyor', {
          from: old,
          to: newPath,
        });
        // Atomik-benzeri taşıma: önce temp'e kopyala, yan dosya (WAL/SHM) kopyası başarısız
        // olursa kısmi çıktıyı SİL ve newPath OLUŞTURMA → sonraki açılışta yeniden denenir.
        // Eskiden main kopyalanıp WAL kopyası sessizce yutuluyordu → checkpoint'lenmemiş WAL
        // verisi kaybolur + newPath var olduğu için bir daha denenmezdi (#3).
        const tmp = `${newPath}.migrating`;
        const cleanupTmp = () => {
          for (const s of ['', '-wal', '-shm']) {
            try {
              if (fs.existsSync(`${tmp}${s}`)) fs.rmSync(`${tmp}${s}`);
            } catch {
              /* yoksay */
            }
          }
        };
        cleanupTmp();
        fs.copyFileSync(old, tmp);
        let sidesOk = true;
        for (const suffix of ['-wal', '-shm']) {
          const oldSide = `${old}${suffix}`;
          if (!fs.existsSync(oldSide)) continue;
          try {
            fs.copyFileSync(oldSide, `${tmp}${suffix}`);
          } catch (e) {
            log.warn('Yan dosya kopyalanamadı, taşıma iptal (yeniden denenecek)', {
              side: oldSide,
              error: String(e),
            });
            sidesOk = false;
            break;
          }
        }
        if (!sidesOk) {
          cleanupTmp();
          continue;
        }
        // Yan dosyaları ÖNCE, main'i SON taşı: main yalnız WAL/SHM hazırken belirir.
        for (const suffix of ['-wal', '-shm']) {
          if (fs.existsSync(`${tmp}${suffix}`)) {
            fs.renameSync(`${tmp}${suffix}`, `${newPath}${suffix}`);
          }
        }
        fs.renameSync(tmp, newPath);
        log.info('Eski DB başarıyla taşındı. Eski dosya yedek olarak duruyor.');
        return;
      } catch (e) {
        log.warn('Legacy DB kopyalama başarısız', { from: old, error: String(e) });
      }
    }
  } catch (e) {
    log.warn('Legacy migration kontrolünde hata', { error: String(e) });
  }
}

const DEFAULT_DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];
const DEFAULT_HOURS = [
  '1. Ders',
  '2. Ders',
  '3. Ders',
  '4. Ders',
  '5. Ders',
  '6. Ders',
  '7. Ders',
  '8. Ders',
];

const DEFAULT_SETTINGS: Record<string, string> = {
  aiTimeoutSec: '30',
  fetTimeLimitSec: '120',
  fetBinaryPath: '',
  theme: 'light',
  language: 'tr',
};

let db: Database.Database | null = null;

export function initDatabase(): Database.Database {
  if (db) return db;

  const file = dbPath();
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });

  migrateLegacyDbIfNeeded(file);

  log.info('Veritabanı açılıyor', { path: file });

  const instance = new Database(file);
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');

  try {
    runMigrations(instance);
    seedIfEmpty(instance);
  } catch (e) {
    log.error('Veritabanı başlatma sırasında hata', { error: String(e) });
    instance.close();
    throw e;
  }

  db = instance;
  return db;
}

export function closeDatabase(): void {
  if (!db) return;
  try {
    db.close();
    log.info('Veritabanı kapatıldı');
  } catch (e) {
    log.warn('Veritabanı kapatılırken hata', { error: String(e) });
  } finally {
    db = null;
  }
}

export function getDb(): Database.Database {
  if (!db) return initDatabase();
  return db;
}

function seedIfEmpty(instance: Database.Database): void {
  const schoolCount = (
    instance.prepare('SELECT COUNT(*) AS c FROM schools').get() as { c: number }
  ).c;

  if (schoolCount === 0) {
    log.info('İlk açılış: seed veri ekleniyor');
    const seed = instance.transaction(() => {
      const insertSchool = instance.prepare(
        'INSERT INTO schools (name, is_active) VALUES (?, 1)',
      );
      const schoolId = Number(insertSchool.run('Yeni Okul').lastInsertRowid);

      const insertDay = instance.prepare(
        'INSERT INTO days (school_id, name, order_index) VALUES (?, ?, ?)',
      );
      DEFAULT_DAYS.forEach((name, i) => insertDay.run(schoolId, name, i));

      const insertHour = instance.prepare(
        'INSERT INTO hours (school_id, name, order_index) VALUES (?, ?, ?)',
      );
      DEFAULT_HOURS.forEach((name, i) => insertHour.run(schoolId, name, i));
    });
    seed();
  }

  const renameMap: Record<string, string> = {
    aiTimeout: 'aiTimeoutSec',
    fetTimeLimit: 'fetTimeLimitSec',
  };
  const renameStmt = instance.prepare(
    `INSERT INTO settings (key, value)
     SELECT ?, value FROM settings WHERE key = ?
     ON CONFLICT(key) DO NOTHING`,
  );
  const renameTrx = instance.transaction(() => {
    for (const [oldKey, newKey] of Object.entries(renameMap)) {
      renameStmt.run(newKey, oldKey);
    }
  });
  renameTrx();

  const upsertSetting = instance.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING',
  );
  const seedSettings = instance.transaction(() => {
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
      upsertSetting.run(k, v);
    }
  });
  seedSettings();
}
