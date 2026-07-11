
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fetBinaryPath } from './binary-path.js';
import { parseTimetable } from './xml-parser.js';
import type { Hour } from '../../src/lib/types.js';
import type {
  FetProgressEvent,
  FetResult,
  FetRunOptions,
  SchoolBundle,
} from './types.js';

// FET, çözülemez veriyi/kısıtı çeşitli kalıplarla bildirir. KRİTİK: precompute aşamasında
// reddederse ("Cannot precompute - data is wrong - aborting", "Cannot optimize for subgroup ...
// number of hours ... is X and you have only Y free slots") EXIT KODU 0 ile çıkar ve
// timetables/<base>/ dizinini BOŞ bırakır. Bu kalıplar hem code===0 dalında (parse'tan önce)
// hem code!==0 dalında (classifyError) NO_SOLUTION'a sınıflanmalı; aksi halde sıradan bir
// veri/kısıt hatası kullanıcıya PARSE_ERROR "geliştiriciye bildirin" olarak gösterilir ve
// AI düzeltme döngüsüne yanlış reason gider.
const INFEASIBLE_RE =
  /could not (generate|find)|cannot (generate|optimize|precompute|schedule)|data is wrong|impossib|imkans|olanaks|not enough|number of (hours|activities|sub-?activities)|(available|free) slots|inconsistent/i;

/** FET çıktı metni (stdout + logs) çözülemez veri/kısıt mı işaretliyor? Test edilebilirlik için
 *  dışa açık (FET infeasibility'yi exit 0 ile de bildirebildiğinden bu sınıflandırma kritiktir). */
export function isInfeasibleFetOutput(text: string): boolean {
  return INFEASIBLE_RE.test(text);
}

export async function runFet(
  fetFilePath: string,
  outputDir: string,
  bundle: SchoolBundle,
  fetActivityIdsByActivity: Map<number, number[]>,
  durationByFetId: Map<number, number>,
  builtHours: Hour[],
  opts: FetRunOptions = {},
): Promise<FetResult> {
  const start = Date.now();
  const binary = fetBinaryPath();
  const timeLimit = opts.timeLimit ?? 120;
  const language = opts.language ?? 'tr';

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
      // windowsHide: Windows'ta fet-cl.exe (console-subsystem) spawn edilince açılan siyah
      // konsol penceresini bastırır; yoksa her üretimde ekranda yanıp söner (#1).
      proc = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
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
      try { proc.kill('SIGTERM'); } catch { }
      setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch { }
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

    // 'exit' process sonlanınca ateşlenir ama stdout/stderr pipe'ları henüz tüm veriyi flush
    // etmemiş olabilir → son FET satırları (çoğu zaman kritik hata/sonuç satırı) stdoutBuf'ta
    // eksik kalıp yanlış sınıflandırmaya yol açardı. 'close' TÜM stdio kapandığında ateşlenir;
    // buffer'lar o an tamdır. Bu yüzden sınıflandırmayı 'close'ta yap.
    proc.on('close', async (code, signal) => {
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
        const resultText = `${stdoutBuf}\n${await readErrorFiles(outputDir)}`;
        if (INFEASIBLE_RE.test(resultText)) {
          resolve({
            ok: false,
            errorCode: 'NO_SOLUTION',
            message:
              'Kısıtlamalar çok sert, çözüm bulunamadı. Bazı kısıtlamaları kaldırın veya esnetin.',
            outputDir,
            rawError: resultText,
            durationMs: duration,
          });
          return;
        }

        try {
          const parsed = await parseTimetable(outputDir, {
            bundle,
            fetActivityIdsByActivity,
            durationByFetId,
            hours: builtHours,
          });
          if (parsed.unplacedFetIds.length > 0) {
            const total = parsed.placedFetIds.size + parsed.unplacedFetIds.length;
            resolve({
              ok: false,
              errorCode: 'PARTIAL',
              message:
                `Program tamamlanamadı: ${parsed.unplacedFetIds.length}/${total} ders yerleştirilemedi. ` +
                'Kısıtlamaları gevşetin ya da gün/saat ekleyin.',
              outputDir,
              rawError: resultText,
              durationMs: duration,
            });
            return;
          }
          opts.onProgress?.({ kind: 'done', message: 'Program başarıyla üretildi' });
          resolve({ ok: true, outputDir, timetable: parsed.slots, durationMs: duration });
        } catch (e) {
          // FET 0 ile çıkıp boş timetables dizini bırakmış olabilir (precompute reddi). Çıktı
          // metni infeasibility işaretliyse bu PARSE_ERROR değil NO_SOLUTION'dır — kullanıcıya
          // "geliştiriciye bildirin" yerine "kısıtları gevşetin/saat ekleyin" göster.
          if (INFEASIBLE_RE.test(resultText)) {
            resolve({
              ok: false,
              errorCode: 'NO_SOLUTION',
              message:
                'Kısıtlamalar çok sert veya veriler tutarsız (ör. bir sınıfa haftalık slot sayısından fazla ders). Bazı kısıtlamaları kaldırın/esnetin ya da ders saatlerini azaltın.',
              outputDir,
              rawError: `${resultText}\n${String(e)}`,
              durationMs: duration,
            });
            return;
          }
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


function isCosmeticNoiseLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  return (
    /Translation for specified language not loaded/i.test(t) ||
    /FET searched for the translation file/i.test(t) ||
    /Opening a file generated with a newer version/i.test(t) ||
    /^Your FET version:/i.test(t) ||
    /Belirtilen dil için çeviri yüklenmedi/i.test(t) ||
    /Daha yeni bir sürümle oluşturulmuş/i.test(t) ||
    /^Ders programı versiyonu/i.test(t) ||
    /^(Title|Başlık):\s*(FET\s+)?(warning|information|Uyarı|Bilgi)/i.test(t)
  );
}

function parseProgressLine(line: string): FetProgressEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  if (/starting timetable generation/i.test(trimmed)) {
    return { kind: 'progress', value: 0, message: 'Üretim başladı' };
  }
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
      } catch { }
    }
    return parts.join('\n\n');
  } catch {
    return '';
  }
}

type ErrCode = Extract<FetResult, { ok: false }>['errorCode'];

function classifyError(raw: string): { code: ErrCode; message: string } {
  // FET çözülemez veriyi "Cannot optimize/generate/precompute ... because the number of hours ..."
  // gibi ifadelerle bildirir; eski regex yalnızca "could not" yakalayıp bunları UNKNOWN'a
  // düşürüyordu (#17). Infeasibility kalıplarını NO_SOLUTION olarak sınıflandır (paylaşılan regex).
  if (INFEASIBLE_RE.test(raw)) {
    return {
      code: 'NO_SOLUTION',
      message:
        'Kısıtlamalar çok sert veya veriler tutarsız (ör. bir sınıfa haftalık slot sayısından fazla ders). Bazı kısıtlamaları kaldırın/esnetin ya da ders saatlerini azaltın.',
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
