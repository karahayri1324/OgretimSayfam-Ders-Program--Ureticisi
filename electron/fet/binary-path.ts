/**
 * Platforma göre fet-cl binary'sinin path'ini çözer.
 *
 * Geliştirmede (NODE_ENV=development veya app.isPackaged === false):
 *   - Linux için /usr/bin/fet-cl varsa onu kullan (sistem paketinden gelir)
 *   - Yoksa resources/bin/<platform>/fet-cl path'ini dene
 *
 * Production (paketlenmiş):
 *   - process.resourcesPath/bin/fet-cl (veya .exe Windows için)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let _appRef: typeof import('electron').app | null = null;

function getApp(): typeof import('electron').app | null {
  if (_appRef) return _appRef;
  try {
    // Test ortamında electron import edilemeyebilir
    const electron = require('electron') as { app?: typeof import('electron').app };
    _appRef = electron.app ?? null;
    return _appRef;
  } catch {
    return null;
  }
}

function isDevMode(): boolean {
  const app = getApp();
  if (app && typeof app.isPackaged === 'boolean') {
    return !app.isPackaged;
  }
  return process.env['NODE_ENV'] !== 'production';
}

function platformDirName(): 'linux' | 'win' | 'mac' {
  switch (process.platform) {
    case 'win32':
      return 'win';
    case 'darwin':
      return 'mac';
    default:
      return 'linux';
  }
}

function binaryFileName(): string {
  return process.platform === 'win32' ? 'fet-cl.exe' : 'fet-cl';
}

/**
 * fet-cl tam yolu. Dosya gerçekte mevcut olmayabilir;
 * doğrulama için checkFetAvailable() kullanın.
 */
export function fetBinaryPath(): string {
  const fileName = binaryFileName();

  if (isDevMode()) {
    // 1) Linux'ta sistem paketinden /usr/bin/fet-cl
    if (process.platform === 'linux') {
      const sys = '/usr/bin/fet-cl';
      if (fs.existsSync(sys)) return sys;
    }
    // 2) Repo içindeki resources/bin/<platform>/
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    // out/main/index.js'den de çalışsa çalışmasa da repo köküne ulaşalım
    const candidates = [
      path.resolve(__dirname, '..', '..', 'resources', 'bin', platformDirName(), fileName),
      path.resolve(__dirname, '..', '..', '..', 'resources', 'bin', platformDirName(), fileName),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    // 3) Son çare: linux'ta yine sistem yolunu döndür (var olmasa da)
    if (process.platform === 'linux') return '/usr/bin/fet-cl';
    return candidates[0];
  }

  // Production: bundled resources/bin
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
    ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  return path.join(resourcesPath, 'bin', fileName);
}

/**
 * Binary mevcut ve çalıştırılabilir mi?
 */
export async function checkFetAvailable(): Promise<boolean> {
  const p = fetBinaryPath();
  try {
    await fs.promises.access(p, fs.constants.F_OK | fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
