import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function tempDir(prefix = 'dpo-'): string {
  const base = path.join(
    os.tmpdir(),
    `${prefix}${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
  );
  fs.mkdirSync(base, { recursive: true });
  return base;
}

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

export function userDataDir(): string {
  return app.getPath('userData');
}

export function appDataDir(): string {
  const docs = app.getPath('documents');
  const dir = path.join(docs, 'ÖğretimSayfam Ders Programı');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function logsDir(): string {
  const dir = path.join(appDataDir(), 'loglar');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function dbPath(): string {
  return path.join(appDataDir(), 'veri.db');
}
