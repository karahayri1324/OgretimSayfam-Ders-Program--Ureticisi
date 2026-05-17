import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * .fet dosyaları ve FET output'u için geçici klasör.
 * Uygulama her açıldığında yeni bir alt klasör döner.
 */
export function tempDir(prefix = 'dpo-'): string {
  const base = path.join(
    os.tmpdir(),
    `${prefix}${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
  );
  fs.mkdirSync(base, { recursive: true });
  return base;
}

/**
 * Platform-spesifik FET binary yolunu döner.
 */
export function fetBinaryPath(): string {
  const platform = process.platform;
  const binaryName = platform === 'win32' ? 'fet-cl.exe' : 'fet-cl';
  const isDev = !app.isPackaged;

  if (isDev) {
    const candidates = [
      path.join(__dirname, '..', '..', 'resources', 'bin', platform, binaryName),
      path.join(__dirname, '..', '..', '..', 'resources', 'bin', platform, binaryName),
      path.join(process.cwd(), 'resources', 'bin', platform, binaryName),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return binaryName;
  }

  return path.join(process.resourcesPath, 'bin', binaryName);
}

/** Chromium'un kendi state'i için userData (Cache, Cookies, vs.) — kullanıcı buraya bakmaz. */
export function userDataDir(): string {
  return app.getPath('userData');
}

/**
 * Kullanıcının erişebileceği, anlaşılır bir konum.
 *  Linux/Mac : ~/Documents/ÖğretimSayfam Ders Programı/
 *  Windows   : %USERPROFILE%\Documents\ÖğretimSayfam Ders Programı\
 *
 * data.db, log dosyaları ve export'lar buraya yazılır. Chromium cache/cookies
 * userData'da kalır (kullanıcı görmez).
 */
export function appDataDir(): string {
  const docs = app.getPath('documents');
  const dir = path.join(docs, 'ÖğretimSayfam Ders Programı');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Log klasörü — kullanıcı dostu konum. */
export function logsDir(): string {
  const dir = path.join(appDataDir(), 'loglar');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** SQLite veritabanı dosya yolu. */
export function dbPath(): string {
  return path.join(appDataDir(), 'veri.db');
}
