/**
 * fet-cl runner — child_process.spawn wrapper.
 *
 * Sorumluluk:
 *  - Binary'yi spawn et, stdout/stderr stream et
 *  - stdout'tan progress event'leri parse et (onProgress callback'i)
 *  - exit code'a göre başarı/hata sonucu döndür
 *  - AbortSignal ile cancel desteği (SIGTERM)
 *  - Hata mesajlarını Türkçe FET hata tablosuna eşleştir
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fetBinaryPath } from './binary-path.js';
import { parseTimetable } from './xml-parser.js';
import type {
  FetProgressEvent,
  FetResult,
  FetRunOptions,
  SchoolBundle,
} from './types.js';
import type { TimetableSlot } from '../../src/lib/types.js';

/**
 * runFet — XML dosyasını alır, fet-cl çalıştırır, sonuç döner.
 *
 * @param fetFilePath — input .fet dosyasının tam yolu
 * @param outputDir   — fet-cl'in çıktıları yazacağı dizin (üst katman mktempdir verir)
 * @param bundle      — parser için orijinal veri (Activity Id eşleştirmesi gerekli)
 * @param fetActivityIdsByActivity — DB activity id → FET id'leri (xml-builder'dan)
 * @param opts        — timeLimit, signal, onProgress
 */
export async function runFet(
  fetFilePath: string,
  outputDir: string,
  bundle: SchoolBundle,
  fetActivityIdsByActivity: Map<number, number[]>,
  opts: FetRunOptions = {},
): Promise<FetResult> {
  const start = Date.now();
  const binary = fetBinaryPath();
  const timeLimit = opts.timeLimit ?? 120;
  const language = opts.language ?? 'tr';

  // Çıktı dizinini hazırla
  await fs.promises.mkdir(outputDir, { recursive: true });

  const args = [
    `--inputfile=${fetFilePath}`,
    `--outputdir=${outputDir}`,
    `--language=${language}`,
    `--timelimitseconds=${timeLimit}`,
    `--htmllevel=2`,
    `--writetimetablesxml=true`,
    `--writetimetablesactivities=true`,
    `--writetimetablessubgroups=true`,
    `--writetimetablesteachers=true`,
    `--writetimetablesrooms=true`,
    `--printactivitytags=false`,
  ];

  opts.onProgress?.({
    kind: 'start',
    message: `FET başlatılıyor (zaman sınırı: ${timeLimit}s)`,
  });

  return new Promise<FetResult>(resolve => {
    let proc;
    try {
      proc = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      resolve({
        ok: false,
        errorCode: 'BINARY_NOT_FOUND',
        message: 'FET motoru bulunamadı. Uygulamayı yeniden yükleyin.',
        rawError: String(e),
        durationMs: Date.now() - start,
      });
      return;
    }

    let stdoutBuf = '';
    let stderrBuf = '';
    let cancelled = false;

    const onAbort = () => {
      cancelled = true;
      try { proc.kill('SIGTERM'); } catch { /* ignore */ }
      // Inatçı işlemleri 5sn sonra zorla kapat
      setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch { /* ignore */ }
      }, 5000).unref?.();
    };
    if (opts.signal) {
      if (opts.signal.aborted) {
        onAbort();
      } else {
        opts.signal.addEventListener('abort', onAbort, { once: true });
      }
    }

    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      stdoutBuf += text;
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        if (isCosmeticNoiseLine(line)) continue;
        opts.onProgress?.({ kind: 'log', line });
        const progress = parseProgressLine(line);
        if (progress !== null) opts.onProgress?.(progress);
      }
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      stderrBuf += text;
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        if (isCosmeticNoiseLine(line)) continue;
        opts.onProgress?.({ kind: 'log', line: `[stderr] ${line}` });
      }
    });

    proc.on('error', err => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        resolve({
          ok: false,
          errorCode: 'BINARY_NOT_FOUND',
          message: 'FET motoru bulunamadı. Uygulamayı yeniden yükleyin.',
          rawError: String(err),
          durationMs: Date.now() - start,
        });
      } else {
        resolve({
          ok: false,
          errorCode: 'UNKNOWN',
          message: `FET çalıştırılamadı: ${err.message}`,
          rawError: String(err),
          durationMs: Date.now() - start,
        });
      }
    });

    proc.on('exit', async (code, signal) => {
      if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
      const duration = Date.now() - start;

      if (cancelled) {
        resolve({
          ok: false,
          errorCode: 'CANCELLED',
          message: 'Üretim iptal edildi.',
          outputDir,
          durationMs: duration,
        });
        return;
      }

      if (signal === 'SIGTERM' || signal === 'SIGKILL') {
        // FET zaman sınırını aştıysa kendisi de SIGTERM atabilir; cancel'la
        // çakışmasın diye yukarıdaki branch'te ele alındı.
        resolve({
          ok: false,
          errorCode: 'TIMEOUT',
          message: 'Çözüm uzun sürdü, zaman aşımı. Süreyi uzatın veya kısıtlamaları gevşetin.',
          outputDir,
          rawError: stderrBuf || stdoutBuf,
          durationMs: duration,
        });
        return;
      }

      if (code === 0) {
        // "Could not generate" stdout'a yazılır ama exit code 0 olabilir;
        // bunu da kontrol et.
        if (/could not (generate|find)/i.test(stdoutBuf)) {
          resolve({
            ok: false,
            errorCode: 'NO_SOLUTION',
            message:
              'Kısıtlamalar çok sert, çözüm bulunamadı. Bazı kısıtlamaları kaldırın veya esnetin.',
            outputDir,
            rawError: stdoutBuf,
            durationMs: duration,
          });
          return;
        }

        try {
          const timetable: TimetableSlot[] = await parseTimetable(outputDir, {
            bundle,
            fetActivityIdsByActivity,
          });
          opts.onProgress?.({ kind: 'done', message: 'Program başarıyla üretildi' });
          resolve({ ok: true, outputDir, timetable, durationMs: duration });
        } catch (e) {
          resolve({
            ok: false,
            errorCode: 'PARSE_ERROR',
            message: 'FET çıktısı okunamadı. Lütfen geliştiriciye bildirin.',
            outputDir,
            rawError: String(e),
            durationMs: duration,
          });
        }
        return;
      }

      // exit code != 0
      const errFile = await readErrorFiles(outputDir);
      const raw = [errFile, stderrBuf, stdoutBuf].filter(Boolean).join('\n');
      const cls = classifyError(raw);
      resolve({
        ok: false,
        errorCode: cls.code,
        message: cls.message,
        outputDir,
        rawError: raw,
        durationMs: duration,
      });
    });
  });
}

