import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerAllHandlers } from './ipc/index.js';
import { initDatabase, closeDatabase } from './db/connection.js';
import { log } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Linux'ta SUID chrome-sandbox helper'ı yapılandırılmamışsa (tipik dev/CI ortamı),
// ELECTRON_DISABLE_SANDBOX=1 ile sandbox'ı kapatıp uygulamayı başlatabilmek için.
// Prod'da env set edilmediğinden tetiklenmez — güvenlik etkisi yok.
if (process.env.ELECTRON_DISABLE_SANDBOX === '1') {
  app.commandLine.appendSwitch('no-sandbox');
}

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Ders Program Oluşturucu',
    backgroundColor: '#f8fafc',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
    if (isDev) {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  }

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log.error('Renderer yüklenemedi', { code, desc, url });
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    log.error('Renderer process öldü', details);
  });
  win.webContents.on(
    'console-message',
    (_e, level, message, line, sourceId) => {
      log.info('[renderer console]', { level, message, line, sourceId });
    },
  );

  return win;
}

app.whenReady().then(() => {
  try {
    initDatabase();
  } catch (e) {
    log.error('Veritabanı başlatılamadı', { error: String(e) });
    app.quit();
    return;
  }

  registerAllHandlers(() => mainWindow!);
  mainWindow = createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  closeDatabase();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  closeDatabase();
});
