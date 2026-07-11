import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DS_PROMPT = path.join(ROOT, 'Plans', 'dataset_samples', 'system_prompt.txt');
const SRV_PROMPT = path.join(ROOT, 'server', 'system_prompt.txt');
const SCHED_EXEC = path.join(ROOT, 'electron', 'ai', 'schedule-executor.ts');

// INFERENCE_CONTRACT.md §5: eğitim (dataset) ile inference (serving) system prompt'u BYTE-EŞ
// olmalı. Bu test o eşliği ve schedule_update action senkronunu korur — böylece system_prompt
// değişikliği (retrain-kritik) sessizce iki dosyayı ıraksatamaz.
describe('Inference contract — system prompt senkron', () => {
  it('dataset ve serving system_prompt.txt .strip() sonrası BYTE-EŞ', () => {
    const a = fs.readFileSync(DS_PROMPT, 'utf-8').trim();
    const b = fs.readFileSync(SRV_PROMPT, 'utf-8').trim();
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(500);
  });

  it('system_prompt CONTEXT alanları sabit 7-alan sırasını korur', () => {
    const p = fs.readFileSync(SRV_PROMPT, 'utf-8');
    // build_messages (inference.py) tam bu sırayı üretir; sıra sözleşmenin parçası.
    for (const field of ['TEACHERS', 'CLASSES', 'SUBJECTS', 'ROOMS', 'DAYS', 'HOURS_PER_DAY', 'CONSTRAINTS']) {
      expect(p, `CONTEXT alanı system_prompt'ta anılmıyor: ${field}`).toContain(field);
    }
  });

  it('schedule_update action listesi executor HANDLERS ile senkron', () => {
    // Executor'ı import ETMEDEN (better-sqlite3 ABI) kaynak dosyadan HANDLERS anahtarlarını çıkar.
    const src = fs.readFileSync(SCHED_EXEC, 'utf-8');
    const block = /const HANDLERS[\s\S]*?=\s*{([\s\S]*?)};/.exec(src);
    expect(block, 'HANDLERS bloğu bulunamadı').toBeTruthy();
    const handlerKeys = [...block![1].matchAll(/^\s*([a-z_]+)\s*:/gm)].map((m) => m[1]);
    expect(handlerKeys.length).toBeGreaterThanOrEqual(6);
    expect(handlerKeys).toContain('set_day_hours'); // yeni parity op'u

    // system_prompt'taki "action": "<a | b | c>" listesini çıkar.
    const prompt = fs.readFileSync(SRV_PROMPT, 'utf-8');
    const am = /"action":\s*"<([^>]+)>"/.exec(prompt);
    expect(am, 'system_prompt action listesi bulunamadı').toBeTruthy();
    const promptActions = am![1].split('|').map((s) => s.trim());

    // Her executor handler'ı system_prompt'ta listelenmeli (model üretebilsin) ve tersi.
    for (const k of handlerKeys) {
      expect(promptActions, `executor'da var ama system_prompt'ta yok: ${k}`).toContain(k);
    }
    for (const a of promptActions) {
      expect(handlerKeys, `system_prompt'ta var ama executor'da yok: ${a}`).toContain(a);
    }
  });
});
