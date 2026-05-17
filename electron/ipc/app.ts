import { ipcMain, shell, app, BrowserWindow, dialog } from 'electron';
import fs from 'node:fs/promises';
import { safeHandler } from './_common.js';
import { logsDir } from '../utils/paths.js';
import { checkFetAvailable, fetBinaryPath } from '../fet/binary-path.js';
import { log } from '../utils/logger.js';

const FET_SOURCE_URL = 'https://lalescu.ro/liviu/fet/';

/**
 * HTML içeriğini gizli bir BrowserWindow'a yükler, printToPDF ile PDF üretir
 * ve kullanıcıdan kayıt yeri ister.
 *
 * Sandbox güvenliği için node entegrasyonu kapalı bırakıldı; data: URL ile
 * sadece statik HTML render edilir. Dialog iptal edilirse {cancelled:true} döner.
 */
async function exportHtmlAsPdf(
  html: string,
  defaultFilename: string,
): Promise<
  | { cancelled: true; filePath: null }
  | { cancelled: false; filePath: string }
> {
  // Save dialog'u önce göster — kullanıcı iptal ederse boşa hidden window açmayalım
  const focused = BrowserWindow.getFocusedWindow();
  const dialogOpts: Electron.SaveDialogOptions = {
    title: 'PDF olarak kaydet',
    defaultPath: defaultFilename,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  };
  const result = focused
    ? await dialog.showSaveDialog(focused, dialogOpts)
    : await dialog.showSaveDialog(dialogOpts);
  if (result.canceled || !result.filePath) {
    return { cancelled: true, filePath: null };
  }
  const filePath = result.filePath;

  const hiddenWin = new BrowserWindow({
    show: false,
    width: 1240,
    height: 1754,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      javascript: false,
    },
  });

  try {
    // data: URL — context'in dışında, herhangi bir cookie/lokal-storage paylaşımı yok
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    await hiddenWin.loadURL(dataUrl);

    const pdf = await hiddenWin.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      landscape: true,
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
    });
    await fs.writeFile(filePath, pdf);
    log.info('PDF dışa aktarıldı', { filePath, bytes: pdf.byteLength });
    return { cancelled: false, filePath };
  } finally {
    if (!hiddenWin.isDestroyed()) hiddenWin.destroy();
  }
}

export function registerAppHandlers(): void {
  ipcMain.handle('app:version', async () =>
    safeHandler('app:version', () => ({
      version: app.getVersion(),
      name: app.getName(),
      electron: process.versions.electron,
      node: process.versions.node,
      platform: process.platform,
    })),
  );

  ipcMain.handle('app:checkFet', async () =>
    safeHandler('app:checkFet', async () => {
      const available = await checkFetAvailable();
      return { available, path: fetBinaryPath() };
    }),
  );

  ipcMain.handle('app:openFETSource', async () =>
    safeHandler('app:openFETSource', async () => {
      await shell.openExternal(FET_SOURCE_URL);
      return { url: FET_SOURCE_URL };
    }),
  );

  ipcMain.handle('app:openLogs', async () =>
    safeHandler('app:openLogs', async () => {
      const dir = logsDir();
      const result = await shell.openPath(dir);
      // shell.openPath başarısız olursa boş string yerine hata mesajı döner
      if (result) {
        throw new Error(`Log klasörü açılamadı: ${result}`);
      }
      return { path: dir };
    }),
  );

  /**
   * Renderer'dan HTML alır, kullanıcıya save dialog gösterir ve PDF'e döker.
   * Dönüş: { filePath } başarılı; { cancelled: true } iptal; safeHandler
   * exception'ları yakalar.
   */
  ipcMain.handle(
    'app:exportPdf',
    async (_evt, html: unknown, defaultFilename: unknown) =>
      safeHandler('app:exportPdf', async () => {
        if (typeof html !== 'string' || html.trim().length === 0) {
          throw new Error('Geçersiz HTML içeriği.');
        }
        const fname =
          typeof defaultFilename === 'string' && defaultFilename.trim()
            ? defaultFilename
            : 'export.pdf';
        const safeFname = fname.endsWith('.pdf') ? fname : `${fname}.pdf`;
        return await exportHtmlAsPdf(html, safeFname);
      }),
  );
}
