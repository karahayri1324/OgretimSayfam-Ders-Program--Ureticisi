import { app } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type LogLevel = 'INFO' | 'WARN' | 'ERROR';

let cachedLogFile: string | null = null;

/**
 * Kullanıcı dostu log dizini.
 *  - Packaged: ~/Documents/ÖğretimSayfam Ders Programı/loglar/
 *  - Dev/no app: cwd altında veya tmpdir fallback
 *
 * Buraya `paths.ts`'i import etmiyoruz çünkü logger çok erken çağrılabilir
 * (initDatabase/registerHandlers öncesi). Bağımsız hesaplıyoruz.
 */
function resolveLogDir(): string {
  try {
    if (app?.getPath) {
      // Documents altı tercih edilir — kullanıcı dostu konum.
      try {
        const docs = app.getPath('documents');
        return path.join(docs, 'ÖğretimSayfam Ders Programı', 'loglar');
      } catch {
        return path.join(app.getPath('userData'), 'logs');
      }
    }
  } catch {
    /* fallthrough */
  }
  // Test / non-Electron ortamlar için fallback
  return path.join(os.tmpdir(), 'ders-program-olusturucu-logs');
}

function getLogFile(): string {
  if (cachedLogFile) return cachedLogFile;
  const logDir = resolveLogDir();
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch {
    // sessiz geç — logger her zaman çalışmalı
  }
  const today = new Date().toISOString().slice(0, 10);
  cachedLogFile = path.join(logDir, `${today}.log`);
  return cachedLogFile;
}

function write(level: LogLevel, msg: string, meta?: unknown): void {
  const timestamp = new Date().toISOString();
  const metaStr = meta === undefined ? '' : ' ' + safeStringify(meta);
  const line = `[${timestamp}] ${level} ${msg}${metaStr}\n`;
  try {
    fs.appendFileSync(getLogFile(), line);
  } catch {
    // dosya yazılamazsa sessiz geç
  }
  const isDev = !app.isPackaged || process.env['NODE_ENV'] === 'development';
  if (isDev) {
    const out = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log;
    out(line.trim());
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_k, v) => {
      if (v instanceof Error) {
        return { name: v.name, message: v.message, stack: v.stack };
      }
      return v;
    });
  } catch {
    return String(value);
  }
}

export const log = {
  info: (msg: string, meta?: unknown) => write('INFO', msg, meta),
  warn: (msg: string, meta?: unknown) => write('WARN', msg, meta),
  error: (msg: string, meta?: unknown) => write('ERROR', msg, meta),
  logsDir: () => path.dirname(getLogFile()),
};
