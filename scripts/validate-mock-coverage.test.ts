import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { mockParseSync, type AIContext } from '../electron/ai/mock-server.js';
import type { AIResponse } from '../src/lib/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DS = path.resolve(__dirname, '..', 'Plans', 'dataset_samples');

type Sample = {
  file: string;
  context: AIContext;
  userRequest: string;
  expectedKind: NonNullable<AIResponse['kind']>;
};

function parseLine(file: string, raw: string): Sample | null {
  try {
    const row = JSON.parse(raw);
    const messages = row.messages as { role: string; content: string }[];
    if (!Array.isArray(messages) || messages.length < 2) return null;
    const userMsg = messages.find((m) => m.role === 'user');
    const asstMsg = messages.find((m) => m.role === 'assistant');
    if (!userMsg || !asstMsg) return null;

    const ctxMatch =
      /\[CONTEXT\]([\s\S]*?)\[\/CONTEXT\]/.exec(userMsg.content);
    const reqMatch =
      /\[USER_REQUEST\]([\s\S]*?)\[\/USER_REQUEST\]/.exec(userMsg.content);
    if (!ctxMatch || !reqMatch) return null;

    const ctxText = ctxMatch[1]!;
    const userRequest = reqMatch[1]!.trim();

    function parseList(name: string): string[] {
      const m = new RegExp(`${name}\\s*:\\s*(\\[[^\\]]*\\])`).exec(ctxText);
      if (!m) return [];
      try {
        return JSON.parse(m[1]!) as string[];
      } catch {
        return [];
      }
    }
    const hoursMatch = /HOURS_PER_DAY\s*:\s*(\d+)/.exec(ctxText);

    const context: AIContext = {
      teachers: parseList('TEACHERS'),
      classes: parseList('CLASSES'),
      subjects: parseList('SUBJECTS'),
      rooms: parseList('ROOMS'),
      days: parseList('DAYS'),
      hoursPerDay: hoursMatch ? parseInt(hoursMatch[1]!, 10) : 8,
    };

    let expectedKind: NonNullable<AIResponse['kind']> = 'constraint';
    try {
      const parsed = JSON.parse(asstMsg.content);
      expectedKind =
        (parsed.kind as NonNullable<AIResponse['kind']>) ?? 'constraint';
    } catch {
    }

    return { file, context, userRequest, expectedKind };
  } catch {
    return null;
  }
}

function pickRandom<T>(arr: T[], n: number, seed = 42): T[] {
  let s = seed;
  function rnd(): number {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) / 0xffffffff);
  }
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, n);
}

function runValidation(sampleSize = 200): number {
  const all: Sample[] = [];
  const files = fs.readdirSync(DS).filter((f) => f.endsWith('.jsonl'));
  for (const file of files) {
    const lines = fs.readFileSync(path.join(DS, file), 'utf-8').split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      const s = parseLine(file, t);
      if (s) all.push(s);
    }
  }
  console.log(`Toplam yüklenen örnek: ${all.length}`);

  const sample = pickRandom(all, Math.min(sampleSize, all.length));
  console.log(`Örneklenen: ${sample.length}`);

  let fullMatch = 0;
  let partial = 0;
  let fail = 0;
  const byKind: Record<
    string,
    { total: number; full: number; partial: number }
  > = {};
  const failures: {
    file: string;
    req: string;
    expected: string;
    got: string;
  }[] = [];

  for (const s of sample) {
    let res: AIResponse;
    try {
      res = mockParseSync(s.userRequest, s.context);
    } catch {
      fail++;
      continue;
    }

    const k = s.expectedKind;
    if (!byKind[k]) byKind[k] = { total: 0, full: 0, partial: 0 };
    byKind[k]!.total++;

    const gotKind = res.kind ?? 'constraint';

    let isFull = false;
    let isPartial = false;

    if (gotKind === k) {
      if (gotKind === 'constraint') {
        const cr = res as { constraints: unknown[]; unresolved: string[] };
        if (cr.constraints.length > 0) {
          isFull = true;
        } else if (cr.unresolved.length > 0) {
          isPartial = true;
        }
      } else {
        isFull = true;
      }
    } else {
      const interchangeable =
        (k === 'tool_call' && gotKind === 'query') ||
        (k === 'query' && gotKind === 'tool_call') ||
        (k === 'data_mutation' && gotKind === 'schedule_update') ||
        (k === 'schedule_update' && gotKind === 'data_mutation');
      if (interchangeable) isPartial = true;
    }

    if (isFull) {
      fullMatch++;
      byKind[k]!.full++;
    } else if (isPartial) {
      partial++;
      byKind[k]!.partial++;
    } else {
      fail++;
      if (failures.length < 15) {
        failures.push({
          file: s.file,
          req: s.userRequest.slice(0, 80),
          expected: k,
          got: gotKind,
        });
      }
    }
  }

  const total = sample.length;
  const fullPct = ((fullMatch / total) * 100).toFixed(1);
  const partialPct = ((partial / total) * 100).toFixed(1);
  const anyPct = (((fullMatch + partial) / total) * 100).toFixed(1);

  console.log('\n=== Mock Coverage Raporu ===');
  console.log(`Tam eşleşme     : ${fullMatch}/${total} (%${fullPct})`);
  console.log(`Kısmi           : ${partial}/${total} (%${partialPct})`);
  console.log(`Toplam anlaşıldı: ${fullMatch + partial}/${total} (%${anyPct})`);
  console.log(`Başarısız       : ${fail}/${total}`);

  console.log('\nKategori bazında:');
  for (const [kind, info] of Object.entries(byKind)) {
    const pct =
      info.total > 0 ? ((info.full / info.total) * 100).toFixed(1) : '0';
    console.log(
      `  ${kind.padEnd(20)} tam: ${info.full}/${info.total} (%${pct}), kısmi: ${info.partial}`,
    );
  }

  if (failures.length > 0) {
    console.log('\nİlk 15 başarısız örnek:');
    for (const f of failures) {
      console.log(`  [${f.file}] (${f.expected}→${f.got}) ${f.req}`);
    }
  }

  const overallPct = ((fullMatch + partial) / total) * 100;
  console.log(`\nMock coverage: %${anyPct} (regresyon eşiği: %${MIN_COVERAGE_PCT}).`);
  return overallPct;
}

// mock-server üretimde KULLANILMAZ (gerçek istekler VPS'teki fine-tuned LLM'e gider); bu yalnız
// test-only deterministik bir yaklaşımlayıcıdır. Eşik gerçek ölçülen coverage'a göre bir
// REGRESYON GUARD'ıdır (eskiden test assertion'sızdı ve iddia edilen %50 tutmadığı halde yeşil
// geçiyordu). Seed sabit → sonuç deterministik; mock-server bir refactor ile bozulursa bu alt
// sınır yakalar. Kaliteyi yükseltmek istemek = mock parser'ı geliştirmek (ayrı iş).
const MIN_COVERAGE_PCT = 24;

describe('Mock Coverage Validator (200 sabit-seed dataset örnek)', () => {
  it(`mock-server, dataset örneklerinin en az %${MIN_COVERAGE_PCT}'sini doğru kategoriye parse eder (regresyon guard)`, () => {
    const pct = runValidation(200);
    expect(pct).toBeGreaterThanOrEqual(MIN_COVERAGE_PCT);
  });
});
