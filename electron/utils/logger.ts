import { app } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type LogLevel = 'INFO' | 'WARN' | 'ERROR';

let cachedLogFile: string | null = null;

function resolveLogDir(): string {
  try {
    if (app?.getPath) {
      try {
        const docs = app.getPath('documents');
        return path.join(docs, 'ÖğretimSayfam Ders Programı', 'loglar');
      } catch {
        return path.join(app.getPath('userData'), 'logs');
      }
    }
  } catch {
  }
  return path.join(os.tmpdir(), 'ders-program-olusturucu-logs');
}

function getLogFile(): string {
  if (cachedLogFile) return cachedLogFile;
  const logDir = resolveLogDir();
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch {
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
