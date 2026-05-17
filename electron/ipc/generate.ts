/**
 * generate:* IPC handler'ları — gerçek FET üretim akışı.
 *
 * Akış:
 *   1) gatherSchoolData() ile DB'den tüm bağımlı tabloları topla
 *   2) buildFetXml ile XML üret (block expansion + auto constraint'ler)
 *   3) Tempdir altında input.fet yazıp fet-cl'i çalıştır
 *   4) Progress event'lerini renderer'a yolla (generate:progress kanalı)
 *   5) Başarı → timetables tablosuna kaydet, sonuç döndür
 *   6) Cancel desteği AbortController üzerinden
 */

import { ipcMain, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { safeHandler, validate, err, ok } from './_common.js';
import { GenerateRunOptsSchema } from './_schemas.js';
import { gatherSchoolData } from '../db/aggregators.js';
import { timetablesRepo } from '../db/repositories/timetables.js';
import { settingsRepo } from '../db/repositories/settings.js';
import { buildFetXml } from '../fet/xml-builder.js';
import { runFet } from '../fet/runner.js';
import { checkFetAvailable } from '../fet/binary-path.js';
import { log } from '../utils/logger.js';
import type { FetProgressEvent } from '../fet/types.js';
import type { GenerateProgress, TimetableResult } from '../../src/lib/types.js';

/**
 * Settings'ten saniye cinsinden FET zaman sınırını okur. Default 120s.
 * Hem yeni anahtar (`fetTimeLimitSec`) hem eski (`fetTimeLimit`) destekli.
 */
function readFetTimeLimitFromSettings(): number {
  try {
    const raw =
      settingsRepo.get('fetTimeLimitSec') ?? settingsRepo.get('fetTimeLimit');
    const n = parseInt(String(raw ?? ''), 10);
    if (Number.isFinite(n) && n >= 5) return n;
  } catch {
    /* ignore */
  }
  return 120;
}

let activeController: AbortController | null = null;

export function registerGenerateHandlers(getWindow: () => BrowserWindow): void {
  ipcMain.handle('generate:run', async (_e, raw) => {
    const v = validate(GenerateRunOptsSchema, raw);
    if (!v.ok) return v.error;
    const opts = v.data ?? {};

    if (activeController) {
      return err('BUSY', 'Zaten bir üretim devam ediyor. Önce iptal edin.');
    }

    const fetOk = await checkFetAvailable();
    if (!fetOk) {
      return err(
        'BINARY_NOT_FOUND',
        'FET motoru bulunamadı. Uygulamayı yeniden yükleyin.',
      );
    }

    const controller = new AbortController();
    activeController = controller;

    const emit = (event: GenerateProgress) => {
      try {
        getWindow()?.webContents.send('generate:progress', event);
      } catch (e) {
        log.warn('progress emit edilemedi', { error: String(e) });
      }
    };

    let tmpDir: string | null = null;
    try {
      // 1) DB'den veri topla
      const bundle = gatherSchoolData();
      if (bundle.teachers.length === 0) {
        return err(
          'NO_TEACHERS',
          'Henüz öğretmen tanımlı değil. Önce "Öğretmenler" ekranından öğretmen ekleyin.',
        );
      }
      if (bundle.classes.length === 0) {
        return err(
          'NO_CLASSES',
          'Henüz sınıf tanımlı değil. Önce "Sınıflar" ekranından sınıf ekleyin.',
        );
      }
      if (bundle.activities.length === 0) {
        return err(
          'NO_ACTIVITIES',
          'Henüz ders ataması (aktivite) tanımlı değil. Önce "Dersler" ekranından sınıf × ders × öğretmen ataması yapın.',
        );
      }
      if (bundle.days.length === 0 || bundle.hours.length === 0) {
        return err(
          'NO_SCHEDULE',
          'Önce gün ve saat tanımlarını yapın. "Gelişmiş → Gün/Saat Planı" ekranı.',
        );
      }

      emit({ kind: 'progress', value: 0, message: 'Veriler hazırlanıyor' });

      // 2) XML üret
      const built = buildFetXml(bundle);
      if (built.skipped.length > 0) {
        // Detayları main-process log'una yaz (debug için), ama UI'a sadece
        // özet ve "ciddi" atlamaları (eşleşmeyen isim referansları) bildir.
        // "En az 2 aktivite gerekli" / "boş slots" gibi presetin/AI'nın
        // doğal sınırlamaları kullanıcıya gürültü oluşturuyor.
        log.warn('Bazı constraint\'ler atlandı', { skipped: built.skipped });
        const meaningful = built.skipped.filter((s) => !isBenignSkipReason(s.reason));
        if (meaningful.length > 0) {
          for (const s of meaningful) {
            emit({ kind: 'log', line: `Atlandı [${s.type}]: ${s.reason}` });
          }
        }
        const totalSkipped = built.skipped.length;
        emit({
          kind: 'log',
          line: `${totalSkipped} kısıtlama atlandı (${meaningful.length} anlamlı, ${totalSkipped - meaningful.length} doğal sınırlama).`,
        });
      }

      // 3) Tempdir hazırla
      tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dpo-'));
      const inputFile = path.join(tmpDir, 'input.fet');
      const outDir = path.join(tmpDir, 'out');
      await fs.promises.writeFile(inputFile, built.xml, 'utf-8');
      await fs.promises.mkdir(outDir, { recursive: true });

      emit({ kind: 'progress', value: 0.05, message: 'FET motoru başlatılıyor' });

      // 4) FET'i çalıştır + progress relay
      const onFetProgress = (ev: FetProgressEvent) => {
        switch (ev.kind) {
          case 'log':
            emit({ kind: 'log', line: ev.line });
            break;
          case 'progress':
            // 0.05-0.95 aralığına yerleştir
            emit({
              kind: 'progress',
              value: 0.05 + Math.min(1, Math.max(0, ev.value)) * 0.9,
              message: ev.message,
            });
            break;
          case 'start':
            emit({ kind: 'log', line: ev.message });
            break;
          case 'done':
            emit({ kind: 'progress', value: 0.95, message: ev.message });
            break;
          case 'error':
            emit({ kind: 'error', message: ev.message });
            break;
        }
      };

      // opts.timeLimit verilmemişse settings'ten oku, o da yoksa 120s.
      const effectiveTimeLimit =
        opts.timeLimit ?? readFetTimeLimitFromSettings();

      const fetResult = await runFet(
        inputFile,
        outDir,
        bundle,
        built.fetActivityIdsByActivity,
        {
          timeLimit: effectiveTimeLimit,
          signal: controller.signal,
          onProgress: onFetProgress,
        },
      );

      if (!fetResult.ok) {
        emit({ kind: 'error', message: fetResult.message });
        return err(fetResult.errorCode, fetResult.message, {
          outputDir: fetResult.outputDir,
          rawError: fetResult.rawError,
          durationMs: fetResult.durationMs,
        });
      }

      // 5) DB'ye kaydet
      const savedId = timetablesRepo.save({
        fetInputXml: built.xml,
        status: 'success',
        conflicts: [],
        durationMs: fetResult.durationMs,
        slots: fetResult.timetable.map((s) => ({
          activityId: s.activityId,
          // FET Activity Id ↔ DB activity id: parser teacherName/subjectName'ı
          // dolduruyor, source DB activity'yi bulmak için fetActivityIdsByActivity'i
          // tersine çevirip kaydediyoruz.
          sourceActivityId: lookupDbActivityId(built.fetActivityIdsByActivity, s.activityId),
          dayIndex: s.dayIndex,
          hourIndex: s.hourIndex,
          classId: s.classId,
          teacherId: s.teacherId,
          subjectId: s.subjectId,
          roomId: s.roomId,
        })),
      });

      const result: TimetableResult = {
        id: savedId,
        generatedAt: new Date().toISOString(),
        status: 'success',
        durationMs: fetResult.durationMs,
        slots: fetResult.timetable,
        conflicts: [],
      };

      emit({ kind: 'progress', value: 1, message: 'Tamamlandı' });
      emit({ kind: 'done', result });

      return ok(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log.error('generate:run beklenmeyen hata', { error: message });
      emit({ kind: 'error', message });
      return err('UNKNOWN', `Beklenmeyen hata: ${message}`, message);
    } finally {
      activeController = null;
      // tmpDir'i geride bırakıyoruz; kullanıcı/destek ekibi loglara bakabilsin.
      // İleride: settings'ten "auto-cleanup temp dirs" seçeneği.
      void tmpDir;
    }
  });

  ipcMain.handle('generate:cancel', async () => {
    if (!activeController) {
      return ok({ cancelled: false });
    }
    activeController.abort();
    return ok({ cancelled: true });
  });

  ipcMain.handle('generate:latest', async () =>
    safeHandler('generate:latest', () => timetablesRepo.latest()),
  );
}

/** FET Activity Id'yi DB activity id'ye çevirir. */
function lookupDbActivityId(
  map: Map<number, number[]>,
  fetId: number,
): number | null {
  for (const [dbId, ids] of map) {
    if (ids.includes(fetId)) return dbId;
  }
  return null;
}

/**
 * "Bu atlama doğal/zararsız mı?" testi. AI veya preset'in oluşturduğu
 * constraint'in bağlamı henüz yokken atlanması (örn. henüz activity yok →
 * "En az 2 aktivite gerekli") kullanıcı için bilgi değeri taşımaz.
 *
 * Kullanıcıya gösterilmesi gereken atlamalar:
 *  - "Bilinmeyen öğretmen/sınıf/ders/derslik/gün" → veride yazım hatası
 *    veya silinmiş referans (gerçek sorun).
 *  - "Geçerli slot bulunamadı" → AI çıkarımı yanlış (gerçek sorun).
 *
 * Gizlenenler:
 *  - "En az N aktivite gerekli", "activityIds boş", "subject alanı boş" vb.
 *    → constraint'in kendi ön koşulu sağlanmamış.
 *  - "Eşleşen aktivite yok" → constraint targetı henüz okul verisinde yok.
 *  - "Ardışıklık için en az 2 aktivite gerekli" → split olmayan ders.
 *  - "Çiftleştirilebilir aktivite yok" → yine doğal sınır.
 *  - "İlk/son ders saati tanımsız" → konfigürasyon eksik (settings sayfası).
 */
function isBenignSkipReason(reason: string): boolean {
  return (
    /^En az \d+ aktivite gerekli/i.test(reason) ||
    /^Ardışıklık için en az/i.test(reason) ||
    /^Çiftleştirilebilir aktivite yok/i.test(reason) ||
    /^Eşleşen aktivite yok/i.test(reason) ||
    /^Eşleşen aktivite bulunamadı/i.test(reason) ||
    /^Aktivite bulunamadı:/i.test(reason) ||
    /^activityIds boş/i.test(reason) ||
    /alanı boş$/i.test(reason) ||
    /^slots boş/i.test(reason) ||
    /eksik$/i.test(reason) ||
    /^Geçerli derslik yok/i.test(reason) ||
    /^Geçerli saat yok/i.test(reason) ||
    /^İlk ders saati tanımsız/i.test(reason) ||
    /^Son ders saati tanımsız/i.test(reason)
  );
}