// ---------- yardımcılar ----------

/**
 * fet-cl stdout/stderr'inden gelen "kozmetik" gürültü satırlarını UI'a
 * göstermemek için filtreler.
 *
 *  - "Translation for specified language not loaded ..." — fet-cl, sistem
 *    yolundaki `fet_tr.qm`'i bulamadığında uyarı basar. Production'da
 *    bundled translations/ dizini doğru yerde olduğundan görülmez; ancak
 *    geliştirme modunda `/usr/bin/fet-cl` (sistem) kullanılınca gözükür.
 *    Bu mesaj kullanıcı için anlamsız + İngilizce + her Generate'de tekrar
 *    eder → suppress.
 *  - "FET searched for the translation file ..." — yukarıdaki uyarının
 *    detay satırı.
 *  - "Opening a file generated with a newer version ..." — bundled FET
 *    6.8.5 ile yeni sürüm XML schema farkı uyarısı; bizim üretimimiz uyumlu.
 *  - "Your FET version: 6.8.5, file version: ..." — yukarıdaki bilgi
 *    detayı.
 *
 * Diğer hata/uyarı satırları aynen renderer'a iletilir.
 */
function isCosmeticNoiseLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  return (
    /Translation for specified language not loaded/i.test(t) ||
    /FET searched for the translation file/i.test(t) ||
    /Opening a file generated with a newer version/i.test(t) ||
    /^Your FET version:/i.test(t) ||
    // Türkçe karşılıkları (translation yüklendiğinde):
    /Belirtilen dil için çeviri yüklenmedi/i.test(t) ||
    /Daha yeni bir sürümle oluşturulmuş/i.test(t) ||
    /^Ders programı versiyonu/i.test(t) ||
    // Başlık satırları ("Title: FET warning", "Başlık: Bilgi" vb.) bu uyarıları çevreler
    /^(Title|Başlık):\s*(FET\s+)?(warning|information|Uyarı|Bilgi)/i.test(t)
  );
}

/**
 * stdout satırından progress event'i parse eder. FET şu tip satırlar yazar:
 *  - "Starting timetable generation..."
 *  - "Activity X / Y placed"
 *  - "Simulation successful"
 *  - "Could not generate ..."
 */
function parseProgressLine(line: string): FetProgressEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  if (/starting timetable generation/i.test(trimmed)) {
    return { kind: 'progress', value: 0, message: 'Üretim başladı' };
  }
  // "X out of Y activities placed" benzeri
  const m = trimmed.match(/(\d+)\s*(?:out of|\/|of)\s*(\d+)/i);
  if (m) {
    const placed = parseInt(m[1], 10);
    const total = parseInt(m[2], 10);
    if (total > 0) {
      return {
        kind: 'progress',
        value: Math.min(1, placed / total),
        message: `${placed}/${total} aktivite yerleştirildi`,
      };
    }
  }
  if (/simulation successful/i.test(trimmed)) {
    return { kind: 'progress', value: 1, message: 'Çözüm bulundu' };
  }
  return null;
}

/**
 * outputDir/logs altında *.txt veya hata dosyaları varsa içeriğini topla.
 */
async function readErrorFiles(outputDir: string): Promise<string> {
  const logsDir = path.join(outputDir, 'logs');
  try {
    const files = await fs.promises.readdir(logsDir);
    const parts: string[] = [];
    for (const f of files) {
      if (!/error|result|log/i.test(f)) continue;
      try {
        const content = await fs.promises.readFile(path.join(logsDir, f), 'utf-8');
        parts.push(`--- ${f} ---\n${content}`);
      } catch { /* ignore */ }
    }
    return parts.join('\n\n');
  } catch {
    return '';
  }
}

type ErrCode = Extract<FetResult, { ok: false }>['errorCode'];

function classifyError(raw: string): { code: ErrCode; message: string } {
  if (/could not (generate|find)/i.test(raw)) {
    return {
      code: 'NO_SOLUTION',
      message:
        'Kısıtlamalar çok sert, çözüm bulunamadı. Bazı kısıtlamaları kaldırın veya esnetin.',
    };
  }
  if (/xml|parse|invalid/i.test(raw)) {
    return {
      code: 'XML_ERROR',
      message: 'Veride hata var. Lütfen geliştiriciye bildirin.',
    };
  }
  if (/enoent|not found|cannot find/i.test(raw)) {
    return {
      code: 'BINARY_NOT_FOUND',
      message: 'FET motoru bulunamadı. Uygulamayı yeniden yükleyin.',
    };
  }
  return {
    code: 'UNKNOWN',
    message: 'Bilinmeyen hata. Lütfen logları kontrol edin.',
  };
}
