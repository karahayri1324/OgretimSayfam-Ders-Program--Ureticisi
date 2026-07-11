import { getDb } from '../connection.js';

export type SettingsMap = Record<string, string>;

export const RESERVED_SETTING_KEYS = new Set(['authToken', 'authUser']);

export const WRITABLE_SETTING_KEYS = new Set([
  'aiTimeoutSec',
  'aiMaxToolIterations',
  'fetTimeLimitSec',
  // NOT: 'fetBinaryPath' bilinçli olarak YAZILABİLİR DEĞİL. (1) runner fetBinaryPath()'i
  // platform-sabit resource yolundan çözer, bu ayarı hiç okumaz → yazılırsa ölü/yanıltıcı.
  // (2) Güvenlik: AI set_setting veya settings API'si bu yolu değiştirebilseydi ve okunsaydı,
  // keyfi bir binary'yi (örn. /bin/sh) FET yerine çalıştırmak mümkün olurdu (RCE yüzeyi).
  'theme',
  'language',
]);

export const settingsRepo = {
  getAll(): SettingsMap {
    const rows = getDb()
      .prepare('SELECT key, value FROM settings')
      .all() as { key: string; value: string | null }[];
    const out: SettingsMap = {};
    for (const r of rows) {
      if (RESERVED_SETTING_KEYS.has(r.key)) continue;
      out[r.key] = r.value ?? '';
    }
    return out;
  },

  get(key: string): string | null {
    const row = getDb()
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(key) as { value: string | null } | undefined;
    return row?.value ?? null;
  },

  setMany(patch: SettingsMap): SettingsMap {
    const db = getDb();
    const stmt = db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    );
    const trx = db.transaction(() => {
      for (const [k, v] of Object.entries(patch)) stmt.run(k, v);
    });
    trx();
    return this.getAll();
  },

  set(key: string, value: string): void {
    this.setMany({ [key]: value });
  },
};
